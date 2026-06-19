import type {
  PredictionV3Result, EngineResult, DigitExplanation,
  ConfidenceBreakdown, BacktestSummary, FlatDraw,
} from "./types";
import { buildContext, runAllEngines } from "./engines";
import { runWalkForwardBacktest } from "./backtest";

const POSITION_NAMES = ["As (ribuan)", "Kop (ratusan)", "Kepala (puluhan)", "Ekor (satuan)"];
const MIN_DRAWS = 50;
const CONFIDENCE_THRESHOLD = 0.60;

// ─── Adaptive Weights ─────────────────────────────────────────────────────
// Compute from prediction_history if available, otherwise use equal weights.

export function computeAdaptiveWeightsV3(
  history: Array<{ engineBreakdown: string | null; matchedDigits: number | null }>
): Record<string, number> {
  const engineNames = [
    "markov2", "markov3", "poisson", "globalfreq", "multirecency",
    "momentum", "hotcold", "correlation", "repeat", "sumdigit",
    "daypattern", "sessionpattern", "cycle", "bayesian", "transition",
    "entropy", "hmm",
  ];
  const perf: Record<string, { correct: number; total: number }> = {};
  for (const e of engineNames) perf[e] = { correct: 0, total: 0 };

  for (const h of history) {
    if (!h.engineBreakdown) continue;
    try {
      const bd = JSON.parse(h.engineBreakdown) as Record<string, { topCandidate?: string; actualMatch?: boolean }>;
      const matched = (h.matchedDigits ?? 0) >= 2;
      for (const [name, data] of Object.entries(bd)) {
        if (perf[name]) {
          perf[name]!.total++;
          if (matched && data?.actualMatch) perf[name]!.correct++;
        }
      }
    } catch { /* skip malformed */ }
  }

  const weights: Record<string, number> = {};
  for (const e of engineNames) {
    const p = perf[e]!;
    if (p.total < 5) {
      weights[e] = 1.0; // not enough data → equal weight
    } else {
      const accuracy = p.correct / p.total;
      // Weight in range [0.3, 2.0] based on accuracy vs baseline (10%)
      weights[e] = Math.max(0.3, Math.min(2.0, accuracy / 0.10));
    }
  }
  return weights;
}

// ─── Weighted Ensemble (Engine 18) ────────────────────────────────────────

function weightedEnsemble(
  engines: EngineResult[]
): Array<{ number: string; score: number }> {
  const scoreMap: Record<string, number> = {};
  let totalWeight = 0;
  for (const eng of engines) {
    if (!eng.signal || eng.candidates.length === 0) continue;
    const w = eng.weight;
    totalWeight += w;
    for (const c of eng.candidates.slice(0, 100)) {
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * w;
    }
  }
  if (totalWeight === 0) return [];
  const entries = Object.entries(scoreMap).map(([number, score]) => ({
    number,
    score: score / totalWeight,
  }));
  entries.sort((a, b) => b.score - a.score);
  return entries;
}

// ─── Confidence Score ──────────────────────────────────────────────────────

