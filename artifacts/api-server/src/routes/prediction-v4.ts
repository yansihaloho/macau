import { Router } from "express";
import { db } from "@workspace/db";
import { drawHistoryTable, predictionHistoryTable } from "@workspace/db";
import { desc, and, eq, inArray, like } from "drizzle-orm";
import { generateV4Prediction } from "../analytics/v4/predictor";
import { loadEngineWeights } from "../analytics/v4/self-learning";

const router = Router();

// Filter only V4 records from shared prediction_history table
const isV4 = like(predictionHistoryTable.engineBreakdown, '%"source":"v4"%');

// ─── Helper: batch-resolve pending predictions against actual draw results ───
async function resolvePendingV4(): Promise<void> {
  const pending = await db
    .select({
      id: predictionHistoryTable.id,
      date: predictionHistoryTable.date,
      period: predictionHistoryTable.period,
      prediction: predictionHistoryTable.prediction,
    })
    .from(predictionHistoryTable)
    .where(and(eq(predictionHistoryTable.status, "pending"), isV4))
    .limit(200);

  if (pending.length === 0) return;

  // Group by date for efficient batch DB queries
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
    const len = Math.min(predNum.length, actualNum.length, 4);
    for (let i = 0; i < len; i++) {
      if (predNum[i] === actualNum[i]) matched++;
    }
    const accuracy = matched / 4;

    await db
      .update(predictionHistoryTable)
      .set({
        actualResult: actualNum,
        matchedDigits: matched,
        accuracy,
        status: matched === 4 ? "exact" : matched > 0 ? "partial" : "miss",
      })
      .where(eq(predictionHistoryTable.id, pred.id));
  }
}

