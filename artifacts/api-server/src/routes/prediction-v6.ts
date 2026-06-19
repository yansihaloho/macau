import { Router } from "express";
import { db } from "@workspace/db";
import { drawHistoryTable, predictionHistoryTable } from "@workspace/db";
import { desc, and, eq, inArray, like } from "drizzle-orm";
import { generateV6Prediction } from "../analytics/v6/predictor";

const router = Router();
const isV6 = like(predictionHistoryTable.engineBreakdown, '%"source":"v6"%');

async function resolvePendingV6(): Promise<void> {
  const pending = await db
    .select({ id: predictionHistoryTable.id, date: predictionHistoryTable.date, period: predictionHistoryTable.period, prediction: predictionHistoryTable.prediction })
    .from(predictionHistoryTable)
    .where(and(eq(predictionHistoryTable.status, "pending"), isV6))
    .limit(200);

  if (!pending.length) return;

  const dateGroups = new Map<string, string[]>();
  for (const p of pending) {
    const arr = dateGroups.get(p.date) ?? [];
    arr.push(p.period);
    dateGroups.set(p.date, arr);
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
  for (const r of actuals) actualMap.set(`${r.date}|${r.period}`, r.result);

  for (const pred of pending) {
    const actualNum = actualMap.get(`${pred.date}|${pred.period}`);
    if (!actualNum) continue;
    let matched = 0;
    for (let i = 0; i < 4; i++) if (pred.prediction[i] === actualNum[i]) matched++;
    await db.update(predictionHistoryTable).set({
      actualResult: actualNum,
      matchedDigits: matched,
      accuracy: matched / 4,
      status: matched === 4 ? "exact" : matched > 0 ? "partial" : "miss",
    }).where(eq(predictionHistoryTable.id, pred.id));
  }
}

// ─── GET /prediction/v6/generate ─────────────────────────────────────────────

router.get("/v6/generate", async (req, res) => {
  const period = typeof req.query["period"] === "string" ? req.query["period"] : "00:01";
  const skipBacktest = req.query["skipBacktest"] !== "false";

  try {
    const rows = await db
      .select({ date: drawHistoryTable.date, period: drawHistoryTable.period, result: drawHistoryTable.result })
      .from(drawHistoryTable)
      .orderBy(desc(drawHistoryTable.date), desc(drawHistoryTable.period));

    const result = await generateV6Prediction(rows as { date: string; period: string; result: string }[], period, skipBacktest);

    if (result.prediction) {
      const today = new Date().toISOString().slice(0, 10);
      const engineBreakdown = JSON.stringify({
        source: "v6",
        confidence: result.confidence,
        signalEngines: result.signalEngines,
        activeEngines: result.activeEngines,
        engines: result.engines.map(e => ({ id: e.id, label: e.label, signal: e.signal, contributionPct: e.contributionPct, topCandidate: e.topCandidate })),
        confidenceBreakdown: result.confidenceBreakdown,
      });
      await db.insert(predictionHistoryTable).values({
        date: today, period, prediction: result.prediction,
        engineBreakdown, status: "pending",
      }).onConflictDoNothing();
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "V6 generate failed");
    res.status(500).json({ error: "V6 prediction failed" });
  }
});

// ─── GET /prediction/v6/history ───────────────────────────────────────────────

router.get("/v6/history", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const period = typeof req.query["period"] === "string" && req.query["period"] !== "all"
    ? req.query["period"] : null;

  try {
    await resolvePendingV6();
    const rows = await db
      .select()
      .from(predictionHistoryTable)
      .where(period ? and(isV6, eq(predictionHistoryTable.period, period)) : isV6)
      .orderBy(desc(predictionHistoryTable.createdAt))
      .limit(limit);

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
    req.log.error({ err }, "V6 history failed");
    res.status(500).json({ error: "Failed" });
  }
});

// ─── GET /prediction/v6/backtest ──────────────────────────────────────────────

router.get("/v6/backtest", async (req, res) => {
  const period = typeof req.query["period"] === "string" ? req.query["period"] : "00:01";
  try {
    const rows = await db
      .select({ date: drawHistoryTable.date, period: drawHistoryTable.period, result: drawHistoryTable.result })
      .from(drawHistoryTable)
      .orderBy(desc(drawHistoryTable.date), desc(drawHistoryTable.period));
    const result = await generateV6Prediction(rows as { date: string; period: string; result: string }[], period, false);
    res.json({ backtest: result.backtest, errorAnalysis: result.errorAnalysis, dataPoints: result.dataPoints, period });
  } catch (err) {
    req.log.error({ err }, "V6 backtest failed");
    res.status(500).json({ error: "V6 backtest failed" });
  }
});

export default router;
