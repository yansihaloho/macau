import type { FlatDraw } from "./engine";
import { computeMarkovChain, predictNextFirstDigit } from "./markov";

export interface EngineScore {
  name: string;
  prediction: string;
  weight: number;
  score: number;
}

export interface PredictionResult {
  prediction: string;
  confidence: number;
  period: string;
  engines: EngineScore[];
  topCandidates: Array<{ number: string; score: number }>;
  generatedAt: string;
}

// Engine weights — can be adapted by performance history
const DEFAULT_WEIGHTS: Record<string, number> = {
  markov: 0.25,
  frequency: 0.25,
  gap: 0.20,
  trend: 0.20,
  cycle: 0.10,
};

function padNum(n: number): string {
  return String(n).padStart(4, "0");
}

// Markov engine: use transition matrix to pick first digit, then fill from frequency
function markovEngine(draws: FlatDraw[], freq: Record<string, number>): string {
  if (draws.length === 0) return "0000";
  const { matrix } = computeMarkovChain(draws);
  const lastResult = draws[draws.length - 1].result;
  const firstDigit = predictNextFirstDigit(lastResult, matrix);

  // Pick top number starting with that digit
  const candidates = Object.entries(freq)
    .filter(([n]) => n.startsWith(firstDigit))
    .sort((a, b) => b[1] - a[1]);

  return candidates[0]?.[0] ?? (firstDigit + "000");
}

// Frequency engine: pick most frequent number
function frequencyEngine(freq: Record<string, number>): string {
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "0000";
}

// Gap engine: pick the number not seen for the longest time
function gapEngine(draws: FlatDraw[], freq: Record<string, number>): string {
  const lastSeenIdx: Record<string, number> = {};
  for (let i = 0; i < draws.length; i++) {
    lastSeenIdx[draws[i].result] = i;
  }
  // Among numbers that have appeared, find the one with largest gap
  const sorted = Object.entries(lastSeenIdx)
    .sort((a, b) => a[1] - b[1]); // smallest index = seen longest ago
  if (sorted[0]) return sorted[0][0];

  // Fallback to most frequent
  return frequencyEngine(freq);
}

// Trend engine: pick number with highest recent frequency increase
function trendEngine(draws: FlatDraw[]): string {
  if (draws.length < 10) return "0000";
  const recent = draws.slice(-30);
  const overall = draws;

  const recentFreq: Record<string, number> = {};
  for (const d of recent) recentFreq[d.result] = (recentFreq[d.result] ?? 0) + 1;

  const overallFreq: Record<string, number> = {};
  for (const d of overall) overallFreq[d.result] = (overallFreq[d.result] ?? 0) + 1;

  const trendScore = (n: string) =>
    (recentFreq[n] ?? 0) / 30 - (overallFreq[n] ?? 0) / overall.length;

  const best = Object.keys(recentFreq)
    .map(n => ({ n, score: trendScore(n) }))
    .sort((a, b) => b.score - a.score)[0];

  return best?.n ?? "0000";
}

// Cycle engine: look for numbers that appeared every ~N draws
function cycleEngine(draws: FlatDraw[], freq: Record<string, number>): string {
  if (draws.length < 20) return frequencyEngine(freq);

  const appearances: Record<string, number[]> = {};
  for (let i = 0; i < draws.length; i++) {
    const n = draws[i].result;
    if (!appearances[n]) appearances[n] = [];
    appearances[n].push(i);
  }

  let bestNumber = "";
  let bestCycleScore = Infinity;

  for (const [n, idxs] of Object.entries(appearances)) {
    if (idxs.length < 3) continue;
    const gaps: number[] = [];
    for (let i = 1; i < idxs.length; i++) gaps.push(idxs[i] - idxs[i - 1]);

    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const lastIdx = idxs[idxs.length - 1];
    const currentGap = draws.length - 1 - lastIdx;

    // Score = how close we are to a predicted reappearance
    const deviation = Math.abs(currentGap - avgGap);
    if (deviation < bestCycleScore) {
      bestCycleScore = deviation;
      bestNumber = n;
    }
  }

  return bestNumber || frequencyEngine(freq);
}

