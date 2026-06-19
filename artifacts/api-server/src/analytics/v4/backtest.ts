import type { FlatDraw, BacktestWindow, BacktestSummaryV4 } from "./types";
import { buildV4Context } from "./context";
import { runBaseEngines } from "./engines";

function calcHits(prediction: string, actual: string) {
  if (prediction.length !== 4 || actual.length !== 4) {
    return { hitAs: false, hitKop: false, hitKepala: false, hitEkor: false, hit2D: false, hit3D: false, hit4D: false };
  }
  const hitAs = prediction[0] === actual[0];
  const hitKop = prediction[1] === actual[1];
  const hitKepala = prediction[2] === actual[2];
  const hitEkor = prediction[3] === actual[3];
  const matchedDigits = [hitAs, hitKop, hitKepala, hitEkor].filter(Boolean).length;
  return {
    hitAs, hitKop, hitKepala, hitEkor,
    hit2D: prediction.slice(2) === actual.slice(2),
    hit3D: prediction.slice(1) === actual.slice(1),
    hit4D: prediction === actual,
    matchedDigits,
  };
}

function buildWindow(entries: Array<ReturnType<typeof calcHits>>): BacktestWindow {
  const total = entries.length;
  if (total === 0) {
    return { total: 0, hitAs: 0, hitKop: 0, hitKepala: 0, hitEkor: 0, hit2D: 0, hit3D: 0, hit4D: 0, hitRateAs: 0, hitRateKop: 0, hitRateKepala: 0, hitRateEkor: 0, hitRate2D: 0, hitRate3D: 0, hitRate4D: 0, precision: 0, recall: 0, f1Score: 0 };
  }
  const hitAs = entries.filter((e) => e.hitAs).length;
  const hitKop = entries.filter((e) => e.hitKop).length;
  const hitKepala = entries.filter((e) => e.hitKepala).length;
  const hitEkor = entries.filter((e) => e.hitEkor).length;
  const hit2D = entries.filter((e) => e.hit2D).length;
  const hit3D = entries.filter((e) => e.hit3D).length;
  const hit4D = entries.filter((e) => e.hit4D).length;
  const hitRateAs = hitAs / total;
  const hitRateKop = hitKop / total;
  const hitRateKepala = hitKepala / total;
  const hitRateEkor = hitEkor / total;
  const avgDigitHit = (hitRateAs + hitRateKop + hitRateKepala + hitRateEkor) / 4;

  const truePositives = entries.filter((e) => (e.matchedDigits ?? 0) >= 2).length;
  const precision = total > 0 ? truePositives / total : 0;
  const recall = total > 0 ? truePositives / total : 0;
  const f1Score = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  return {
    total, hitAs, hitKop, hitKepala, hitEkor, hit2D, hit3D, hit4D,
    hitRateAs, hitRateKop, hitRateKepala, hitRateEkor,
    hitRate2D: hit2D / total, hitRate3D: hit3D / total, hitRate4D: hit4D / total,
    precision, recall, f1Score,
  };
}

function fastPredictV4(draws: FlatDraw[], period: string): string | null {
  if (draws.length < 20) return null;
  const ctx = buildV4Context(draws, period, {}, {});
  const engines = runBaseEngines(ctx);
  const signalEngines = engines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 3) return null;

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

function samplePoints(start: number, end: number, maxSamples: number): number[] {
  const total = end - start;
  if (total <= maxSamples) return Array.from({ length: total }, (_, i) => start + i);
  const step = Math.floor(total / maxSamples);
  return Array.from({ length: maxSamples }, (_, i) => start + i * step);
}

export function runBacktestV4(draws: FlatDraw[], period: string): BacktestSummaryV4 | null {
  if (draws.length < 100) return null;

  const n = draws.length;
  const trainEnd = Math.floor(n * 0.70);
  const valEnd = Math.floor(n * 0.85);

  type HitRecord = ReturnType<typeof calcHits>;

  const trainHits: HitRecord[] = [];
  const valHits: HitRecord[] = [];
  const testHits: HitRecord[] = [];

  const trainSamples = samplePoints(20, trainEnd, 15);
  const valSamples = samplePoints(trainEnd, valEnd, 10);
  const testSamples = samplePoints(valEnd, n - 1, 15);

  for (const idx of trainSamples) {
    const pred = fastPredictV4(draws.slice(0, idx), period);
    const actual = draws[idx]?.result;
    if (pred && actual && actual.length === 4) trainHits.push(calcHits(pred, actual));
  }
  for (const idx of valSamples) {
    const pred = fastPredictV4(draws.slice(0, idx), period);
    const actual = draws[idx]?.result;
    if (pred && actual && actual.length === 4) valHits.push(calcHits(pred, actual));
  }
  for (const idx of testSamples) {
    const pred = fastPredictV4(draws.slice(0, idx), period);
    const actual = draws[idx]?.result;
    if (pred && actual && actual.length === 4) testHits.push(calcHits(pred, actual));
  }

  const trainAcc = trainHits.length > 0 ? trainHits.filter((h) => h.hitEkor).length / trainHits.length : 0;
  const valAcc = valHits.length > 0 ? valHits.filter((h) => h.hitEkor).length / valHits.length : 0;
  const testAcc = testHits.length > 0 ? testHits.filter((h) => h.hitEkor).length / testHits.length : 0;
  const warningOverfitting = Math.abs(trainAcc - testAcc) > 0.10;

  // Window-based metrics
  const samples500 = samplePoints(Math.max(n - 500, 20), n - 1, 40);
  const all500: HitRecord[] = [];
  for (const idx of samples500) {
    const pred = fastPredictV4(draws.slice(0, idx), period);
    const actual = draws[idx]?.result;
    if (pred && actual && actual.length === 4) all500.push(calcHits(pred, actual));
  }

  const all300 = all500.filter((_, i) => {
    const origIdx = samples500[i] ?? 0;
    return origIdx >= n - 300;
  });
  const all100 = all500.filter((_, i) => {
    const origIdx = samples500[i] ?? 0;
    return origIdx >= n - 100;
  });
  const all30 = all500.filter((_, i) => {
    const origIdx = samples500[i] ?? 0;
    return origIdx >= n - 30;
  });

  const allSamples = samplePoints(20, n - 1, 50);
  const allHits: HitRecord[] = [];
  for (const idx of allSamples) {
    const pred = fastPredictV4(draws.slice(0, idx), period);
    const actual = draws[idx]?.result;
    if (pred && actual && actual.length === 4) allHits.push(calcHits(pred, actual));
  }

  return {
    last30: buildWindow(all30),
    last100: buildWindow(all100),
    last300: buildWindow(all300),
    last500: buildWindow(all500),
    allHistory: buildWindow(allHits),
    trainAccuracy: Math.round(trainAcc * 1000) / 1000,
    validAccuracy: Math.round(valAcc * 1000) / 1000,
    testAccuracy: Math.round(testAcc * 1000) / 1000,
    warningOverfitting,
  };
}