// ─── GET /prediction/v4/generate ─────────────────────────────────────────────
router.get("/v4/generate", async (req, res) => {
  const period = typeof req.query["period"] === "string" ? req.query["period"] : "00:01";
  const skipBacktest = req.query["skipBacktest"] !== "false";

  try {
    const rows = await db
      .select({ date: drawHistoryTable.date, period: drawHistoryTable.period, result: drawHistoryTable.result })
      .from(drawHistoryTable)
      .orderBy(desc(drawHistoryTable.date), desc(drawHistoryTable.period))
      .limit(5000);

    const allDraws = rows.reverse().map((r) => ({ date: r.date, period: r.period, result: r.result }));
    // *** KEY FIX: filter to only this session's historical draws ***
    // Each session (00:01, 13:00, 16:00, etc.) has its own pattern
    const draws = allDraws.filter((r) => r.period === period);
    const result = await generateV4Prediction(draws, period, skipBacktest);

    // Auto-save when a valid prediction is produced
    if (!result.noSignal && result.prediction) {
      const today = new Date().toISOString().slice(0, 10);
      const engineBreakdown = JSON.stringify({
        source: "v4",
        predictionId: result.predictionId,
        confidence: result.confidence,
        breakdown: result.confidenceBreakdown,
      });

      // Only upsert into pending records; resolved records are kept intact
      const existingPending = await db
        .select({ id: predictionHistoryTable.id })
        .from(predictionHistoryTable)
        .where(and(
          eq(predictionHistoryTable.date, today),
          eq(predictionHistoryTable.period, period),
          eq(predictionHistoryTable.status, "pending"),
          isV4,
        ))
        .limit(1);

      if (existingPending[0]) {
        await db
          .update(predictionHistoryTable)
          .set({ prediction: result.prediction, engineBreakdown })
          .where(eq(predictionHistoryTable.id, existingPending[0].id));
      } else {
        await db.insert(predictionHistoryTable).values({
          date: today,
          period,
          prediction: result.prediction,
          engineBreakdown,
          status: "pending",
        });
      }

      req.log.info({
        predictionId: result.predictionId,
        period,
        confidence: result.confidence,
        prediction: result.prediction,
        noSignal: result.noSignal,
      }, "V4 prediction generated");
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "V4 prediction generation failed");
    res.status(500).json({
      error: "Gagal menghasilkan prediksi V4. Coba lagi.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── GET /prediction/v4/engine-stats ─────────────────────────────────────────
router.get("/v4/engine-stats", async (req, res) => {
  const period = typeof req.query["period"] === "string" ? req.query["period"] : "00:01";
  try {
    const { leaderboard } = await loadEngineWeights(period);
    res.json({ period, leaderboard, generatedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err }, "V4 engine-stats failed");
    res.status(500).json({ error: "Gagal memuat engine stats." });
  }
});

// ─── GET /prediction/v4/history ──────────────────────────────────────────────
router.get("/v4/history", async (req, res) => {
  const limit = req.query["limit"] ? Math.min(Number(req.query["limit"]), 500) : 100;
  const period = typeof req.query["period"] === "string" && req.query["period"] !== "all"
    ? req.query["period"]
    : null;

  try {
    // Auto-resolve pending predictions before returning history
    await resolvePendingV4();

    const whereClause = period
      ? and(isV4, eq(predictionHistoryTable.period, period))
      : isV4;

    const history = await db
      .select()
      .from(predictionHistoryTable)
      .where(whereClause)
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(limit);

    // Parse confidence from engineBreakdown for each record
    const enriched = history.map((r) => {
      let confidence: number | null = null;
      try {
        const data = JSON.parse(r.engineBreakdown ?? "{}") as Record<string, unknown>;
        confidence = typeof data["confidence"] === "number" ? data["confidence"] : null;
      } catch { /* ignore */ }
      return { ...r, confidence };
    });

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "V4 history failed");
    res.status(500).json({ error: "Gagal memuat riwayat V4." });
  }
});

// ─── GET /prediction/v4/accuracy ─────────────────────────────────────────────
router.get("/v4/accuracy", async (req, res) => {
  try {
    const all = await db
      .select({
        id: predictionHistoryTable.id,
        date: predictionHistoryTable.date,
        period: predictionHistoryTable.period,
        prediction: predictionHistoryTable.prediction,
        actualResult: predictionHistoryTable.actualResult,
        matchedDigits: predictionHistoryTable.matchedDigits,
        accuracy: predictionHistoryTable.accuracy,
        status: predictionHistoryTable.status,
        createdAt: predictionHistoryTable.createdAt,
        engineBreakdown: predictionHistoryTable.engineBreakdown,
      })
      .from(predictionHistoryTable)
      .where(isV4)
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(1000);

    const resolved = all.filter((r) => r.accuracy !== null);
    const pending = all.filter((r) => r.status === "pending").length;

    // Hit rate tiers
    const exact = resolved.filter((r) => (r.matchedDigits ?? 0) === 4).length;
    const hit3d = resolved.filter((r) => (r.matchedDigits ?? 0) === 3).length;
    const hit2d = resolved.filter((r) => (r.matchedDigits ?? 0) === 2).length;
    const hit1d = resolved.filter((r) => (r.matchedDigits ?? 0) === 1).length;
    const miss = resolved.filter((r) => (r.matchedDigits ?? 0) === 0).length;

    const n = resolved.length;
    const exactRate = n > 0 ? exact / n : 0;
    const hit3dRate = n > 0 ? hit3d / n : 0;
    const hit2dRate = n > 0 ? hit2d / n : 0;
    const hit1dRate = n > 0 ? hit1d / n : 0;
    const anyHitRate = n > 0 ? (exact + hit3d + hit2d + hit1d) / n : 0;
    const avgMatchedDigits = n > 0 ? resolved.reduce((s, r) => s + (r.matchedDigits ?? 0), 0) / n : 0;
    const avgAccuracy = n > 0 ? resolved.reduce((s, r) => s + (r.accuracy ?? 0), 0) / n : 0;

    // Per-digit accuracy (positional match rates)
    const digitHits = [0, 0, 0, 0];
    let digitTotal = 0;
    for (const r of resolved) {
      if (!r.prediction || !r.actualResult) continue;
      digitTotal++;
      for (let i = 0; i < 4; i++) {
        if ((r.prediction[i] ?? "") === (r.actualResult[i] ?? "")) digitHits[i]++;
      }
    }
    const perDigitRate = digitHits.map((h) => (digitTotal > 0 ? h / digitTotal : 0));

    // Rolling windows
    const now = Date.now();
    const d30 = now - 30 * 86400000;
    const d90 = now - 90 * 86400000;
    const r30 = resolved.filter((r) => new Date(r.createdAt).getTime() > d30);
    const r90 = resolved.filter((r) => new Date(r.createdAt).getTime() > d90);
    const anyHitRate30d = r30.length > 0 ? r30.filter((r) => (r.matchedDigits ?? 0) >= 1).length / r30.length : 0;
    const anyHitRate90d = r90.length > 0 ? r90.filter((r) => (r.matchedDigits ?? 0) >= 1).length / r90.length : 0;

    // Avg confidence of saved predictions
    const confidences: number[] = [];
    for (const r of all) {
      try {
        const data = JSON.parse(r.engineBreakdown ?? "{}") as Record<string, unknown>;
        if (typeof data["confidence"] === "number") confidences.push(data["confidence"]);
      } catch { /* ignore */ }
    }
    const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    // Per-period breakdown
    const periodMap = new Map<string, { total: number; hit: number; exact: number }>();
    for (const r of resolved) {
      const entry = periodMap.get(r.period) ?? { total: 0, hit: 0, exact: 0 };
      entry.total++;
      if ((r.matchedDigits ?? 0) >= 1) entry.hit++;
      if ((r.matchedDigits ?? 0) === 4) entry.exact++;
      periodMap.set(r.period, entry);
    }
    const byPeriod = Object.fromEntries(
      [...periodMap.entries()].map(([p, v]) => [p, {
        total: v.total,
        hitRate: v.total > 0 ? v.hit / v.total : 0,
        exactRate: v.total > 0 ? v.exact / v.total : 0,
      }])
    );

    res.json({
      total: all.length,
      pending,
      resolved: n,
      exact,
      hit3d,
      hit2d,
      hit1d,
      miss,
      exactRate,
      hit3dRate,
      hit2dRate,
      hit1dRate,
      anyHitRate,
      avgMatchedDigits,
      avgAccuracy,
      anyHitRate30d,
      anyHitRate90d,
      avgConfidence,
      perDigitRate,
      byPeriod,
    });
  } catch (err) {
    req.log.error({ err }, "V4 accuracy failed");
    res.status(500).json({ error: "Gagal memuat statistik akurasi V4." });
  }
});

export default router;
