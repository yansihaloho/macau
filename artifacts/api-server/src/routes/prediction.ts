import { Router } from "express";
import { db } from "@workspace/db";
import { drawHistoryTable, predictionHistoryTable } from "@workspace/db";
import { eq, desc, and, isNotNull, inArray, like } from "drizzle-orm";
import type { FlatDraw } from "../analytics/engine";
import { generatePrediction, computeAdaptiveWeights } from "../analytics/prediction";
import { runPredictionV3 } from "../analytics/v3/predictor";

const router = Router();

async function getAllDraws(): Promise<FlatDraw[]> {
  return db
    .select({
      date: drawHistoryTable.date,
      period: drawHistoryTable.period,
      result: drawHistoryTable.result,
    })
    .from(drawHistoryTable)
    .orderBy(drawHistoryTable.date, drawHistoryTable.period);
}

router.get("/prediction/generate", async (req, res) => {
  const period = (req.query["period"] as string | undefined) ?? "00:01";

  try {
    const allDraws = await getAllDraws();
    // *** KEY FIX: filter to only this session's historical draws ***
    // Each session (00:01, 13:00, 16:00, etc.) has its own statistical pattern
    const draws = allDraws.filter(d => d.period === period);

    // Get adaptive weights from resolved prediction history
    const recentPreds = await db
      .select({
        engineBreakdown: predictionHistoryTable.engineBreakdown,
        accuracy: predictionHistoryTable.accuracy,
        createdAt: predictionHistoryTable.createdAt,
      })
      .from(predictionHistoryTable)
      .where(isNotNull(predictionHistoryTable.accuracy))
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(100);

    const engineWeights = computeAdaptiveWeights(recentPreds);
    const result = generatePrediction(draws, period, engineWeights);

    // Persist prediction — only ONE per (date, period); update if exists
    const today = new Date().toISOString().slice(0, 10);
    const engineBreakdown = JSON.stringify(
      Object.fromEntries(result.engines.map(e => [e.name, e.prediction]))
    );

    const existing = await db
      .select({ id: predictionHistoryTable.id })
      .from(predictionHistoryTable)
      .where(
        and(
          eq(predictionHistoryTable.date, today),
          eq(predictionHistoryTable.period, period)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Update existing prediction for today+period (re-run = refresh)
      await db
        .update(predictionHistoryTable)
        .set({ prediction: result.prediction, engineBreakdown, status: "pending" })
        .where(eq(predictionHistoryTable.id, existing[0].id));
    } else {
      await db.insert(predictionHistoryTable).values({
        date: today,
        period,
        prediction: result.prediction,
        engineBreakdown,
        status: "pending",
      });
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Prediction generation failed");
    res.status(500).json({ error: "Failed to generate prediction" });
  }
});

router.get("/prediction/history", async (req, res) => {
  const limit = req.query["limit"] ? Number(req.query["limit"]) : 50;

  try {
    // Resolve pending predictions in a single batched lookup (no N+1)
    const pending = await db
      .select({
        id: predictionHistoryTable.id,
        date: predictionHistoryTable.date,
        period: predictionHistoryTable.period,
        prediction: predictionHistoryTable.prediction,
      })
      .from(predictionHistoryTable)
      .where(eq(predictionHistoryTable.status, "pending"))
      .limit(200);

    if (pending.length > 0) {
      // Build composite keys to match date+period pairs
      type ActualRow = { date: string; period: string; result: string };
      const actuals: ActualRow[] = [];

      // Fetch all actuals in one query using OR conditions for each (date, period) pair
      // We group by date to minimize queries
      const dateGroups = new Map<string, string[]>();
      for (const p of pending) {
        const periods = dateGroups.get(p.date) ?? [];
        periods.push(p.period);
        dateGroups.set(p.date, periods);
      }

      for (const [date, periods] of dateGroups) {
        const rows = await db
          .select({
            date: drawHistoryTable.date,
            period: drawHistoryTable.period,
            result: drawHistoryTable.result,
          })
          .from(drawHistoryTable)
          .where(
            and(
              eq(drawHistoryTable.date, date),
              inArray(drawHistoryTable.period, periods)
            )
          );
        actuals.push(...rows);
      }

      // Build lookup map
      const actualMap = new Map<string, string>();
      for (const row of actuals) actualMap.set(`${row.date}|${row.period}`, row.result);

      // Update all resolved predictions
      for (const pred of pending) {
        const actualNum = actualMap.get(`${pred.date}|${pred.period}`);
        if (!actualNum) continue;

        const predNum = pred.prediction;
        let matched = 0;
        for (let i = 0; i < 4; i++) {
          if (predNum[i] === actualNum[i]) matched++;
        }
        const accuracy = matched / 4;

        await db
          .update(predictionHistoryTable)
          .set({
            actualResult: actualNum,
            matchedDigits: matched,
            accuracy,
            status: accuracy === 1 ? "exact" : accuracy > 0 ? "partial" : "miss",
          })
          .where(eq(predictionHistoryTable.id, pred.id));
      }
    }

    const history = await db
      .select()
      .from(predictionHistoryTable)
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(limit);

    res.json(history);
  } catch (err) {
    req.log.error({ err }, "Prediction history failed");
    res.status(500).json({ error: "Failed to fetch prediction history" });
  }
});

router.get("/prediction/accuracy", async (req, res) => {
  try {
    const all = await db
      .select({
        id: predictionHistoryTable.id,
        accuracy: predictionHistoryTable.accuracy,
        status: predictionHistoryTable.status,
        createdAt: predictionHistoryTable.createdAt,
        engineBreakdown: predictionHistoryTable.engineBreakdown,
      })
      .from(predictionHistoryTable)
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(500);

    const resolved = all.filter(r => r.accuracy !== null);
    const avgAccuracy =
      resolved.length > 0
        ? resolved.reduce((s, r) => s + (r.accuracy ?? 0), 0) / resolved.length
        : 0;

    const cutoff7d = new Date();
    cutoff7d.setDate(cutoff7d.getDate() - 7);
    const r7d = resolved.filter(r => r.createdAt > cutoff7d);
    const avg7d =
      r7d.length > 0 ? r7d.reduce((s, r) => s + (r.accuracy ?? 0), 0) / r7d.length : 0;

    const cutoff30d = new Date();
    cutoff30d.setDate(cutoff30d.getDate() - 30);
    const r30d = resolved.filter(r => r.createdAt > cutoff30d);
    const avg30d =
      r30d.length > 0 ? r30d.reduce((s, r) => s + (r.accuracy ?? 0), 0) / r30d.length : 0;

    const engineWeights = computeAdaptiveWeights(
      resolved.map(r => ({
        engineBreakdown: r.engineBreakdown,
        accuracy: r.accuracy,
        createdAt: r.createdAt,
      }))
    );

    res.json({
      total: all.length,
      resolved: resolved.length,
      avgAccuracy: Math.round(avgAccuracy * 1000) / 1000,
      avg7d: Math.round(avg7d * 1000) / 1000,
      avg30d: Math.round(avg30d * 1000) / 1000,
      engineWeights,
    });
  } catch (err) {
    req.log.error({ err }, "Accuracy stats failed");
    res.status(500).json({ error: "Failed to fetch accuracy stats" });
  }
});

// ─── V3 Smart Prediction AI ───────────────────────────────────────────────

router.get("/prediction/v3/generate", async (req, res) => {
  const period = (req.query["period"] as string | undefined) ?? "00:01";
  const skipBacktest = req.query["skipBacktest"] === "true";

  try {
    const allDraws = await getAllDraws();
    // *** KEY FIX: filter to only this session's historical draws ***
    const draws = allDraws.filter(d => d.period === period);
    const recentPreds = await db
      .select({
        engineBreakdown: predictionHistoryTable.engineBreakdown,
        matchedDigits: predictionHistoryTable.matchedDigits,
      })
      .from(predictionHistoryTable)
      .where(isNotNull(predictionHistoryTable.matchedDigits))
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(300);

    const result = await runPredictionV3(draws as Parameters<typeof runPredictionV3>[0], period, recentPreds, skipBacktest);

    // Persist V3 prediction to DB (one per date+period, update if exists)
    if (!result.noSignal && result.prediction) {
      const today = new Date().toISOString().slice(0, 10);
      const engineBreakdown = JSON.stringify({
        source: "v3",
        confidence: result.confidence,
        engineAgreement: result.confidenceBreakdown?.agreement ?? 0,
        digits: result.digitExplanations?.map((pos: Array<{digit:string}>) => pos[0]?.digit ?? "?").join(""),
      });

      const existing = await db
        .select({ id: predictionHistoryTable.id, status: predictionHistoryTable.status })
        .from(predictionHistoryTable)
        .where(
          and(
            eq(predictionHistoryTable.date, today),
            eq(predictionHistoryTable.period, period),
            like(predictionHistoryTable.engineBreakdown, '%"source":"v3"%')
          )
        )
        .limit(1);

      if (existing[0] && existing[0].status === "pending") {
        await db
          .update(predictionHistoryTable)
          .set({ prediction: result.prediction, engineBreakdown })
          .where(eq(predictionHistoryTable.id, existing[0].id));
      } else if (!existing[0]) {
        await db.insert(predictionHistoryTable).values({
          date: today,
          period,
          prediction: result.prediction,
          engineBreakdown,
          status: "pending",
        });
      }
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "V3 prediction failed");
    res.status(500).json({ error: "V3 prediction failed" });
  }
});

router.get("/prediction/v3/backtest", async (req, res) => {
  const period = (req.query["period"] as string | undefined) ?? "00:01";
  try {
    const allDraws = await getAllDraws();
    const draws = allDraws.filter(d => d.period === period);
    const recentPreds = await db
      .select({
        engineBreakdown: predictionHistoryTable.engineBreakdown,
        matchedDigits: predictionHistoryTable.matchedDigits,
      })
      .from(predictionHistoryTable)
      .where(isNotNull(predictionHistoryTable.matchedDigits))
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(300);
    const result = await runPredictionV3(draws as Parameters<typeof runPredictionV3>[0], period, recentPreds, false);
    res.json({ backtest: result.backtest, dataPoints: result.dataPoints, period });
  } catch (err) {
    req.log.error({ err }, "V3 backtest failed");
    res.status(500).json({ error: "V3 backtest failed" });
  }
});

// ─── DELETE prediction record ──────────────────────────────────────────────

router.delete("/prediction/history/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db.delete(predictionHistoryTable).where(eq(predictionHistoryTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Delete prediction failed");
    res.status(500).json({ error: "Failed to delete prediction" });
  }
});

