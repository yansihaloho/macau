import type {
  FlatDraw, PredictionV4Result, ConfidenceBreakdownV4,
  DigitExplanationV4, AnomalyReport
} from "./types";
import { buildV4Context } from "./context";
import { runBaseEngines, runMetaEngines } from "./engines";
import { runBacktestV4 } from "./backtest";
import { loadEngineWeights } from "./self-learning";
import { digitSum } from "./context";
import { logger } from "../../lib/logger";

const POSITION_NAMES = ["As (Rb)", "Kop (Rt)", "Kepala (Pl)", "Ekor (St)"];

function generatePredictionId(): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.abs(Math.sin(Date.now()) * 10000)).toString(36).toUpperCase();
  return `V4-${now}-${rand}`;
}

function detectAnomalies(rawDraws: FlatDraw[]): AnomalyReport {
  const anomalies: string[] = [];
  let duplicatesRemoved = 0;
  let invalidRowsRemoved = 0;
  let outliersDetected = 0;

  const seen = new Set<string>();
  let validCount = 0;
  for (const d of rawDraws) {
    if (!d.result || !/^\d{4}$/.test(d.result) || !d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      invalidRowsRemoved++;
      continue;
    }
    const key = `${d.date}|${d.period}|${d.result}`;
    if (seen.has(key)) { duplicatesRemoved++; continue; }
    seen.add(key);
    validCount++;
  }

  if (duplicatesRemoved > 0) anomalies.push(`${duplicatesRemoved} duplikat draw dihapus`);
  if (invalidRowsRemoved > 0) anomalies.push(`${invalidRowsRemoved} row invalid dihapus`);
  if (validCount < 100) anomalies.push(`Data sangat sedikit: hanya ${validCount} draw valid`);

  // Check for outlier streak
  const validDraws = rawDraws.filter((d) => d.result && /^\d{4}$/.test(d.result));
  if (validDraws.length > 10) {
    const results = validDraws.map((d) => d.result);
    let maxStreak = 1; let curStreak = 1;
    for (let i = 1; i < results.length; i++) {
      if (results[i] === results[i - 1]) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
      else curStreak = 1;
    }
    if (maxStreak >= 5) {
      outliersDetected++;
      anomalies.push(`Anomali: streak ${maxStreak}× nomor yang sama berturut-turut`);
    }

    // Check distribution anomaly
    const freqMap: Record<string, number> = {};
    for (const r of results.slice(-100)) freqMap[r] = (freqMap[r] ?? 0) + 1;
    const freqVals = Object.values(freqMap);
    const mean = freqVals.reduce((a, v) => a + v, 0) / freqVals.length;
    const std = Math.sqrt(freqVals.reduce((a, v) => a + (v - mean) ** 2, 0) / freqVals.length);
    const maxFreq = Math.max(...freqVals);
    if (maxFreq > mean + 4 * std) {
      outliersDetected++;
      anomalies.push(`Distribusi tidak normal: satu nomor muncul ${maxFreq}× dalam 100 draw terakhir`);
    }
  }

  return {
    hasAnomaly: anomalies.length > 0,
    anomalies,
    dataIntegrity: invalidRowsRemoved > rawDraws.length * 0.1 ? "DATA_INVALID" : "VALID",
    duplicatesRemoved, invalidRowsRemoved, outliersDetected,
  };
}