// Combine engine predictions into a final prediction using weighted voting
export function generatePrediction(
  draws: FlatDraw[],
  period: string = "00:01",
  engineWeights: Record<string, number> = DEFAULT_WEIGHTS
): PredictionResult {
  if (draws.length === 0) {
    return {
      prediction: "0000",
      confidence: 0,
      period,
      engines: [],
      topCandidates: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const freq: Record<string, number> = {};
  for (const d of draws) freq[d.result] = (freq[d.result] ?? 0) + 1;

  const weights = { ...DEFAULT_WEIGHTS, ...engineWeights };

  const enginePreds: Array<{ name: string; prediction: string; weight: number }> = [
    { name: "markov", prediction: markovEngine(draws, freq), weight: weights.markov ?? 0.25 },
    { name: "frequency", prediction: frequencyEngine(freq), weight: weights.frequency ?? 0.25 },
    { name: "gap", prediction: gapEngine(draws, freq), weight: weights.gap ?? 0.20 },
    { name: "trend", prediction: trendEngine(draws), weight: weights.trend ?? 0.20 },
    { name: "cycle", prediction: cycleEngine(draws, freq), weight: weights.cycle ?? 0.10 },
  ];

  // Weighted scoring: each engine votes for a set of candidate numbers
  const candidateScores: Record<string, number> = {};

  for (const ep of enginePreds) {
    // Primary prediction gets full weight
    candidateScores[ep.prediction] = (candidateScores[ep.prediction] ?? 0) + ep.weight;

    // Secondary candidates (digit-distance neighbors) get partial weight
    const num = parseInt(ep.prediction, 10);
    for (let delta = 1; delta <= 5; delta++) {
      const neighbor = padNum((num + delta) % 10000);
      const neighbor2 = padNum((num - delta + 10000) % 10000);
      candidateScores[neighbor] = (candidateScores[neighbor] ?? 0) + ep.weight * 0.1;
      candidateScores[neighbor2] = (candidateScores[neighbor2] ?? 0) + ep.weight * 0.1;
    }
  }

  const topCandidates = Object.entries(candidateScores)
    .map(([number, score]) => ({ number, score: Math.round(score * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const prediction = topCandidates[0]?.number ?? "0000";
  const maxPossibleScore = Object.values(weights).reduce((a, b) => a + b, 0);
  const rawConfidence = (topCandidates[0]?.score ?? 0) / maxPossibleScore;
  const confidence = Math.round(rawConfidence * 100) / 100;

  const engines: EngineScore[] = enginePreds.map(ep => ({
    name: ep.name,
    prediction: ep.prediction,
    weight: ep.weight,
    score: Math.round((candidateScores[ep.prediction] ?? 0) * 1000) / 1000,
  }));

  return {
    prediction,
    confidence,
    period,
    engines,
    topCandidates,
    generatedAt: new Date().toISOString(),
  };
}

// Compute adaptive engine weights based on recent accuracy
export function computeAdaptiveWeights(
  predHistory: Array<{
    engineBreakdown: string | null;
    accuracy: number | null;
    createdAt: Date;
  }>,
  windowDays: number = 7
): Record<string, number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const engineAccuracy: Record<string, { total: number; sum: number }> = {
    markov: { total: 0, sum: 0 },
    frequency: { total: 0, sum: 0 },
    gap: { total: 0, sum: 0 },
    trend: { total: 0, sum: 0 },
    cycle: { total: 0, sum: 0 },
  };

  for (const record of predHistory) {
    if (record.createdAt < cutoff || record.accuracy === null) continue;
    if (!record.engineBreakdown) continue;

    try {
      const breakdown = JSON.parse(record.engineBreakdown) as Record<string, string>;
      for (const [engine, pred] of Object.entries(breakdown)) {
        if (!engineAccuracy[engine]) continue;
        // Measure digit-level accuracy for this engine's prediction
        // We don't have per-engine actual here, but use overall accuracy as proxy
        engineAccuracy[engine].total++;
        engineAccuracy[engine].sum += record.accuracy;
      }
    } catch {
      // ignore parse errors
    }
  }

  const performances: Record<string, number> = {};
  let totalPerf = 0;

  for (const [engine, acc] of Object.entries(engineAccuracy)) {
    performances[engine] = acc.total > 0 ? acc.sum / acc.total : 0.25;
    totalPerf += performances[engine];
  }

  // Normalize to sum to 1
  const weights: Record<string, number> = {};
  for (const [engine, perf] of Object.entries(performances)) {
    weights[engine] = totalPerf > 0 ? Math.round((perf / totalPerf) * 1000) / 1000 : 0.2;
  }

  return weights;
}
