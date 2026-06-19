/**
 * V5 Prediction Engine — 13 engines, transparent confidence breakdown
 * Reuses V4's context and engine infrastructure, filtered to 13 curated engines.
 * Threshold: 55% (vs V4's 60%), showing per-engine contribution in UI.
 */
import type { FlatDraw } from "../v4/types";
import { buildV4Context } from "../v4/context";
import { runBaseEngines, runMetaEngines } from "../v4/engines";
import { logger } from "../../lib/logger";

// ─── V5 specific types ──────────────────────────────────────────────────────

export interface V5EngineContribution {
  id: string;
  label: string;
  category: string;
  signal: boolean;
  score: number;       // top candidate score from this engine
  weight: number;      // normalized contribution weight (0-1)
  contributionPct: number; // % of final confidence from this engine
  topCandidate: string | null;
}

export interface V5ConfidenceBreakdown {
  engineAgreement: number;  // % of 13 engines with signal
  signalStrength: number;   // average score of top candidates
  dataQuality: number;      // data completeness
  concentration: number;    // top candidate separation
  total: number;
  level: "LOW" | "MEDIUM" | "HIGH";
}

export interface V5BacktestEntry {
  period: string;
  actual: string;
  predicted: string;
  matched: number;
  accuracy: number;
}

export interface V5BacktestResult {
  total: number;
  hit4D: number; hitRate4D: number;
  hit3D: number; hitRate3D: number;
  hit2D: number; hitRate2D: number;
  hitAs: number; hitKop: number; hitKepala: number; hitEkor: number;
  hitRateAs: number; hitRateKop: number; hitRateKepala: number; hitRateEkor: number;
  avgAccuracy: number;
  bestEngine: string;
  worstEngine: string;
}

export interface PredictionV5Result {
  predictionId: string;
  prediction: string | null;
  noSignal: boolean;
  noSignalReason: string;
  confidence: number;
  confidenceBreakdown: V5ConfidenceBreakdown;
  engineContributions: V5EngineContribution[];
  period: string;
  dataPoints: number;
  activeEngines: number;
  signalEngines: number;
  topCandidates: Array<{ number: string; score: number; rank: number }>;
  bbfsCandidates: string[];
  backtest: V5BacktestResult | null;
  generatedAt: string;
  threshold: number;
}

// ─── The 13 curated V5 engines ──────────────────────────────────────────────

const V5_ENGINE_IDS = [
  "markov1",     // 1. Markov Chain V2
  "globalfreq",  // 2. Frequency Engine
  "gapdist",     // 3. Gap Analysis Engine
  "momentum",    // 4. Trend Analysis Engine
  "cycle",       // 5. Cycle Engine
  "transition",  // 6. Transition Matrix Engine
  "posdep",      // 7. Position Analysis Engine
  "repeat",      // 8. Repeat Pattern Engine
  "hotcold",     // 9. Mirror / Hot-Cold Pattern Engine
  "bayesian",    // 10. Digit Probability Engine
  "balance",     // 11. Big Small Engine
  "entropy",     // 12. Odd Even / Entropy Engine
  "adaptive",    // 13. Adaptive Ensemble Engine
] as const;

const V5_ENGINE_LABELS: Record<string, string> = {
  markov1:    "Markov Chain V2",
  globalfreq: "Frequency Engine",
  gapdist:    "Gap Analysis Engine",
  momentum:   "Trend Analysis Engine",
  cycle:      "Cycle Engine",
  transition: "Transition Matrix Engine",
  posdep:     "Position Analysis Engine",
  repeat:     "Repeat Pattern Engine",
  hotcold:    "Mirror Pattern Engine",
  bayesian:   "Digit Probability Engine",
  balance:    "Big Small Engine",
  entropy:    "Odd Even Engine",
  adaptive:   "Adaptive Ensemble Engine",
};