function buildDigitExplanations(
  posScores: number[][],
  ctx: ReturnType<typeof buildV4Context>,
  allEngines: ReturnType<typeof runBaseEngines>
): DigitExplanationV4[][] {
  return posScores.map((digitScores, p) => {
    return Array.from({ length: 10 }, (_, d) => {
      const dStr = String(d);
      const posFreq = ctx.posCounts[p]![d] ?? 0;
      const total = ctx.posCounts[p]!.reduce((a, v) => a + v, 0);
      const freqPct = total > 0 ? Math.round((posFreq / total) * 1000) / 10 : 0;

      const supportingEngines = allEngines
        .filter((e) => e.signal && (e.posScores[p]?.[d] ?? 0) > 0.3)
        .map((e) => e.label);

      const scoreR7 = ctx.freq7;
      const scoreR30 = ctx.freq30;
      const r7Score = Object.entries(scoreR7).filter(([n]) => n[p] === dStr).reduce((a, [, v]) => a + v, 0);
      const r30Score = Object.entries(scoreR30).filter(([n]) => n[p] === dStr).reduce((a, [, v]) => a + v, 0);
      const momentumRaw = r7Score / (Math.min(ctx.n, 7) || 1) - r30Score / (Math.min(ctx.n, 30) || 1);
      const momentum = Math.max(-1, Math.min(1, momentumRaw * 10));

      const accelBase = Object.entries(ctx.freq14).filter(([n]) => n[p] === dStr).reduce((a, [, v]) => a + v, 0);
      const accelAdj = accelBase / (Math.min(ctx.n, 14) || 1) - r7Score / (Math.min(ctx.n, 7) || 1);
      const acceleration = Math.max(-1, Math.min(1, accelAdj * 10));

      const transEng = allEngines.find((e) => e.name === "transition");
      const transitionScore = transEng?.posScores[p]?.[d] ?? 0;
      const corrEng = allEngines.find((e) => e.name === "correlation");
      const correlationScore = corrEng?.posScores[p]?.[d] ?? 0;
      const entropyEng = allEngines.find((e) => e.name === "entropy");
      const entropyScore = entropyEng?.posScores[p]?.[d] ?? 0;
      const gapEng = allEngines.find((e) => e.name === "gapdist");
      const gapScore = gapEng?.posScores[p]?.[d] ?? 0;
      const bayesEng = allEngines.find((e) => e.name === "bayesian");
      const bayesianScore = bayesEng?.posScores[p]?.[d] ?? 0;

      const reasons: string[] = [];
      if (freqPct > 12) reasons.push(`frekuensi tinggi (${freqPct}%)`);
      if (momentum > 0.2) reasons.push(`momentum naik (+${(momentum * 100).toFixed(0)}%)`);
      if (transitionScore > 0.7) reasons.push("transisi Markov kuat");
      if (supportingEngines.length >= 5) reasons.push(`${supportingEngines.length} engine mendukung`);
      if (gapScore > 0.7) reasons.push("overdue (gap analysis)");
      if (bayesianScore > 0.7) reasons.push("posterior Bayesian tinggi");

      return {
        digit: dStr, positionName: POSITION_NAMES[p] ?? `Posisi ${p + 1}`,
        score: digitScores[d] ?? 0, supportingEngines,
        frequency: posFreq, frequencyPct: freqPct,
        momentum, acceleration, transitionScore, correlationScore,
        entropyScore, gapScore, bayesianScore,
        reason: reasons.length > 0 ? reasons.join(", ") : "tidak ada sinyal dominan",
      };
    }).sort((a, b) => b.score - a.score);
  });
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

function computeConfidence(
  engines: ReturnType<typeof runBaseEngines>,
  topCandidates: Array<{ number: string; score: number }>,
  backtest: ReturnType<typeof runBacktestV4>
): ConfidenceBreakdownV4 {
  const signalEngines = engines.filter((e) => e.signal);
  const engineAgreement = signalEngines.length / Math.max(engines.length, 1);

  let entropyScore = 0.5;
  const entropyEng = engines.find((e) => e.name === "entropy");
  if (entropyEng?.explanation) {
    const match = entropyEng.explanation.match(/(\d+\.?\d*)%\s+of\s+max/);
    if (match) {
      const h = parseFloat(match[1]!) / 100;
      entropyScore = 1 - h;
    } else if (!entropyEng.signal) {
      // Neutral-ish default: entropy engine not signalling doesn't mean fully random
      entropyScore = 0.35;
    } else {
      entropyScore = 0.5;
    }
  }

  const concentration = topCandidates.length > 0
    ? (topCandidates[0]?.score ?? 0) - (topCandidates[4]?.score ?? 0)
    : 0;

  const dataQuality = Math.min(1, engines.find((e) => e.candidates.length > 0)
    ? engines.filter((e) => e.candidates.length > 0).length / 31
    : 0.3);

  // When backtest is skipped (null), use neutral 0.5 baseline — do NOT penalise with 0
  // which would drag confidence down by 20% for every fast (no-backtest) prediction.
  const backtestScore = backtest
    ? Math.min(1, (
        (backtest.last30.hitRateEkor * 0.3) +
        (backtest.last100.hitRateEkor * 0.25) +
        (backtest.last300.hitRateEkor * 0.20) +
        (backtest.last500.hitRateEkor * 0.15) +
        (backtest.allHistory.hitRateEkor * 0.10)
      ) * 5)
    : 0.5;

  const scoreVariance = topCandidates.slice(1, 10).reduce((a, c, i) => {
    const prev = topCandidates[i]?.score ?? 0;
    return a + Math.abs(c.score - prev);
  }, 0);
  const stabilityScore = Math.max(0, 1 - scoreVariance * 2);

  const varianceScore = signalEngines.length > 0
    ? Math.min(1, signalEngines.reduce((a, e) => a + (e.candidates[0]?.score ?? 0), 0) / signalEngines.length)
    : 0;

  const total = (
    engineAgreement * 0.25 +
    entropyScore * 0.15 +
    concentration * 0.15 +
    dataQuality * 0.10 +
    backtestScore * 0.20 +
    stabilityScore * 0.10 +
    varianceScore * 0.05
  );

  return {
    engineAgreement: Math.round(engineAgreement * 1000) / 1000,
    entropyScore: Math.round(entropyScore * 1000) / 1000,
    concentration: Math.round(concentration * 1000) / 1000,
    dataQuality: Math.round(dataQuality * 1000) / 1000,
    backtestScore: Math.round(backtestScore * 1000) / 1000,
    stabilityScore: Math.round(stabilityScore * 1000) / 1000,
    varianceScore: Math.round(varianceScore * 1000) / 1000,
    total: Math.round(Math.max(0, Math.min(1, total)) * 1000) / 1000,
  };
}

export async function generateV4Prediction(
  rawDraws: FlatDraw[],
  period: string,
  skipBacktest = true
): Promise<PredictionV4Result> {
  const predictionId = generatePredictionId();
  const anomalyReport = detectAnomalies(rawDraws);

  const { weights, active, leaderboard } = await loadEngineWeights(period);
  const ctx = buildV4Context(rawDraws, period, weights, active);

  if (ctx.n < 20) {
    return {
      predictionId, prediction: null, noSignal: true,
      noSignalReason: `Data tidak cukup: hanya ${ctx.n} draw. Minimum 20 draw.`,
      confidence: 0,
      confidenceBreakdown: { engineAgreement: 0, entropyScore: 0, concentration: 0, dataQuality: 0, backtestScore: 0, stabilityScore: 0, varianceScore: 0, total: 0 },
      period, dataPoints: ctx.n, engines: [], activeEngines: 0, signalEngines: 0,
      digitExplanations: [[], [], [], []], topCandidates: [], bbfsCandidates: [],
      backtest: null, anomalyReport, engineLeaderboard: leaderboard,
      generatedAt: new Date().toISOString(),
    };
  }

  // Run all 40 engines
  const baseEngineResults = runBaseEngines(ctx);
  const metaEngineResults = runMetaEngines(ctx, baseEngineResults);
  const allEngines = [...baseEngineResults, ...metaEngineResults];

  // Build ensemble from ALL signal engines
  const signalEngines = allEngines.filter((e) => e.signal && e.candidates.length > 0);
  const totalWeight = signalEngines.reduce((a, e) => a + e.weight, 0);

  const scoreMap: Record<string, number> = {};
  for (const eng of signalEngines) {
    const w = totalWeight > 0 ? eng.weight / totalWeight : 1 / signalEngines.length;
    for (const c of eng.candidates.slice(0, 50)) {
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * w;
    }
  }
  const topCandidates = Object.entries(scoreMap)
    .map(([number, score], idx) => ({ number, score, rank: idx + 1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((c, idx) => ({ ...c, rank: idx + 1 }));

  const backtest = skipBacktest ? null : runBacktestV4(ctx.draws, period);
  const confidenceBreakdown = computeConfidence(allEngines, topCandidates, backtest);

  // NO SIGNAL conditions — single source of truth is the confidence threshold.
  // Entropy is already factored into confidenceBreakdown.entropyScore (0.35 = moderate,
  // 0.1 = high entropy), so a separate hard-stop for entropy would double-penalise.
  const engineConsensusRatio = signalEngines.length / Math.max(allEngines.length, 1);

  let noSignal = false;
  let noSignalReason = "";
  if (ctx.n < 100) {
    noSignal = true;
    noSignalReason = `Data historis tidak cukup: ${ctx.n} draw. Diperlukan minimal 100 draw untuk V4 analysis.`;
  } else if (confidenceBreakdown.total < 0.60) {
    noSignal = true;
    noSignalReason = `Confidence ${(confidenceBreakdown.total * 100).toFixed(1)}% < threshold 60%. Sistem tidak dapat memberikan prediksi yang dapat diandalkan.`;
  } else if (engineConsensusRatio < 0.50) {
    noSignal = true;
    noSignalReason = `Konsensus engine terlalu rendah: hanya ${signalEngines.length}/${allEngines.length} engine aktif (${(engineConsensusRatio * 100).toFixed(0)}% < 50%).`;
  }

  const prediction = noSignal ? null : (topCandidates[0]?.number ?? null);
  const bbfsCandidates = buildBBFS(topCandidates);

  // Build combined posScores for digit explanations
  const combinedPosScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (const eng of signalEngines) {
    const w = totalWeight > 0 ? eng.weight / totalWeight : 1 / signalEngines.length;
    for (let p = 0; p < 4; p++) {
      for (let d = 0; d < 10; d++) {
        combinedPosScores[p]![d]! += (eng.posScores[p]?.[d] ?? 0) * w;
      }
    }
  }

  const digitExplanations = buildDigitExplanations(combinedPosScores, ctx, allEngines);

  const auditReasoning = `Prediction ${predictionId} for session ${period}. ${signalEngines.length}/40 engines active. Confidence=${(confidenceBreakdown.total * 100).toFixed(1)}%. Top engines: ${signalEngines.slice(0, 5).map((e) => e.label).join(", ")}.`;
  logger.info({ predictionId, period, confidence: confidenceBreakdown.total, prediction, noSignal }, "V4 prediction generated");

  return {
    predictionId, prediction, noSignal, noSignalReason,
    confidence: confidenceBreakdown.total,
    confidenceBreakdown, period, dataPoints: ctx.n,
    engines: allEngines,
    activeEngines: allEngines.filter((e) => e.isActive).length,
    signalEngines: signalEngines.length,
    digitExplanations, topCandidates, bbfsCandidates,
    backtest, anomalyReport, engineLeaderboard: leaderboard,
    generatedAt: new Date().toISOString(),
  };
}
