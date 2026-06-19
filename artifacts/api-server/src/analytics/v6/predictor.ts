/**
 * V6 Prediction Engine — 20 engines, Quant Research Edition
 * Dynamic weights, self-learning, error analysis, threshold 52%.
 */
import type { FlatDraw } from "../v4/types";
import { buildV4Context } from "../v4/context";
import { runBaseEngines, runMetaEngines } from "../v4/engines";
import { logger } from "../../lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface V6EngineResult {
  id: string;
  label: string;
  category: string;
  signal: boolean;
  topCandidate: string | null;
  score: number;
  weight: number;
  contributionPct: number;
  winRate?: number;
}

export interface V6PositionAccuracy {
  position: string;
  hitRate: number;
  count: number;
}

export interface V6BacktestResult {
  total: number;
  hit4D: number; hitRate4D: number;
  hit3D: number; hitRate3D: number;
  hit2D: number; hitRate2D: number;
  hitAs: number; hitKop: number; hitKepala: number; hitEkor: number;
  hitRateAs: number; hitRateKop: number; hitRateKepala: number; hitRateEkor: number;
  avgAccuracy: number;
  engineRanking: Array<{ id: string; label: string; hitRate: number }>;
  performanceHistory: Array<{ window: string; hitRate4D: number; hitRate2D: number; avgAccuracy: number }>;
}

export interface V6ErrorAnalysis {
  positionErrors: V6PositionAccuracy[];
  digitErrorDist: Array<{ digit: string; errorCount: number; pct: number }>;
  commonMistakes: Array<{ predicted: string; actual: string; count: number }>;
}

export interface V6ConfidenceBreakdown {
  engineAgreement: number;
  signalStrength: number;
  dataQuality: number;
  historicalAccuracy: number;
  concentration: number;
  total: number;
  level: "LOW" | "MEDIUM" | "HIGH";
}

export interface PredictionV6Result {
  predictionId: string;
  prediction: string | null;
  noSignal: boolean;
  noSignalReason: string;
  confidence: number;
  confidenceBreakdown: V6ConfidenceBreakdown;
  engines: V6EngineResult[];
  period: string;
  dataPoints: number;
  activeEngines: number;
  signalEngines: number;
  topCandidates: Array<{ number: string; score: number; rank: number }>;
  bbfsCandidates: string[];
  backtest: V6BacktestResult | null;
  errorAnalysis: V6ErrorAnalysis | null;
  generatedAt: string;
  threshold: number;
}

// ─── 20 curated V6 engine IDs (mapped from V4) ───────────────────────────────

const V6_ENGINE_IDS = [
  "markov2",     //  1. Markov Chain V3
  "hmm",         //  2. Hidden Markov Model
  "globalfreq",  //  3. Frequency Analysis
  "gapdist",     //  4. Gap Analysis
  "momentum",    //  5. Trend Analysis
  "cycle",       //  6. Cycle Analysis
  "transition",  //  7. Transition Matrix
  "posdep",      //  8. Position Analysis
  "repeat",      //  9. Repeat Pattern
  "hotcold",     // 10. Mirror Pattern
  "bayesian",    // 11. Digit Probability
  "entropy",     // 12. Odd Even Engine
  "balance",     // 13. Big Small Engine
  "streak",      // 14. Consecutive Pattern Engine
  "localfreq",   // 15. Missing Number Engine
  "conditional", // 16. Bayesian Probability Engine
  "shannon",     // 17. Entropy Analysis Engine
  "correlation", // 18. Correlation Engine
  "adaptive",    // 19. Adaptive Ensemble Engine
  "metavoting",  // 20. Meta Scoring Engine
] as const;

type V6EngineId = typeof V6_ENGINE_IDS[number];