// ─── GET /prediction/today — all 6 sessions for today ─────────────────────

const ALL_SESSIONS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"] as const;

router.get("/prediction/today", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch today's predictions from history (V4 preferred, then V1)
    const historyRows = await db
      .select()
      .from(predictionHistoryTable)
      .where(eq(predictionHistoryTable.date, today))
      .orderBy(desc(predictionHistoryTable.createdAt));

    // Fetch today's actual draw results
    const actualRows = await db
      .select({ period: drawHistoryTable.period, result: drawHistoryTable.result })
      .from(drawHistoryTable)
      .where(eq(drawHistoryTable.date, today));

    const actualMap = new Map<string, string>();
    for (const row of actualRows) actualMap.set(row.period, row.result);

    // For each session, pick the best prediction record (V4 > V3 > V1)
    const sessions = ALL_SESSIONS.map((period) => {
      const periodRows = historyRows.filter(r => r.period === period);
      // Prefer V4 records
      const v4 = periodRows.find(r => r.engineBreakdown?.includes('"source":"v4"'));
      const best = v4 ?? periodRows[0] ?? null;

      const actual = actualMap.get(period) ?? null;

      // Compute match if we have both
      let matchedDigits: number | null = null;
      let accuracy: number | null = null;
      let status = best?.status ?? "none";

      if (best && actual && best.status === "pending") {
        let m = 0;
        for (let i = 0; i < 4; i++) {
          if ((best.prediction[i] ?? "") === (actual[i] ?? "")) m++;
        }
        matchedDigits = m;
        accuracy = m / 4;
        status = m === 4 ? "exact" : m > 0 ? "partial" : "miss";
      } else if (best) {
        matchedDigits = best.matchedDigits;
        accuracy = best.accuracy;
      }

      let confidence: number | null = null;
      try {
        const bd = JSON.parse(best?.engineBreakdown ?? "{}") as Record<string, unknown>;
        if (typeof bd["confidence"] === "number") confidence = bd["confidence"];
      } catch { /* ignore */ }

      return {
        period,
        prediction: best?.prediction ?? null,
        confidence,
        status,
        actualResult: actual,
        matchedDigits,
        accuracy,
        source: best?.engineBreakdown?.includes('"source":"v4"') ? "v4"
              : best?.engineBreakdown?.includes('"source":"v3"') ? "v3"
              : best ? "v1" : null,
        hasHistory: !!best,
        recordId: best?.id ?? null,
      };
    });

    res.json({ date: today, sessions });
  } catch (err) {
    req.log.error({ err }, "Today prediction failed");
    res.status(500).json({ error: "Failed to fetch today predictions" });
  }
});

export default router;