function computeConfidence(
  engines: EngineResult[],
  topCandidates: Array<{ number: string; score: number }>,
  backtest: BacktestSummary | null,
  n: number
): ConfidenceBreakdown {
  // 1. Engine agreement: fraction of signal engines with top candidate in their top-10
  const topNum = topCandidates[0]?.number;
  const signalEngines = engines.filter((e) => e.signal && e.candidates.length > 0);
  const agreeCount = topNum
    ? signalEngines.filter((e) => e.candidates.slice(0, 10).some((c) => c.number === topNum)).length
    : 0;
  const agreement = signalEngines.length > 0 ? agreeCount / signalEngines.length : 0;

  // 2. Entropy of score distribution (lower = more concentrated = better)
  const scores = topCandidates.slice(0, 50).map((c) => c.score);
  const totalScore = scores.reduce((a, v) => a + v, 0);
  let H = 0;
  if (totalScore > 0) {
    for (const s of scores) {
      const p = s / totalScore;
      if (p > 0) H -= p * Math.log2(p);
    }
  }
  const maxH = Math.log2(scores.length || 1);
  const entropyScore = maxH > 0 ? Math.max(0, 1 - H / maxH) : 0;

  // 3. Concentration: how much better is top vs second
  const s0 = topCandidates[0]?.score ?? 0;
  const s1 = topCandidates[1]?.score ?? 0;
  const concentration = s0 > 0 ? (s0 - s1) / s0 : 0;

  // 4. Data quality
  const dataQuality = Math.min(1, n / 500);

  // 5. Backtest score: use avg of As+Ekor hit rate (digit-level, not 4D exact)
  let backtestScore = 0.5; // neutral default
  if (backtest) {
    const avgDigitHit =
      (backtest.last100.hitRateAs + backtest.last100.hitRateEkor) / 2;
    // Expected random = 10% per digit. Scale: 10%→0.4, 15%→0.6, 20%→0.8
    backtestScore = Math.min(1, Math.max(0, (avgDigitHit - 0.10) / 0.10 * 0.3 + 0.4));
  }

  const total =
    0.35 * agreement +
    0.20 * entropyScore +
    0.20 * concentration +
    0.10 * dataQuality +
    0.15 * backtestScore;

  return {
    agreement: Math.round(agreement * 1000) / 1000,
    entropy: Math.round(entropyScore * 1000) / 1000,
    concentration: Math.round(concentration * 1000) / 1000,
    dataQuality: Math.round(dataQuality * 1000) / 1000,
    backtestScore: Math.round(backtestScore * 1000) / 1000,
    total: Math.round(Math.min(1, Math.max(0, total)) * 1000) / 1000,
  };
}

// ─── Explainable AI: Per-Digit Explanation ────────────────────────────────

function buildDigitExplanations(
  prediction: string,
  engines: EngineResult[],
  ctx: { freq: Record<string, number>; n: number; freq30: Record<string, number>; seenNumbers: string[] }
): DigitExplanation[][] {
  const result: DigitExplanation[][] = [];
  for (let p = 0; p < 4; p++) {
    const digit = prediction[p]!;
    const digitNum = parseInt(digit, 10);
    const positionExps: DigitExplanation[] = [];

    // Find engines that support this digit at this position
    const supportingEngines: string[] = [];
    let totalPosScore = 0;
    let transitionScore = 0;
    let correlationScore = 0;

    for (const eng of engines) {
      if (!eng.signal) continue;
      const ps = eng.posScores[p];
      if (!ps) continue;
      const ds = ps[digitNum] ?? 0;
      if (ds > 0.3) supportingEngines.push(eng.label);
      totalPosScore += ds;
      if (eng.name === "transition" || eng.name === "markov2") transitionScore += ds;
      if (eng.name === "correlation") correlationScore += ds;
    }

    // Frequency stats
    const totalDraws = ctx.n;
    let digitFreq = 0;
    for (const num of ctx.seenNumbers) {
      if (num[p] === digit) digitFreq += ctx.freq[num] ?? 0;
    }
    const frequencyPct = totalDraws > 0 ? (digitFreq / totalDraws) * 100 : 0;

    // Momentum: compare recent vs overall
    let digitFreq30 = 0;
    for (const num of ctx.seenNumbers) {
      if (num[p] === digit) digitFreq30 += ctx.freq30[num] ?? 0;
    }
    const recentRate = digitFreq30 / Math.min(totalDraws, 30);
    const overallRate = digitFreq / totalDraws;
    const momentum = overallRate > 0 ? recentRate / overallRate - 1 : 0;

    const signalCount = signalEngines(engines).length;
    const agreePct = signalCount > 0 ? (supportingEngines.length / signalCount) * 100 : 0;

    positionExps.push({
      digit,
      positionName: POSITION_NAMES[p]!,
      score: signalCount > 0 ? totalPosScore / signalCount : 0,
      supportingEngines,
      frequency: digitFreq,
      frequencyPct: Math.round(frequencyPct * 10) / 10,
      momentum: Math.round(momentum * 1000) / 1000,
      transitionScore: Math.round(transitionScore * 1000) / 1000,
      correlationScore: Math.round(correlationScore * 1000) / 1000,
      reason: buildReason(digit, p, supportingEngines, frequencyPct, momentum, agreePct),
    });

    result.push(positionExps);
  }
  return result;
}

function signalEngines(engines: EngineResult[]): EngineResult[] {
  return engines.filter((e) => e.signal);
}

