import { db } from "@workspace/db";
import { v4EngineStatsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { EngineResultV4, EngineLeaderboardEntry } from "./types";
import { logger } from "../../lib/logger";

export const ALL_ENGINE_NAMES = [
  "markov1","markov2","markov3","hmm","transition","poisson","globalfreq","localfreq",
  "multirecency","momentum","acceleration","repeat","daypattern","sessionpattern",
  "weeklypattern","monthlypattern","correlation","digitpair","triplecorr","sumdigit",
  "balance","entropy","shannon","cycle","fourier","hotcold","streak","gapdist",
  "bayesian","conditional","posdep","montecarlo","bootstrap","consensus","adaptive",
  "metavoting","borda","weighted","recencydecay","hybrid",
];

const ENGINE_LABELS: Record<string, string> = {
  markov1: "Markov Chain Order-1", markov2: "Markov Chain Order-2", markov3: "Markov Chain Order-3",
  hmm: "Hidden Markov Model", transition: "Transition Matrix", poisson: "Poisson Gap Model",
  globalfreq: "Global Frequency", localfreq: "Local Frequency", multirecency: "Multi Window Recency",
  momentum: "Momentum", acceleration: "Acceleration", repeat: "Repeat Pattern",
  daypattern: "Day Pattern", sessionpattern: "Session Pattern", weeklypattern: "Weekly Pattern",
  monthlypattern: "Monthly Pattern", correlation: "Correlation Position",
  digitpair: "Digit Pair Correlation", triplecorr: "Triple Correlation",
  sumdigit: "Sum Digit Pattern", balance: "Balance Equilibrium", entropy: "Entropy Analysis",
  shannon: "Shannon Entropy", cycle: "Cycle Detection", fourier: "Fourier Cycle Detection",
  hotcold: "Hot Cold Number", streak: "Streak Analysis", gapdist: "Gap Distribution",
  bayesian: "Bayesian Probability", conditional: "Conditional Probability",
  posdep: "Position Dependency", montecarlo: "Monte Carlo Validation",
  bootstrap: "Bootstrap Validation", consensus: "Consensus Engine",
  adaptive: "Adaptive Ensemble", metavoting: "Meta Voting", borda: "Borda Count",
  weighted: "Weighted Score", recencydecay: "Recency Decay", hybrid: "Hybrid Statistical Engine",
};

// In-memory cache for engine stats
const statsCache: Map<string, {
  engineName: string; period: string; winCount: number; lossCount: number;
  accuracy30: number; accuracy100: number; accuracy300: number; accuracyGlobal: number;
  currentWeight: number; isActive: boolean; consecutiveLosses: number;
}> = new Map();

function cacheKey(engineName: string, period: string): string {
  return `${engineName}:${period}`;
}

export async function loadEngineWeights(period: string): Promise<{
  weights: Record<string, number>;
  active: Record<string, boolean>;
  leaderboard: EngineLeaderboardEntry[];
}> {
  try {
    const rows = await db
      .select()
      .from(v4EngineStatsTable)
      .where(eq(v4EngineStatsTable.period, period));

    for (const row of rows) {
      statsCache.set(cacheKey(row.engineName, period), {
        engineName: row.engineName, period,
        winCount: row.winCount, lossCount: row.lossCount,
        accuracy30: row.accuracy30, accuracy100: row.accuracy100,
        accuracy300: row.accuracy300, accuracyGlobal: row.accuracyGlobal,
        currentWeight: row.currentWeight, isActive: row.isActive === 1,
        consecutiveLosses: row.consecutiveLosses,
      });
    }
  } catch (err) {
    logger.warn({ err }, "Could not load V4 engine weights from DB");
  }

  const weights: Record<string, number> = {};
  const active: Record<string, boolean> = {};
  const leaderboard: EngineLeaderboardEntry[] = [];

  for (let rank = 0; rank < ALL_ENGINE_NAMES.length; rank++) {
    const name = ALL_ENGINE_NAMES[rank]!;
    const cached = statsCache.get(cacheKey(name, period));
    if (cached) {
      weights[name] = cached.currentWeight;
      active[name] = cached.isActive;
      leaderboard.push({
        rank: rank + 1,
        engineName: name,
        label: ENGINE_LABELS[name] ?? name,
        winCount: cached.winCount,
        lossCount: cached.lossCount,
        accuracyGlobal: cached.accuracyGlobal,
        accuracy30: cached.accuracy30,
        accuracy100: cached.accuracy100,
        currentWeight: cached.currentWeight,
        isActive: cached.isActive,
        consecutiveLosses: cached.consecutiveLosses,
      });
    } else {
      weights[name] = 1.0;
      active[name] = true;
      leaderboard.push({
        rank: rank + 1, engineName: name, label: ENGINE_LABELS[name] ?? name,
        winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0,
        currentWeight: 1.0, isActive: true, consecutiveLosses: 0,
      });
    }
  }

  leaderboard.sort((a, b) => b.accuracyGlobal - a.accuracyGlobal || b.currentWeight - a.currentWeight);
  for (let i = 0; i < leaderboard.length; i++) leaderboard[i]!.rank = i + 1;

  return { weights, active, leaderboard };
}

export async function updateEngineStatsAfterResult(
  period: string,
  engines: EngineResultV4[],
  topPrediction: string | null,
  actualResult: string | null
): Promise<void> {
  if (!actualResult || !topPrediction) return;

  const matchedDigits = topPrediction.split("").filter((d, i) => d === actualResult[i]).length;
  const isHit = matchedDigits >= 2;
  const hitRate = matchedDigits / 4;

  for (const eng of engines) {
    const key = cacheKey(eng.name, period);
    const current = statsCache.get(key) ?? {
      engineName: eng.name, period,
      winCount: 0, lossCount: 0,
      accuracy30: 0, accuracy100: 0, accuracy300: 0, accuracyGlobal: 0,
      currentWeight: 1.0, isActive: true, consecutiveLosses: 0,
    };

    const engTop = eng.candidates[0]?.number ?? "";
    const engMatchedDigits = engTop.split("").filter((d, i) => d === actualResult[i]).length;
    const engIsHit = engMatchedDigits >= 2;

    if (engIsHit) {
      current.winCount++;
      current.consecutiveLosses = 0;
    } else {
      current.lossCount++;
      current.consecutiveLosses++;
    }

    const total = current.winCount + current.lossCount;
    current.accuracyGlobal = total > 0 ? current.winCount / total : 0;

    const recentWindow = Math.min(30, total);
    current.accuracy30 = recentWindow > 0
      ? (current.accuracy30 * (recentWindow - 1) + (engIsHit ? 1 : 0)) / recentWindow
      : 0;
    current.accuracy100 = Math.min(100, total) > 0
      ? (current.accuracy100 * (Math.min(100, total) - 1) + (engIsHit ? 1 : 0)) / Math.min(100, total)
      : 0;

    // ENGINE HEALTH MONITOR: auto-deactivate after 300 consecutive bad draws
    if (current.consecutiveLosses >= 300) {
      current.isActive = false;
      logger.warn({ engine: eng.name }, "V4 Engine auto-deactivated after 300 consecutive losses");
    } else if (current.consecutiveLosses >= 100) {
      // Reduce weight after 100 consecutive losses
      current.currentWeight = Math.max(0.1, current.currentWeight * 0.9);
    } else if (engIsHit && current.accuracy30 > 0.20) {
      // Boost weight for high performers
      current.currentWeight = Math.min(3.0, current.currentWeight * 1.1);
    } else if (!engIsHit && current.accuracy30 < 0.05 && total > 10) {
      // Reduce weight for consistent underperformers
      current.currentWeight = Math.max(0.1, current.currentWeight * 0.95);
    }

    statsCache.set(key, current);

    try {
      const existing = await db.select({ id: v4EngineStatsTable.id })
        .from(v4EngineStatsTable)
        .where(and(
          eq(v4EngineStatsTable.engineName, eng.name),
          eq(v4EngineStatsTable.period, period)
        ))
        .limit(1);

      if (existing[0]) {
        await db.update(v4EngineStatsTable)
          .set({
            winCount: current.winCount, lossCount: current.lossCount,
            accuracy30: current.accuracy30, accuracy100: current.accuracy100,
            accuracy300: current.accuracy300, accuracyGlobal: current.accuracyGlobal,
            currentWeight: current.currentWeight,
            isActive: current.isActive ? 1 : 0,
            consecutiveLosses: current.consecutiveLosses,
          })
          .where(eq(v4EngineStatsTable.id, existing[0].id));
      } else {
        await db.insert(v4EngineStatsTable).values({
          engineName: eng.name, period,
          winCount: current.winCount, lossCount: current.lossCount,
          accuracy30: current.accuracy30, accuracy100: current.accuracy100,
          accuracy300: current.accuracy300, accuracyGlobal: current.accuracyGlobal,
          currentWeight: current.currentWeight,
          isActive: current.isActive ? 1 : 0,
          consecutiveLosses: current.consecutiveLosses,
        });
      }
    } catch (err) {
      logger.warn({ err, engine: eng.name }, "Failed to persist V4 engine stats");
    }
  }
}