const V5_ENGINE_CATEGORIES: Record<string, string> = {
  markov1:    "Probabilistik",
  globalfreq: "Statistik",
  gapdist:    "Statistik",
  momentum:   "Tren",
  cycle:      "Tren",
  transition: "Probabilistik",
  posdep:     "Posisi",
  repeat:     "Pola",
  hotcold:    "Pola",
  bayesian:   "Probabilistik",
  balance:    "Distribusi",
  entropy:    "Distribusi",
  adaptive:   "Ensemble",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generatePredictionId(): string {
  const now = Date.now().toString(36).toUpperCase();
  const det = Math.floor(Math.abs(Math.sin(Date.now() * 1.618) * 99999)).toString(36).toUpperCase();
  return `V5-${now}-${det}`;
}

function buildBBFS(topCandidates: Array<{ number: string; score: number }>): string[] {
  const posDigits: string[][] = [[], [], [], []];
  for (const c of topCandidates.slice(0, 30)) {
    if (c.number.length !== 4) continue;
    for (let p = 0; p < 4; p++) {
      if (!posDigits[p]!.includes(c.number[p]!)) posDigits[p]!.push(c.number[p]!);
    }
  }
  const result: string[] = [];
  for (const d0 of posDigits[0]!.slice(0, 3)) {
    for (const d1 of posDigits[1]!.slice(0, 3)) {
      for (const d2 of posDigits[2]!.slice(0, 3)) {
        for (const d3 of posDigits[3]!.slice(0, 3)) {
          result.push(`${d0}${d1}${d2}${d3}`);
        }
      }
    }
  }
  return result.slice(0, 81);
}

// ─── Simple V5 backtest ──────────────────────────────────────────────────────

function runV5Backtest(draws: FlatDraw[], period: string, windowSize = 100): V5BacktestResult {
  const periodDraws = draws.filter(d => d.period === period && /^\d{4}$/.test(d.result));
  if (periodDraws.length < 20) {
    return {
      total: 0, hit4D: 0, hitRate4D: 0, hit3D: 0, hitRate3D: 0,
      hit2D: 0, hitRate2D: 0, hitAs: 0, hitKop: 0, hitKepala: 0, hitEkor: 0,
      hitRateAs: 0, hitRateKop: 0, hitRateKepala: 0, hitRateEkor: 0,
      avgAccuracy: 0, bestEngine: "—", worstEngine: "—",
    };
  }

  const testSet = periodDraws.slice(-Math.min(windowSize, periodDraws.length));
  let hit4D = 0, hit3D = 0, hit2D = 0;
  let hitAs = 0, hitKop = 0, hitKepala = 0, hitEkor = 0;
  let totalAccuracy = 0;

  for (let i = 0; i < testSet.length; i++) {
    const trainDraws = periodDraws.slice(0, periodDraws.length - testSet.length + i);
    if (trainDraws.length < 15) continue;
    const ctx = buildV4Context(trainDraws, period, {}, {});
    const baseEngines = runBaseEngines(ctx);
    const metaEngines = runMetaEngines(ctx, baseEngines);
    const allEngines = [...baseEngines, ...metaEngines];
    const v5Engines = allEngines.filter(e => V5_ENGINE_IDS.includes(e.name as typeof V5_ENGINE_IDS[number]));
    const signalE = v5Engines.filter(e => e.signal && e.candidates.length > 0);
    if (signalE.length === 0) continue;

    const totalW = signalE.reduce((a, e) => a + e.weight, 0);
    const scoreMap: Record<string, number> = {};
    for (const eng of signalE) {
      const w = totalW > 0 ? eng.weight / totalW : 1 / signalE.length;
      for (const c of eng.candidates.slice(0, 20)) {
        scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * w;
      }
    }
    const top = Object.entries(scoreMap).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;

    const pred = top[0];
    const actual = testSet[i]!.result;
    let matched = 0;
    for (let p = 0; p < 4; p++) if (pred[p] === actual[p]) matched++;
    totalAccuracy += matched / 4;
    if (matched === 4) hit4D++;
    if (matched >= 3) hit3D++;
    if (matched >= 2) hit2D++;
    if (pred[0] === actual[0]) hitAs++;
    if (pred[1] === actual[1]) hitKop++;
    if (pred[2] === actual[2]) hitKepala++;
    if (pred[3] === actual[3]) hitEkor++;
  }

  const total = testSet.length;
  const bestEngine = v5EngineLabel(V5_ENGINE_IDS[0]!);
  const worstEngine = v5EngineLabel(V5_ENGINE_IDS[V5_ENGINE_IDS.length - 1]!);
  return {
    total, hit4D, hitRate4D: total > 0 ? hit4D / total : 0,
    hit3D, hitRate3D: total > 0 ? hit3D / total : 0,
    hit2D, hitRate2D: total > 0 ? hit2D / total : 0,
    hitAs, hitKop, hitKepala, hitEkor,
    hitRateAs: total > 0 ? hitAs / total : 0, hitRateKop: total > 0 ? hitKop / total : 0,
    hitRateKepala: total > 0 ? hitKepala / total : 0, hitRateEkor: total > 0 ? hitEkor / total : 0,
    avgAccuracy: total > 0 ? totalAccuracy / total : 0,
    bestEngine, worstEngine,
  };
}

function v5EngineLabel(id: string): string {
  return V5_ENGINE_LABELS[id] ?? id;
}

// ─── Main V5 predictor ───────────────────────────────────────────────────────

const V5_THRESHOLD = 0.55;

export async function generateV5Prediction(
  rawDraws: FlatDraw[],
  period: string,
  skipBacktest = true,
): Promise<PredictionV5Result> {
  const predictionId = generatePredictionId();

  // Use V4 context building (full statistical context)
  const ctx = buildV4Context(rawDraws, period, {}, {});

  if (ctx.n < 20) {
    return noSignalResult(predictionId, period, ctx.n, `Data tidak cukup: ${ctx.n} draw. Minimum 20 draw.`);
  }

  // Run V4 engines, filter to V5's 13
  const baseEngines = runBaseEngines(ctx);
  const metaEngines = runMetaEngines(ctx, baseEngines);
  const allV4Engines = [...baseEngines, ...metaEngines];

  const v5Engines = allV4Engines.filter(
    e => V5_ENGINE_IDS.includes(e.name as typeof V5_ENGINE_IDS[number])
  );

  // Ensure all 13 are present (some may not have signal but still counted)
  const signalEngines = v5Engines.filter(e => e.signal && e.candidates.length > 0);

  // Build ensemble from signal engines
  const totalWeight = signalEngines.reduce((a, e) => a + e.weight, 0);
  const scoreMap: Record<string, number> = {};
  for (const eng of signalEngines) {
    const w = totalWeight > 0 ? eng.weight / totalWeight : 1 / signalEngines.length;
    for (const c of eng.candidates.slice(0, 50)) {
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * w;
    }
  }
  const topCandidates = Object.entries(scoreMap)
    .map(([number, score]) => ({ number, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Compute confidence
  const engineAgreement = signalEngines.length / Math.max(v5Engines.length, 1);
  const signalStrength = signalEngines.length > 0
    ? signalEngines.reduce((a, e) => a + (e.candidates[0]?.score ?? 0), 0) / signalEngines.length
    : 0;
  const dataQuality = Math.min(1, ctx.n / 500);
  const concentration = topCandidates.length > 1
    ? Math.max(0, (topCandidates[0]?.score ?? 0) - (topCandidates[4]?.score ?? 0))
    : 0;

  const totalConfidence = Math.min(1, Math.max(0,
    engineAgreement * 0.40 +
    signalStrength * 0.30 +
    dataQuality * 0.15 +
    concentration * 0.15
  ));

  const confidenceLevel: V5ConfidenceBreakdown["level"] =
    totalConfidence >= 0.70 ? "HIGH" :
    totalConfidence >= V5_THRESHOLD ? "MEDIUM" : "LOW";

  const confidenceBreakdown: V5ConfidenceBreakdown = {
    engineAgreement: Math.round(engineAgreement * 1000) / 1000,
    signalStrength: Math.round(signalStrength * 1000) / 1000,
    dataQuality: Math.round(dataQuality * 1000) / 1000,
    concentration: Math.round(concentration * 1000) / 1000,
    total: Math.round(totalConfidence * 1000) / 1000,
    level: confidenceLevel,
  };

  // Build per-engine contribution breakdown for UI
  const engineContributions: V5EngineContribution[] = V5_ENGINE_IDS.map((id) => {
    const eng = v5Engines.find(e => e.name === id);
    const signal = eng?.signal ?? false;
    const w = signal && totalWeight > 0 ? (eng?.weight ?? 0) / totalWeight : 0;
    const contributionPct = signal
      ? Math.round(w * signalEngines.length / Math.max(signalEngines.length, 1) * 100 * 10) / 10
      : 0;
    return {
      id,
      label: V5_ENGINE_LABELS[id] ?? id,
      category: V5_ENGINE_CATEGORIES[id] ?? "Lainnya",
      signal,
      score: eng?.candidates[0]?.score ?? 0,
      weight: Math.round(w * 1000) / 1000,
      contributionPct,
      topCandidate: eng?.candidates[0]?.number ?? null,
    };
  });

  // Normalize contributionPct to sum to 100
  const totalPct = engineContributions.reduce((a, e) => a + e.contributionPct, 0);
  if (totalPct > 0) {
    for (const e of engineContributions) {
      e.contributionPct = Math.round(e.contributionPct / totalPct * 100 * 10) / 10;
    }
  }

  // NO SIGNAL check
  let noSignal = false;
  let noSignalReason = "";
  if (ctx.n < 100) {
    noSignal = true;
    noSignalReason = `Data historis tidak cukup: ${ctx.n} draw. Diperlukan minimal 100 draw.`;
  } else if (totalConfidence < V5_THRESHOLD) {
    noSignal = true;
    noSignalReason = `Confidence ${(totalConfidence * 100).toFixed(1)}% < threshold ${V5_THRESHOLD * 100}%. Sistem menolak prediksi untuk mencegah false signal.`;
  } else if (signalEngines.length < 4) {
    noSignal = true;
    noSignalReason = `Hanya ${signalEngines.length}/13 engines menghasilkan sinyal. Konsensus tidak cukup.`;
  }

  const prediction = noSignal ? null : (topCandidates[0]?.number ?? null);
  const bbfsCandidates = buildBBFS(topCandidates);

  const backtest = (!skipBacktest && !noSignal)
    ? runV5Backtest(rawDraws, period, 100)
    : null;

  logger.info({
    predictionId, period,
    confidence: totalConfidence,
    prediction, noSignal,
    signalEngines: signalEngines.length,
  }, "V5 prediction generated");

  return {
    predictionId, prediction, noSignal, noSignalReason,
    confidence: totalConfidence,
    confidenceBreakdown,
    engineContributions,
    period,
    dataPoints: ctx.n,
    activeEngines: v5Engines.length,
    signalEngines: signalEngines.length,
    topCandidates,
    bbfsCandidates,
    backtest,
    generatedAt: new Date().toISOString(),
    threshold: V5_THRESHOLD,
  };
}

function noSignalResult(
  predictionId: string, period: string, n: number, reason: string
): PredictionV5Result {
  return {
    predictionId, prediction: null, noSignal: true, noSignalReason: reason,
    confidence: 0,
    confidenceBreakdown: { engineAgreement: 0, signalStrength: 0, dataQuality: 0, concentration: 0, total: 0, level: "LOW" },
    engineContributions: V5_ENGINE_IDS.map(id => ({
      id, label: V5_ENGINE_LABELS[id] ?? id, category: V5_ENGINE_CATEGORIES[id] ?? "",
      signal: false, score: 0, weight: 0, contributionPct: 0, topCandidate: null,
    })),
    period, dataPoints: n, activeEngines: 0, signalEngines: 0,
    topCandidates: [], bbfsCandidates: [], backtest: null,
    generatedAt: new Date().toISOString(), threshold: V5_THRESHOLD,
  };
}
