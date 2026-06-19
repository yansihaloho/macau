import { db } from "@workspace/db";
import { drawHistoryTable, predictionHistoryTable } from "@workspace/db";
import { desc, and, eq, like } from "drizzle-orm";
import { generateV4Prediction } from "./analytics/v4/predictor";
import { syncYearToDb } from "./routes/sync";
import { logger } from "./lib/logger";

const ALL_PERIODS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"] as const;

async function getAllDraws() {
  const rows = await db
    .select({ date: drawHistoryTable.date, period: drawHistoryTable.period, result: drawHistoryTable.result })
    .from(drawHistoryTable)
    .orderBy(desc(drawHistoryTable.date), desc(drawHistoryTable.period))
    .limit(5000);
  return rows.reverse();
}

async function saveV4Prediction(period: string, result: Awaited<ReturnType<typeof generateV4Prediction>>) {
  if (result.noSignal || !result.prediction) return;

  const today = new Date().toISOString().slice(0, 10);
  const engineBreakdown = JSON.stringify({
    source: "v4",
    predictionId: result.predictionId,
    confidence: result.confidence,
    breakdown: result.confidenceBreakdown,
  });

  const isV4 = like(predictionHistoryTable.engineBreakdown, '%"source":"v4"%');

  const existing = await db
    .select({ id: predictionHistoryTable.id })
    .from(predictionHistoryTable)
    .where(and(
      eq(predictionHistoryTable.date, today),
      eq(predictionHistoryTable.period, period),
      eq(predictionHistoryTable.status, "pending"),
      isV4,
    ))
    .limit(1);

  if (existing[0]) {
    await db
      .update(predictionHistoryTable)
      .set({ prediction: result.prediction, engineBreakdown })
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
}

async function runAutoPredict() {
  logger.info("Auto-predict: starting data sync");
  try {
    const [r2025, r2026] = await Promise.all([syncYearToDb(2025), syncYearToDb(2026)]);
    logger.info({ inserted2025: r2025.inserted, inserted2026: r2026.inserted }, "Auto-predict: sync complete");
  } catch (err) {
    logger.warn({ err }, "Auto-predict: sync failed, proceeding with cached data");
  }

  const allDraws = await getAllDraws();
  logger.info({ draws: allDraws.length }, "Auto-predict: generating V4 predictions for all sessions");

  for (const period of ALL_PERIODS) {
    try {
      // *** KEY FIX: filter to only this session's historical draws ***
      const draws = allDraws.filter(d => d.period === period);
      const result = await generateV4Prediction(draws, period, true);
      await saveV4Prediction(period, result);
      logger.info({ period, prediction: result.prediction, confidence: result.confidence, noSignal: result.noSignal }, "Auto-predict: session done");
    } catch (err) {
      logger.warn({ err, period }, "Auto-predict: session failed");
    }
  }

  logger.info("Auto-predict: all sessions complete");
}

export function startScheduler() {
  // Run immediately on startup (after a short delay so DB is ready)
  setTimeout(() => {
    runAutoPredict().catch((err) => logger.warn({ err }, "Auto-predict initial run failed"));
  }, 10_000);

  // Run every 30 minutes to keep predictions fresh
  setInterval(() => {
    runAutoPredict().catch((err) => logger.warn({ err }, "Auto-predict scheduled run failed"));
  }, 30 * 60 * 1000);

  logger.info("Scheduler started: auto-predict every 30 minutes");
}
