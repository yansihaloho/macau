import { Router } from "express";
import { db } from "@workspace/db";
import { drawHistoryTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { computeAdvancedAnalytics, computeHeatmap, type FlatDraw } from "../analytics/engine";
import { computeMarkovChain } from "../analytics/markov";

const router = Router();

const analyticsCache: Record<string, { data: unknown; fetchedAt: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const c = analyticsCache[key];
  if (c && Date.now() - c.fetchedAt < CACHE_TTL) return c.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  analyticsCache[key] = { data, fetchedAt: Date.now() };
}

// No artificial limit — fetch all draws for a given year (or all years)
async function getDraws(year?: number): Promise<FlatDraw[]> {
  const conditions = [];
  if (year) conditions.push(eq(drawHistoryTable.year, year));

  return db
    .select({
      date: drawHistoryTable.date,
      period: drawHistoryTable.period,
      result: drawHistoryTable.result,
    })
    .from(drawHistoryTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(drawHistoryTable.date, drawHistoryTable.period);
}

router.get("/analytics/advanced", async (req, res) => {
  const year = req.query["year"] ? Number(req.query["year"]) : undefined;
  const cacheKey = `advanced:${year ?? "all"}`;

  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const draws = await getDraws(year);
    if (draws.length === 0) {
      res.status(404).json({ error: "No data in database. Run /api/lottery/macau/sync first." });
      return;
    }
    const analytics = computeAdvancedAnalytics(draws);
    setCache(cacheKey, analytics);
    res.json(analytics);
  } catch (err) {
    req.log.error({ err }, "Advanced analytics failed");
    res.status(500).json({ error: "Failed to compute analytics" });
  }
});

router.get("/analytics/heatmap", async (req, res) => {
  const year = req.query["year"] ? Number(req.query["year"]) : undefined;
  const cacheKey = `heatmap:${year ?? "all"}`;

  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const draws = await getDraws(year);
    if (draws.length === 0) {
      res.status(404).json({ error: "No data. Run /api/lottery/macau/sync first." });
      return;
    }
    const heatmap = computeHeatmap(draws);
    setCache(cacheKey, heatmap);
    res.json(heatmap);
  } catch (err) {
    req.log.error({ err }, "Heatmap failed");
    res.status(500).json({ error: "Failed to compute heatmap" });
  }
});

router.get("/analytics/markov", async (req, res) => {
  const year = req.query["year"] ? Number(req.query["year"]) : undefined;
  const cacheKey = `markov:${year ?? "all"}`;

  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const draws = await getDraws(year);
    if (draws.length === 0) {
      res.status(404).json({ error: "No data. Run /api/lottery/macau/sync first." });
      return;
    }
    const markov = computeMarkovChain(draws);
    setCache(cacheKey, markov);
    res.json(markov);
  } catch (err) {
    req.log.error({ err }, "Markov chain failed");
    res.status(500).json({ error: "Failed to compute Markov chain" });
  }
});

export default router;
