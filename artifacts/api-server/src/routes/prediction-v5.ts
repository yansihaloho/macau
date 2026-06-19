import { Router } from "express";
import { db } from "@workspace/db";
import { drawHistoryTable, predictionHistoryTable } from "@workspace/db";
import { desc, and, eq, inArray, like } from "drizzle-orm";
import { generateV5Prediction } from "../analytics/v5/predictor";

const router = Router();

const isV5 = like(predictionHistoryTable.engineBreakdown, '%"source":"v5"%');

// ─── Helper: resolve pending V5 predictions ──────────────────────────────────

async function resolvePendingV5(): Promise<void> {
  const pending = await db
    .select({
      id: predictionHistoryTable.id,
      date: predictionHistoryTable.date,
      period: predictionHistoryTable.period,
      prediction: predictionHistoryTable.prediction,
    })
    .from(predictionHistoryTable)
    .where(and(eq(predictionHistoryTable.status, "pending"), isV5))
    .limit(200);

  if (pending.length === 0) return;

  const dateGroups = new Map<string, string[]>();
  for (const p of pending) {
    const periods = dateGroups.get(p.date) ?? [];
    periods.push(p.period);
    dateGroups.set(p.date, periods);
  }

  const actuals: { date: string; period: string; result: string }[] = [];
  for (const [date, periods] of dateGroups) {
    const rows = await db
      .select({ date: drawHistoryTable.date, period: drawHistoryTable.period, result: drawHistoryTable.result })
      .from(drawHistoryTable)
      .where(and(eq(drawHistoryTable.date, date), inArray(drawHistoryTable.period, periods)));
    actuals.push(...rows);
  }

  const actualMap = new Map<string, string>();
  for (const row of actuals) actualMap.set(`${row.date}|${row.period}`, row.result);

  for (const pred of pending) {
    const actualNum = actualMap.get(`${pred.date}|${pred.period}`);
    if (!actualNum) continue;
    const predNum = pred.prediction;
    let matched = 0;
    for (let i = 0; i < 4; i++) if (predNum[i] === actualNum[i]) matched++;
    await db
      .update(predictionHistoryTable)
      .set({
        actualResult: actualNum,
        matchedDigits: matched,
        accuracy: matched / 4,
        status: matched === 4 ? "exact" : matched > 0 ? "partial" : "miss",
      })
      .where(eq(predictionHistoryTable.id, pred.id));
  }
}

// ─── GET /prediction/v5/generate ─────────────────────────────────────────────

router.get("/v5/generate", async (req, res) => {
  const period = typeof req.query["period"] === "string" ? req.query["period"] : "00:01";
  const skipBacktest = req.query["skipBacktest"] !== "false";

  try {
    const rows = await db
      .select({ date: drawHistoryTable.date, period: drawHistoryTable.period, result: drawHistoryTable.result })
      .from(drawHistoryTable)
      .orderBy(desc(drawHistoryTable.date), desc(drawHistoryTable.period));

    const draws = rows as { date: string; period: string; result: string }[];
    const result = await generateV5Prediction(draws, period, skipBacktest);

    // Persist to prediction_history if we got a real prediction
    if (result.prediction) {
      const today = new Date().toISOString().slice(0, 10);
      const engineBreakdown = JSON.stringify({
        source: "v5",
        confidence: result.confidence,
        signalEngines: result.signalEngines,
        activeEngines: result.activeEngines,
        engines: result.engineContributions.map(e => ({
          id: e.id,
          label: e.label,
          signal: e.signal,
          contributionPct: e.contributionPct,
          topCandidate: e.topCandidate,
        })),
        confidenceBreakdown: result.confidenceBreakdown,
      });

      await db.insert(predictionHistoryTable).values({
        date: today,
        period,
        prediction: result.prediction,
        engineBreakdown,
        status: "pending",
      }).onConflictDoNothing();
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "V5 generate failed");
    res.status(500).json({ error: "V5 prediction failed" });
  }
});

// ─── GET /prediction/v5/history ───────────────────────────────────────────────

router.get("/v5/history", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const period = typeof req.query["period"] === "string" && req.query["period"] !== "all"
    ? req.query["period"] : null;

  try {
    await resolvePendingV5();

    let query = db
      .select()
      .from(predictionHistoryTable)
      .where(period ? and(isV5, eq(predictionHistoryTable.period, period)) : isV5)
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(limit);

    const rows = await query;
    const mapped = rows.map(r => {
      let confidence: number | null = null;
      try {
        const bd = JSON.parse(r.engineBreakdown ?? "{}") as Record<string, unknown>;
        if (typeof bd["confidence"] === "number") confidence = bd["confidence"];
      } catch { /* ignore */ }
      return { ...r, confidence };
    });

    res.json(mapped);
  } catch (err) {
    req.log.error({ err }, "V5 history failed");
    res.status(500).json({ error: "Failed to fetch V5 history" });
  }
});

// ─── GET /prediction/v5/backtest ──────────────────────────────────────────────

router.get("/v5/backtest", async (req, res) => {
  const period = typeof req.query["period"] === "string" ? req.query["period"] : "00:01";

  try {
    const rows = await db
      .select({ date: drawHistoryTable.date, period: drawHistoryTable.period, result: drawHistoryTable.result })
      .from(drawHistoryTable)
      .orderBy(desc(drawHistoryTable.date), desc(drawHistoryTable.period));

    const draws = rows as { date: string; period: string; result: string }[];
    const result = await generateV5Prediction(draws, period, false);
    res.json({ backtest: result.backtest, dataPoints: result.dataPoints, period });
  } catch (err) {
    req.log.error({ err }, "V5 backtest failed");
    res.status(500).json({ error: "V5 backtest failed" });
  }
});

export default router;