function buildReason(
  digit: string, pos: number, supporting: string[],
  freqPct: number, momentum: number, agreePct: number
): string {
  const parts: string[] = [];
  parts.push(`Digit ${digit} di ${POSITION_NAMES[pos]}`);
  parts.push(`frekuensi historis ${freqPct.toFixed(1)}%`);
  if (momentum > 0.1) parts.push(`momentum positif (+${(momentum * 100).toFixed(0)}%)`);
  else if (momentum < -0.1) parts.push(`momentum negatif (${(momentum * 100).toFixed(0)}%)`);
  if (supporting.length > 0) parts.push(`didukung ${supporting.length} engine (${agreePct.toFixed(0)}% agreement)`);
  return parts.join(", ") + ".";
}

// ─── Smart BBFS ───────────────────────────────────────────────────────────

function generateBBFS(
  engines: EngineResult[],
  topCandidates: Array<{ number: string; score: number }>,
  freq: Record<string, number>,
  n: number
): string[] {
  // Build posScores from ensemble of all signal engines
  const ensemblePosScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  const signalEng = engines.filter((e) => e.signal && e.candidates.length > 0);
  let totalW = 0;
  for (const eng of signalEng) {
    const w = eng.weight;
    totalW += w;
    for (let p = 0; p < 4; p++) {
      for (let d = 0; d < 10; d++) {
        ensemblePosScores[p]![d]! += (eng.posScores[p]?.[d] ?? 0) * w;
      }
    }
  }
  if (totalW > 0) {
    for (let p = 0; p < 4; p++) {
      for (let d = 0; d < 10; d++) {
        ensemblePosScores[p]![d]! /= totalW;
      }
    }
  }

  // Select top 4 digits per position (above 50% of max score)
  const topDigits: number[][] = [];
  for (let p = 0; p < 4; p++) {
    const maxScore = Math.max(...ensemblePosScores[p]!);
    const threshold = maxScore * 0.50;
    const digs: number[] = [];
    for (let d = 0; d < 10; d++) {
      if ((ensemblePosScores[p]![d] ?? 0) >= threshold) digs.push(d);
    }
    // Ensure at least 2 digits per position
    if (digs.length < 2) {
      const sorted = [...ensemblePosScores[p]!]
        .map((s, i) => ({ s, i }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .map((x) => x.i);
      topDigits.push(sorted);
    } else {
      topDigits.push(digs.slice(0, 5)); // max 5 per position
    }
  }

  // Generate combinations
  const combinations: string[] = [];
  for (const d0 of topDigits[0]!) {
    for (const d1 of topDigits[1]!) {
      for (const d2 of topDigits[2]!) {
        for (const d3 of topDigits[3]!) {
          combinations.push(`${d0}${d1}${d2}${d3}`);
        }
      }
    }
  }

  // Filter by statistical constraints
  const filtered = combinations.filter((combo) => {
    const ds = combo.split("").map(Number);
    const sum = ds.reduce((a, v) => a + v, 0);
    const evenCount = ds.filter((d) => d % 2 === 0).length;
    const bigCount = ds.filter((d) => d >= 5).length;
    const allSame = ds.every((d) => d === ds[0]);
    const allSeq = ds.every((d, i) => i === 0 || d === ds[i - 1]! + 1);

    if (allSame) return false;           // all same digit (e.g. 3333)
    if (allSeq) return false;            // all sequential (e.g. 1234)
    if (sum < 4 || sum > 32) return false; // extreme sums
    if (evenCount === 4 || evenCount === 0) {
      // Allow but down-rank — actually just filter out all-even and all-odd
      return false;
    }
    if (bigCount === 4 || bigCount === 0) return false; // all big or all small

    // Transition check: each pair of consecutive digits should have appeared together
    // (skip if no transition data)
    return true;
  });

  // Sort by ensemble score
  const scored = (filtered.length > 0 ? filtered : combinations.slice(0, 50))
    .map((n) => ({
      number: n,
      score: (topCandidates.find((c) => c.number === n)?.score ?? 0) + (freq[n] ?? 0) * 0.001,
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 60).map((x) => x.number);
}

// ─── Main V3 Predictor ────────────────────────────────────────────────────

export async function runPredictionV3(
  draws: FlatDraw[],
  period: string,
  predictionHistory: Array<{ engineBreakdown: string | null; matchedDigits: number | null }>,
  skipBacktest = false
): Promise<PredictionV3Result> {
  const now = new Date().toISOString();

  if (draws.length < MIN_DRAWS) {
    return {
      prediction: null, noSignal: true,
      noSignalReason: `Data tidak cukup: ${draws.length} draw (minimum ${MIN_DRAWS})`,
      confidence: 0,
      confidenceBreakdown: { agreement: 0, entropy: 0, concentration: 0, dataQuality: draws.length / MIN_DRAWS, backtestScore: 0, total: 0 },
      period, dataPoints: draws.length,
      engines: [], digitExplanations: [], topCandidates: [], bbfsCandidates: [],
      backtest: null, generatedAt: now,
    };
  }

  // Compute adaptive weights from history
  const weights = computeAdaptiveWeightsV3(predictionHistory);

  // Build context once (shared across all engines)
  const ctx = buildContext(draws, period, weights);

  // Run all 17 engines
  const engines = runAllEngines(ctx);

  // Apply adaptive weights from history to engine results
  for (const eng of engines) {
    eng.weight = weights[eng.name] ?? 1.0;
  }

  // Engine 18: Weighted Ensemble
  const ensembleCandidates = weightedEnsemble(engines);

  if (ensembleCandidates.length === 0) {
    return {
      prediction: null, noSignal: true,
      noSignalReason: "Tidak ada kandidat yang dihasilkan oleh ensemble. Semua engine tidak memiliki sinyal.",
      confidence: 0,
      confidenceBreakdown: { agreement: 0, entropy: 0, concentration: 0, dataQuality: ctx.n / 500, backtestScore: 0, total: 0 },
      period, dataPoints: ctx.n,
      engines: engines.map((e) => ({ ...e, candidates: e.candidates.slice(0, 20) })),
      digitExplanations: [], topCandidates: [], bbfsCandidates: [],
      backtest: null, generatedAt: now,
    };
  }

  // Walk-forward backtest (optional, expensive)
  let backtest: BacktestSummary | null = null;
  if (!skipBacktest && draws.length >= 100) {
    backtest = runWalkForwardBacktest(draws, period);
  }

  // Confidence
  const topCandidates = ensembleCandidates.slice(0, 30).map((c, i) => ({ ...c, rank: i + 1 }));
  const confBreakdown = computeConfidence(engines, ensembleCandidates, backtest, ctx.n);
  const confidence = confBreakdown.total;

  // Check engine agreement for NO SIGNAL
  const signalCount = engines.filter((e) => e.signal).length;
  const agreeCount = ensembleCandidates[0]?.number
    ? engines.filter((e) => e.signal && e.candidates.slice(0, 10).some((c) => c.number === ensembleCandidates[0]!.number)).length
    : 0;
  const agreementRatio = signalCount > 0 ? agreeCount / signalCount : 0;

  // NO SIGNAL conditions
  if (confidence < CONFIDENCE_THRESHOLD) {
    const noSignalReason = [
      confidence < CONFIDENCE_THRESHOLD ? `Confidence ${(confidence * 100).toFixed(1)}% < ${CONFIDENCE_THRESHOLD * 100}%` : null,
      agreementRatio < 0.20 ? `Engine agreement ${(agreementRatio * 100).toFixed(0)}% < 20%` : null,
    ]
      .filter(Boolean)
      .join("; ");

    // Still return top candidates for informational purposes
    const bbfs = generateBBFS(engines, ensembleCandidates, ctx.freq, ctx.n);
    return {
      prediction: null, noSignal: true, noSignalReason,
      confidence, confidenceBreakdown: confBreakdown,
      period, dataPoints: ctx.n,
      engines: engines.map((e) => ({ ...e, candidates: e.candidates.slice(0, 10) })),
      digitExplanations: [],
      topCandidates,
      bbfsCandidates: bbfs,
      backtest, generatedAt: now,
    };
  }

  // Has signal → use top candidate as prediction
  const prediction = ensembleCandidates[0]!.number;
  const digitExplanations = buildDigitExplanations(prediction, engines, ctx);
  const bbfs = generateBBFS(engines, ensembleCandidates, ctx.freq, ctx.n);

  return {
    prediction, noSignal: false, noSignalReason: "",
    confidence, confidenceBreakdown: confBreakdown,
    period, dataPoints: ctx.n,
    engines: engines.map((e) => ({ ...e, candidates: e.candidates.slice(0, 10) })),
    digitExplanations,
    topCandidates,
    bbfsCandidates: bbfs,
    backtest, generatedAt: now,
  };
}
