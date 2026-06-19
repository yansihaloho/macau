import type { FlatDraw, BacktestMetrics, BacktestSummary } from "./types";
import { buildContext, runAllEngines } from "./engines";

// ─── Hit Check ────────────────────────────────────────────────────────────

function calcHits(prediction: string, actual: string) {
  const p = prediction;
  const a = actual;
  if (p.length !== 4 || a.length !== 4) {
    return { hitAs: false, hitKop: false, hitKepala: false, hitEkor: false, hit2D: false, hit3D: false, hit4D: false };
  }
  return {
    hitAs: p[0] === a[0],
    hitKop: p[1] === a[1],
    hitKepala: p[2] === a[2],
    hitEkor: p[3] === a[3],
    hit2D: p.slice(2) === a.slice(2),
    hit3D: p.slice(1) === a.slice(1),
    hit4D: p === a,
  };
}

function emptyMetrics(total: number): BacktestMetrics {
  return { total, hitAs: 0, hitKop: 0, hitKepala: 0, hitEkor: 0, hit2D: 0, hit3D: 0, hit4D: 0, hitRateAs: 0, hitRateKop: 0, hitRateKepala: 0, hitRateEkor: 0, hitRate2D: 0, hitRate3D: 0, hitRate4D: 0 };
}

function buildMetrics(entries: Array<{ hitAs: boolean; hitKop: boolean; hitKepala: boolean; hitEkor: boolean; hit2D: boolean; hit3D: boolean; hit4D: boolean }>): BacktestMetrics {
  const total = entries.length;
  if (total === 0) return emptyMetrics(0);
  const hitAs = entries.filter((e) => e.hitAs).length;
  const hitKop = entries.filter((e) => e.hitKop).length;
  const hitKepala = entries.filter((e) => e.hitKepala).length;
  const hitEkor = entries.filter((e) => e.hitEkor).length;
  const hit2D = entries.filter((e) => e.hit2D).length;
  const hit3D = entries.filter((e) => e.hit3D).length;
  const hit4D = entries.filter((e) => e.hit4D).length;
  return {
    total, hitAs, hitKop, hitKepala, hitEkor, hit2D, hit3D, hit4D,
    hitRateAs: hitAs / total, hitRateKop: hitKop / total,
    hitRateKepala: hitKepala / total, hitRateEkor: hitEkor / total,
    hitRate2D: hit2D / total, hitRate3D: hit3D / total, hitRate4D: hit4D / total,
  };
}

// ─── Fast Prediction (for backtest, avoids full engine overhead) ───────────

function fastPredict(draws: FlatDraw[], period: string): string | null {
  if (draws.length < 20) return null;
  const ctx = buildContext(draws, period, {});
  const engines = runAllEngines(ctx);
  const signalEngines = engines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 3) return null;

  // Simple ensemble: weighted sum of scores
  const scoreMap: Record<string, number> = {};
  const defaultWeight = 1 / signalEngines.length;
  for (const eng of signalEngines) {
    for (const c of eng.candidates.slice(0, 20)) {
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * defaultWeight;
    }
  }
  const sorted = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

// ─── Walk-Forward Backtest ─────────────────────────────────────────────────
// Uses 70% train / 15% validation / 15% test split
// For each draw in validation+test, use all prior draws as training data.
// Runs a fast prediction for each test draw to compute hit rates.

export function runWalkForwardBacktest(
  draws: FlatDraw[],
  period: string
): BacktestSummary | null {
  if (draws.length < 100) return null;

  const n = draws.length;
  const trainEnd = Math.floor(n * 0.70);
  const valEnd = Math.floor(n * 0.85);
  // test: [valEnd, n)

  type HitRecord = { hitAs: boolean; hitKop: boolean; hitKepala: boolean; hitEkor: boolean; hit2D: boolean; hit3D: boolean; hit4D: boolean };
  const trainHits: HitRecord[] = [];
  const valHits: HitRecord[] = [];
  const testHits: HitRecord[] = [];

  // For backtest, sample ~30 points from each split for speed
  const samplePoints = (start: number, end: number, maxSamples: number): number[] => {
    const total = end - start;
    if (total <= maxSamples) return Array.from({ length: total }, (_, i) => start + i);
    const step = Math.floor(total / maxSamples);
    return Array.from({ length: maxSamples }, (_, i) => start + i * step);
  };

  const trainSamples = samplePoints(20, trainEnd, 15);
  const valSamples = samplePoints(trainEnd, valEnd, 10);
  const testSamples = samplePoints(valEnd, n - 1, 10);

  for (const idx of trainSamples) {
    const trainingDraws = draws.slice(0, idx);
    const actual = draws[idx]?.result;
    if (!actual || actual.length !== 4) continue;
    const pred = fastPredict(trainingDraws, period);
    if (pred) trainHits.push(calcHits(pred, actual));
  }

  for (const idx of valSamples) {
    const trainingDraws = draws.slice(0, idx);
    const actual = draws[idx]?.result;
    if (!actual || actual.length !== 4) continue;
    const pred = fastPredict(trainingDraws, period);
    if (pred) valHits.push(calcHits(pred, actual));
  }

  for (const idx of testSamples) {
    const trainingDraws = draws.slice(0, idx);
    const actual = draws[idx]?.result;
    if (!actual || actual.length !== 4) continue;
    const pred = fastPredict(trainingDraws, period);
    if (pred) testHits.push(calcHits(pred, actual));
  }

  const trainAcc = trainHits.length > 0 ? trainHits.filter((h) => h.hitEkor).length / trainHits.length : 0;
  const valAcc = valHits.length > 0 ? valHits.filter((h) => h.hitEkor).length / valHits.length : 0;
  const testAcc = testHits.length > 0 ? testHits.filter((h) => h.hitEkor).length / testHits.length : 0;
  const warningOverfitting = Math.abs(trainAcc - testAcc) > 0.20;

  // Build windowed metrics from test draws only (using full draws for each window)
  const entries300: HitRecord[] = [];
  const entries100: HitRecord[] = [];
  const entries30: HitRecord[] = [];

  const testWindowSamples = samplePoints(Math.max(n - 300, 30), n - 1, 30);
  for (const idx of testWindowSamples) {
    const trainingDraws = draws.slice(0, idx);
    const actual = draws[idx]?.result;
    if (!actual || actual.length !== 4) continue;
    const pred = fastPredict(trainingDraws, period);
    if (!pred) continue;
    const hits = calcHits(pred, actual);
    entries300.push(hits);
    if (idx >= n - 100) entries100.push(hits);
    if (idx >= n - 30) entries30.push(hits);
  }

  return {
    last30: buildMetrics(entries30),
    last100: buildMetrics(entries100),
    last300: buildMetrics(entries300),
    trainAccuracy: trainAcc,
    validAccuracy: valAcc,
    testAccuracy: testAcc,
    warningOverfitting,
  };
}