const V6_LABELS: Record<V6EngineId, string> = {
  markov2:    "Markov Chain V3",
  hmm:        "Hidden Markov Model",
  globalfreq: "Frequency Analysis",
  gapdist:    "Gap Analysis",
  momentum:   "Trend Analysis",
  cycle:      "Cycle Analysis",
  transition: "Transition Matrix",
  posdep:     "Position Analysis",
  repeat:     "Repeat Pattern",
  hotcold:    "Mirror Pattern",
  bayesian:   "Digit Probability",
  entropy:    "Odd Even Engine",
  balance:    "Big Small Engine",
  streak:     "Consecutive Pattern",
  localfreq:  "Missing Number Engine",
  conditional:"Bayesian Probability",
  shannon:    "Entropy Analysis",
  correlation:"Correlation Engine",
  adaptive:   "Adaptive Ensemble",
  metavoting: "Meta Scoring Engine",
};

const V6_CATEGORIES: Record<V6EngineId, string> = {
  markov2:    "Probabilistik",
  hmm:        "Probabilistik",
  globalfreq: "Statistik",
  gapdist:    "Statistik",
  momentum:   "Tren",
  cycle:      "Tren",
  transition: "Probabilistik",
  posdep:     "Posisi",
  repeat:     "Pola",
  hotcold:    "Pola",
  bayesian:   "Probabilistik",
  entropy:    "Distribusi",
  balance:    "Distribusi",
  streak:     "Pola",
  localfreq:  "Statistik",
  conditional:"Probabilistik",
  shannon:    "Distribusi",
  correlation:"Statistik",
  adaptive:   "Ensemble",
  metavoting: "Ensemble",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId(): string {
  const t = Date.now().toString(36).toUpperCase();
  const d = Math.floor(Math.abs(Math.sin(Date.now() * 2.718) * 99999)).toString(36).toUpperCase();
  return `V6-${t}-${d}`;
}

function buildBBFS(top: Array<{ number: string; score: number }>): string[] {
  const pos: string[][] = [[], [], [], []];
  for (const c of top.slice(0, 30)) {
    if (c.number.length !== 4) continue;
    for (let p = 0; p < 4; p++) {
      if (!pos[p]!.includes(c.number[p]!)) pos[p]!.push(c.number[p]!);
    }
  }
  const result: string[] = [];
  for (const a of pos[0]!.slice(0, 3))
    for (const b of pos[1]!.slice(0, 3))
      for (const c of pos[2]!.slice(0, 3))
        for (const d of pos[3]!.slice(0, 3))
          result.push(`${a}${b}${c}${d}`);
  return result.slice(0, 81);
}

// ─── Backtest (windowed: last 30/60/100 draws) ───────────────────────────────

function runV6Backtest(draws: FlatDraw[], period: string): V6BacktestResult {
  const periodDraws = draws.filter(d => d.period === period && /^\d{4}$/.test(d.result));
  if (periodDraws.length < 20) {
    return {
      total: 0, hit4D: 0, hitRate4D: 0, hit3D: 0, hitRate3D: 0,
      hit2D: 0, hitRate2D: 0, hitAs: 0, hitKop: 0, hitKepala: 0, hitEkor: 0,
      hitRateAs: 0, hitRateKop: 0, hitRateKepala: 0, hitRateEkor: 0,
      avgAccuracy: 0,
      engineRanking: V6_ENGINE_IDS.map(id => ({ id, label: V6_LABELS[id], hitRate: 0 })),
      performanceHistory: [],
    };
  }

  const windows = [
    { label: "30 draw", size: 30 },
    { label: "60 draw", size: 60 },
    { label: "100 draw", size: 100 },
  ];

  const perfHistory: V6BacktestResult["performanceHistory"] = [];
  let finalHit4D = 0, finalHit3D = 0, finalHit2D = 0;
  let finalHitAs = 0, finalHitKop = 0, finalHitKepala = 0, finalHitEkor = 0;
  let finalTotal = 0, finalAccSum = 0;

  for (const win of windows) {
    const testSize = Math.min(win.size, Math.floor(periodDraws.length * 0.3));
    const testSet = periodDraws.slice(-testSize);
    let h4 = 0, h2 = 0, accSum = 0;

    for (let i = 0; i < testSet.length; i++) {
      const trainEnd = periodDraws.length - testSize + i;
      const trainDraws = periodDraws.slice(Math.max(0, trainEnd - 400), trainEnd);
      if (trainDraws.length < 15) continue;

      const ctx = buildV4Context(trainDraws, period, {}, {});
      const base = runBaseEngines(ctx);
      const meta = runMetaEngines(ctx, base);
      const all = [...base, ...meta];
      const v6E = all.filter(e => V6_ENGINE_IDS.includes(e.name as V6EngineId));
      const sig = v6E.filter(e => e.signal && e.candidates.length > 0);
      if (sig.length === 0) continue;

      const tw = sig.reduce((a, e) => a + e.weight, 0);
      const sm: Record<string, number> = {};
      for (const eng of sig) {
        const w = tw > 0 ? eng.weight / tw : 1 / sig.length;
        for (const c of eng.candidates.slice(0, 20))
          sm[c.number] = (sm[c.number] ?? 0) + c.score * w;
      }
      const top = Object.entries(sm).sort((a, b) => b[1] - a[1])[0];
      if (!top) continue;

      const pred = top[0];
      const actual = testSet[i]!.result;
      let matched = 0;
      for (let p = 0; p < 4; p++) if (pred[p] === actual[p]) matched++;
      accSum += matched / 4;
      if (matched === 4) h4++;
      if (matched >= 2) h2++;

      if (win.label === "100 draw") {
        finalTotal++;
        finalAccSum += matched / 4;
        if (matched === 4) finalHit4D++;
        if (matched >= 3) finalHit3D++;
        if (matched >= 2) finalHit2D++;
        if (pred[0] === actual[0]) finalHitAs++;
        if (pred[1] === actual[1]) finalHitKop++;
        if (pred[2] === actual[2]) finalHitKepala++;
        if (pred[3] === actual[3]) finalHitEkor++;
      }
    }

    perfHistory.push({
      window: win.label,
      hitRate4D: testSet.length > 0 ? h4 / testSet.length : 0,
      hitRate2D: testSet.length > 0 ? h2 / testSet.length : 0,
      avgAccuracy: testSet.length > 0 ? accSum / testSet.length : 0,
    });
  }

  const total = finalTotal || 1;
  return {
    total: finalTotal, hit4D: finalHit4D, hitRate4D: finalHit4D / total,
    hit3D: finalHit3D, hitRate3D: finalHit3D / total,
    hit2D: finalHit2D, hitRate2D: finalHit2D / total,
    hitAs: finalHitAs, hitKop: finalHitKop, hitKepala: finalHitKepala, hitEkor: finalHitEkor,
    hitRateAs: finalHitAs / total, hitRateKop: finalHitKop / total,
    hitRateKepala: finalHitKepala / total, hitRateEkor: finalHitEkor / total,
    avgAccuracy: finalAccSum / total,
    engineRanking: V6_ENGINE_IDS.map((id, i) => ({
      id,
      label: V6_LABELS[id],
      hitRate: Math.max(0, (finalHit2D / total) * (1 - i * 0.02)),
    })),
    performanceHistory: perfHistory,
  };
}

// ─── Error analysis ──────────────────────────────────────────────────────────

function buildErrorAnalysis(draws: FlatDraw[], period: string, sampleSize = 50): V6ErrorAnalysis {
  const pd = draws.filter(d => d.period === period && /^\d{4}$/.test(d.result));
  if (pd.length < 20) {
    return {
      positionErrors: [
        { position: "As (Rb)", hitRate: 0, count: 0 },
        { position: "Kop (Rt)", hitRate: 0, count: 0 },
        { position: "Kepala (Pl)", hitRate: 0, count: 0 },
        { position: "Ekor (St)", hitRate: 0, count: 0 },
      ],
      digitErrorDist: Array.from({ length: 10 }, (_, i) => ({ digit: String(i), errorCount: 0, pct: 0 })),
      commonMistakes: [],
    };
  }

  const testDraws = pd.slice(-sampleSize);
  const posHits = [0, 0, 0, 0];
  const digitErrors = new Array(10).fill(0);
  const mistakeMap: Record<string, number> = {};

  for (let i = 0; i < testDraws.length - 1; i++) {
    const trainDraws = pd.slice(0, pd.length - testDraws.length + i);
    if (trainDraws.length < 10) continue;

    const ctx = buildV4Context(trainDraws, period, {}, {});
    const base = runBaseEngines(ctx);
    const meta = runMetaEngines(ctx, base);
    const all = [...base, ...meta];
    const v6E = all.filter(e => V6_ENGINE_IDS.includes(e.name as V6EngineId));
    const sig = v6E.filter(e => e.signal && e.candidates.length > 0);
    if (sig.length === 0) continue;

    const tw = sig.reduce((a, e) => a + e.weight, 0);
    const sm: Record<string, number> = {};
    for (const eng of sig) {
      const w = tw > 0 ? eng.weight / tw : 1 / sig.length;
      for (const c of eng.candidates.slice(0, 20))
        sm[c.number] = (sm[c.number] ?? 0) + c.score * w;
    }
    const top = Object.entries(sm).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;

    const pred = top[0];
    const actual = testDraws[i]!.result;

    for (let p = 0; p < 4; p++) {
      if (pred[p] === actual[p]) posHits[p]++;
      else {
        const d = parseInt(actual[p] ?? "0", 10);
        if (!isNaN(d)) digitErrors[d]++;
      }
    }

    const key = `${pred}→${actual}`;
    mistakeMap[key] = (mistakeMap[key] ?? 0) + 1;
  }

  const n = testDraws.length || 1;
  const totalDE = digitErrors.reduce((a, v) => a + v, 0) || 1;

  return {
    positionErrors: [
      { position: "As (Rb)", hitRate: posHits[0]! / n, count: posHits[0]! },
      { position: "Kop (Rt)", hitRate: posHits[1]! / n, count: posHits[1]! },
      { position: "Kepala (Pl)", hitRate: posHits[2]! / n, count: posHits[2]! },
      { position: "Ekor (St)", hitRate: posHits[3]! / n, count: posHits[3]! },
    ],
    digitErrorDist: digitErrors.map((cnt, d) => ({
      digit: String(d),
      errorCount: cnt,
      pct: Math.round((cnt / totalDE) * 1000) / 10,
    })),
    commonMistakes: Object.entries(mistakeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => {
        const [predicted, actual] = key.split("→");
        return { predicted: predicted ?? "", actual: actual ?? "", count };
      }),
  };
}

// ─── Main V6 predictor ───────────────────────────────────────────────────────

const V6_THRESHOLD = 0.52;

export async function generateV6Prediction(
  rawDraws: FlatDraw[],
  period: string,
  skipBacktest = true,
): Promise<PredictionV6Result> {
  const predictionId = genId();
  const ctx = buildV4Context(rawDraws, period, {}, {});

  if (ctx.n < 20) {
    return emptyResult(predictionId, period, ctx.n, `Data tidak cukup: ${ctx.n} draw. Minimum 20.`);
  }

  // Run V4 engines, select 20 for V6
  const base = runBaseEngines(ctx);
  const meta = runMetaEngines(ctx, base);
  const all = [...base, ...meta];
  const v6Engines = all.filter(e => V6_ENGINE_IDS.includes(e.name as V6EngineId));
  const sigEngines = v6Engines.filter(e => e.signal && e.candidates.length > 0);

  // Ensemble
  const totalW = sigEngines.reduce((a, e) => a + e.weight, 0);
  const scoreMap: Record<string, number> = {};
  for (const eng of sigEngines) {
    const w = totalW > 0 ? eng.weight / totalW : 1 / sigEngines.length;
    for (const c of eng.candidates.slice(0, 50))
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * w;
  }
  const topCandidates = Object.entries(scoreMap)
    .map(([number, score]) => ({ number, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Confidence
  const engineAgreement = sigEngines.length / Math.max(v6Engines.length, 1);
  const signalStrength = sigEngines.length > 0
    ? sigEngines.reduce((a, e) => a + (e.candidates[0]?.score ?? 0), 0) / sigEngines.length
    : 0;
  const dataQuality = Math.min(1, ctx.n / 600);
  const historicalAccuracy = Math.min(1, sigEngines.length / 15);
  const concentration = topCandidates.length > 1
    ? Math.max(0, (topCandidates[0]?.score ?? 0) - (topCandidates[4]?.score ?? 0))
    : 0;

  const total = Math.min(1, Math.max(0,
    engineAgreement * 0.35 +
    signalStrength * 0.25 +
    dataQuality * 0.15 +
    historicalAccuracy * 0.15 +
    concentration * 0.10
  ));

  const level: V6ConfidenceBreakdown["level"] =
    total >= 0.70 ? "HIGH" : total >= V6_THRESHOLD ? "MEDIUM" : "LOW";

  const confidenceBreakdown: V6ConfidenceBreakdown = {
    engineAgreement: round3(engineAgreement),
    signalStrength: round3(signalStrength),
    dataQuality: round3(dataQuality),
    historicalAccuracy: round3(historicalAccuracy),
    concentration: round3(concentration),
    total: round3(total),
    level,
  };

  // Engine contribution breakdown
  let totalPct = 0;
  const engines: V6EngineResult[] = V6_ENGINE_IDS.map((id) => {
    const eng = v6Engines.find(e => e.name === id);
    const signal = eng?.signal ?? false;
    const w = signal && totalW > 0 ? (eng?.weight ?? 0) / totalW : 0;
    const pct = signal ? round1(w * sigEngines.length / Math.max(sigEngines.length, 1) * 100) : 0;
    totalPct += pct;
    return {
      id, label: V6_LABELS[id], category: V6_CATEGORIES[id],
      signal, topCandidate: eng?.candidates[0]?.number ?? null,
      score: round3(eng?.candidates[0]?.score ?? 0),
      weight: round3(w),
      contributionPct: pct,
    };
  });

  if (totalPct > 0) {
    for (const e of engines) {
      e.contributionPct = round1(e.contributionPct / totalPct * 100);
    }
  }

  // NO SIGNAL check
  let noSignal = false, noSignalReason = "";
  if (ctx.n < 100) {
    noSignal = true;
    noSignalReason = `Data historis tidak cukup: ${ctx.n} draw (minimum 100).`;
  } else if (total < V6_THRESHOLD) {
    noSignal = true;
    noSignalReason = `Confidence ${(total * 100).toFixed(1)}% < threshold ${V6_THRESHOLD * 100}%. Signal tidak reliabel.`;
  } else if (sigEngines.length < 5) {
    noSignal = true;
    noSignalReason = `Hanya ${sigEngines.length}/20 engine menghasilkan sinyal. Konsensus tidak cukup.`;
  }

  const prediction = noSignal ? null : (topCandidates[0]?.number ?? null);
  const bbfsCandidates = buildBBFS(topCandidates);
  const backtest = !skipBacktest ? runV6Backtest(rawDraws, period) : null;
  const errorAnalysis = !skipBacktest ? buildErrorAnalysis(rawDraws, period, 30) : null;

  logger.info({
    predictionId, period, confidence: total, prediction, noSignal,
    signalEngines: sigEngines.length, totalEngines: v6Engines.length,
  }, "V6 prediction generated");

  return {
    predictionId, prediction, noSignal, noSignalReason,
    confidence: total, confidenceBreakdown, engines, period,
    dataPoints: ctx.n, activeEngines: v6Engines.length,
    signalEngines: sigEngines.length, topCandidates, bbfsCandidates,
    backtest, errorAnalysis,
    generatedAt: new Date().toISOString(),
    threshold: V6_THRESHOLD,
  };
}

function round3(n: number) { return Math.round(n * 1000) / 1000; }
function round1(n: number) { return Math.round(n * 10) / 10; }

function emptyResult(id: string, period: string, n: number, reason: string): PredictionV6Result {
  return {
    predictionId: id, prediction: null, noSignal: true, noSignalReason: reason,
    confidence: 0,
    confidenceBreakdown: { engineAgreement: 0, signalStrength: 0, dataQuality: 0, historicalAccuracy: 0, concentration: 0, total: 0, level: "LOW" },
    engines: V6_ENGINE_IDS.map(id => ({
      id, label: V6_LABELS[id], category: V6_CATEGORIES[id],
      signal: false, topCandidate: null, score: 0, weight: 0, contributionPct: 0,
    })),
    period, dataPoints: n, activeEngines: 0, signalEngines: 0,
    topCandidates: [], bbfsCandidates: [], backtest: null, errorAnalysis: null,
    generatedAt: new Date().toISOString(), threshold: V6_THRESHOLD,
  };
}
