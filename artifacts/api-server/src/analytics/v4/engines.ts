import type { V4Context, EngineResultV4 } from "./types";
import {
  normalize, normalizePosScores, posScoresToCandidates,
  derivePosScores, emptyEngineV4, digitSum
} from "./context";

// ─── Engine 1: Markov Chain Order 1 ───────────────────────────────────────

export function engineMarkov1(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 20) return emptyEngineV4("markov1", "Markov Chain Order-1", "base");
  const ld = ctx.lastDigits[0];
  if (!ld) return emptyEngineV4("markov1", "Markov Chain Order-1", "base");

  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let p = 0; p < 4; p++) {
    const lastD = parseInt(ld[p]!, 10);
    const row = ctx.T1[p]![lastD]!;
    const tot = row.reduce((a, v) => a + v, 0);
    if (tot > 0) {
      for (let d = 0; d < 10; d++) posScores[p]![d] = (row[d] ?? 0) / tot;
    }
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "markov1", label: "Markov Chain Order-1", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["markov1"] ?? 1,
    explanation: `Order-1 per-position transition from last draw ${ld.join("")}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["markov1"] !== false,
  };
}

// ─── Engine 2: Markov Chain Order 2 ───────────────────────────────────────

export function engineMarkov2(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("markov2", "Markov Chain Order-2", "base");
  const ld = ctx.lastDigits;
  if (!ld[0] || !ld[1]) return emptyEngineV4("markov2", "Markov Chain Order-2", "base");

  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  let totalSignal = 0;
  for (let p = 0; p < 4; p++) {
    const st = `${ld[1]![p]},${ld[0]![p]}`;
    const row = ctx.T2[p]![st];
    if (row) {
      const tot = Object.values(row).reduce((a, v) => a + v, 0);
      if (tot > 0) {
        for (let d = 0; d < 10; d++) posScores[p]![d] = (row[String(d)] ?? 0) / tot;
        totalSignal++;
      }
    } else {
      const lastD = parseInt(ld[0]![p]!, 10);
      const rowT1 = ctx.T1[p]![lastD]!;
      const tot = rowT1.reduce((a, v) => a + v, 0);
      if (tot > 0) { for (let d = 0; d < 10; d++) posScores[p]![d] = (rowT1[d] ?? 0) / tot; totalSignal++; }
    }
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "markov2", label: "Markov Chain Order-2", category: "base",
    candidates, posScores: ps, signal: totalSignal >= 2,
    weight: ctx.engineWeights["markov2"] ?? 1,
    explanation: `Order-2 state (${ld[1]!.join("")}→${ld[0]!.join("")}). ${totalSignal}/4 positions resolved.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["markov2"] !== false,
  };
}

// ─── Engine 3: Markov Chain Order 3 ───────────────────────────────────────

export function engineMarkov3(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("markov3", "Markov Chain Order-3", "base");
  const ld = ctx.lastDigits;
  if (!ld[0] || !ld[1] || !ld[2]) return emptyEngineV4("markov3", "Markov Chain Order-3", "base");

  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  let totalSignal = 0;
  for (let p = 0; p < 4; p++) {
    const st3 = `${ld[2]![p]},${ld[1]![p]},${ld[0]![p]}`;
    const row3 = ctx.T3[p]![st3];
    if (row3) {
      const tot = Object.values(row3).reduce((a, v) => a + v, 0);
      if (tot > 0) { for (let d = 0; d < 10; d++) posScores[p]![d] = (row3[String(d)] ?? 0) / tot; totalSignal++; }
    } else {
      const st2 = `${ld[1]![p]},${ld[0]![p]}`;
      const row2 = ctx.T2[p]![st2];
      if (row2) {
        const tot = Object.values(row2).reduce((a, v) => a + v, 0);
        if (tot > 0) { for (let d = 0; d < 10; d++) posScores[p]![d] = (row2[String(d)] ?? 0) / tot; totalSignal++; }
      }
    }
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "markov3", label: "Markov Chain Order-3", category: "base",
    candidates, posScores: ps, signal: totalSignal >= 2,
    weight: ctx.engineWeights["markov3"] ?? 1,
    explanation: `Order-3 state (${ld[2]!.join("")}→${ld[1]!.join("")}→${ld[0]!.join("")}). ${totalSignal}/4 resolved.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["markov3"] !== false,
  };
}

// ─── Engine 4: Hidden Markov Model ────────────────────────────────────────

export function engineHMM(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 60 || ctx.hmmObs.length < 10) return emptyEngineV4("hmm", "Hidden Markov Model", "base");
  const A = [[0.5, 0.5], [0.5, 0.5]];
  const obs = ctx.hmmObs;
  let prev = obs[0]! === 1 ? 0 : 1;
  for (let i = 1; i < obs.length; i++) {
    const cur = obs[i]! === 1 ? 0 : 1;
    A[prev]![cur]! += 1; prev = cur;
  }
  for (let s = 0; s < 2; s++) {
    const tot = (A[s]![0] ?? 0) + (A[s]![1] ?? 0);
    if (tot > 0) { A[s]![0]! /= tot; A[s]![1]! /= tot; }
  }
  const hotObs = obs.filter((v) => v === 1).length / obs.length;
  const B = [[Math.max(0.05, Math.min(0.95, hotObs + 0.1)), Math.max(0.05, Math.min(0.95, 1 - hotObs - 0.1))],
             [Math.max(0.05, Math.min(0.95, hotObs - 0.1)), Math.max(0.05, Math.min(0.95, 1 - hotObs + 0.1))]];
  let alpha = [0.5, 0.5];
  for (const o of obs.slice(-15)) {
    const next = [0, 0];
    for (let s = 0; s < 2; s++) {
      for (let pr = 0; pr < 2; pr++) next[s]! += alpha[pr]! * (A[pr]![s] ?? 0.5);
      next[s]! *= (B[s]![o] ?? 0.5);
    }
    const norm = (next[0] ?? 0) + (next[1] ?? 0);
    alpha = norm > 0 ? [(next[0] ?? 0) / norm, (next[1] ?? 0) / norm] : [0.5, 0.5];
  }
  const pHot = alpha[0] ?? 0.5;
  let scored: Array<{ number: string; score: number }>;
  if (pHot > 0.5) {
    scored = ctx.seenNumbers.map((n) => ({ number: n, score: (ctx.freq[n] ?? 0) >= ctx.medianFreq ? (ctx.freq30[n] ?? 0) + 1 : 0 }));
  } else {
    scored = ctx.seenNumbers.map((n) => {
      const gap = ctx.n - 1 - (ctx.lastSeenIdx[n] ?? 0);
      return { number: n, score: (ctx.freq[n] ?? 0) < ctx.medianFreq ? gap : 0 };
    });
  }
  scored = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "hmm", label: "Hidden Markov Model", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["hmm"] ?? 1,
    explanation: `P(Hot)=${(pHot * 100).toFixed(0)}%. State: ${pHot > 0.5 ? "HOT" : "COLD"}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["hmm"] !== false,
  };
}

// ─── Engine 5: Transition Matrix ──────────────────────────────────────────

export function engineTransitionMatrix(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 20) return emptyEngineV4("transition", "Transition Matrix", "base");
  const ld = ctx.lastDigits[0];
  if (!ld) return emptyEngineV4("transition", "Transition Matrix", "base");
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let p = 0; p < 4; p++) {
    const lastD = parseInt(ld[p]!, 10);
    const row = ctx.T1[p]![lastD]!;
    const tot = row.reduce((a, v) => a + v, 0);
    if (tot > 0) for (let d = 0; d < 10; d++) posScores[p]![d] = (row[d] ?? 0) / tot;
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "transition", label: "Transition Matrix", category: "base",
    candidates, posScores: ps, signal: true,
    weight: ctx.engineWeights["transition"] ?? 1,
    explanation: `Full digit transition matrix. Last draw: ${ld.join("")}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["transition"] !== false,
  };
}

// ─── Engine 6: Poisson Gap ────────────────────────────────────────────────

export function enginePoissonGap(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("poisson", "Poisson Gap Model", "base");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const gs = ctx.gapStats[n];
    if (!gs || gs.mean <= 0) continue;
    const lambda = 1 / gs.mean;
    const score = 1 - Math.exp(-lambda * gs.currentGap);
    scored.push({ number: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "poisson", label: "Poisson Gap Model", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["poisson"] ?? 1,
    explanation: `Exponential gap model. λ=1/avg_gap. Overdue numbers ranked higher.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["poisson"] !== false,
  };
}

// ─── Engine 7: Global Frequency ───────────────────────────────────────────

export function engineGlobalFreq(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 20) return emptyEngineV4("globalfreq", "Global Frequency", "base");
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: ctx.freq[n] ?? 0 }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "globalfreq", label: "Global Frequency", category: "base",
    candidates, posScores: ps, signal: true,
    weight: ctx.engineWeights["globalfreq"] ?? 1,
    explanation: `All-time frequency. Top: ${candidates.slice(0, 3).map((c) => `${c.number}(×${ctx.freq[c.number] ?? 0})`).join(", ")}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["globalfreq"] !== false,
  };
}

// ─── Engine 8: Local Frequency ────────────────────────────────────────────

export function engineLocalFreq(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 14) return emptyEngineV4("localfreq", "Local Frequency", "base");
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (ctx.freq14[n] ?? 0) * 2 + (ctx.freq7[n] ?? 0) * 3 }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.filter((x) => x.score > 0).slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "localfreq", label: "Local Frequency", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["localfreq"] ?? 1,
    explanation: `Last 7 (×3) and last 14 (×2) draw frequency combined. Ultra-short-term signal.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["localfreq"] !== false,
  };
}

// ─── Engine 9: Multi Window Recency ───────────────────────────────────────

export function engineMultiRecency(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("multirecency", "Multi Window Recency", "base");
  const scored = ctx.seenNumbers.map((n) => {
    const r7 = (ctx.freq7[n] ?? 0) / Math.min(ctx.n, 7);
    const r30 = (ctx.freq30[n] ?? 0) / Math.min(ctx.n, 30);
    const r100 = (ctx.freq100[n] ?? 0) / Math.min(ctx.n, 100);
    const r300 = (ctx.freq300[n] ?? 0) / Math.min(ctx.n, 300);
    const rAll = (ctx.freq[n] ?? 0) / ctx.n;
    return { number: n, score: 0.35 * r7 + 0.30 * r30 + 0.20 * r100 + 0.10 * r300 + 0.05 * rAll };
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "multirecency", label: "Multi Window Recency", category: "base",
    candidates, posScores: ps, signal: true,
    weight: ctx.engineWeights["multirecency"] ?? 1,
    explanation: `Weighted recency: 35% last-7, 30% last-30, 20% last-100, 10% last-300, 5% all.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["multirecency"] !== false,
  };
}

// ─── Engine 10: Momentum ──────────────────────────────────────────────────

export function engineMomentum(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 100) return emptyEngineV4("momentum", "Momentum", "base");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const r30 = (ctx.freq30[n] ?? 0) / 30;
    const r100 = (ctx.freq100[n] ?? 0) / 100;
    const accel = r30 / (r100 + 1e-9) - 1;
    if (accel > 0) scored.push({ number: n, score: accel });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "momentum", label: "Momentum", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["momentum"] ?? 1,
    explanation: `Positive momentum: rate-30 / rate-100 - 1 > 0. ${scored.length} rising numbers.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["momentum"] !== false,
  };
}

// ─── Engine 11: Acceleration ──────────────────────────────────────────────

export function engineAcceleration(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 100) return emptyEngineV4("acceleration", "Acceleration", "base");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const r7 = (ctx.freq7[n] ?? 0) / Math.min(ctx.n, 7);
    const r30 = (ctx.freq30[n] ?? 0) / 30;
    const r100 = (ctx.freq100[n] ?? 0) / 100;
    const v1 = r7 / (r30 + 1e-9) - 1;
    const v2 = r30 / (r100 + 1e-9) - 1;
    const accel = v1 - v2;
    if (accel > 0.05) scored.push({ number: n, score: accel });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "acceleration", label: "Acceleration", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["acceleration"] ?? 1,
    explanation: `Second derivative of frequency: (rate7/rate30-1) - (rate30/rate100-1). ${scored.length} accelerating numbers.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["acceleration"] !== false,
  };
}

// ─── Engine 12: Repeat Pattern ────────────────────────────────────────────

export function engineRepeatPattern(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("repeat", "Repeat Pattern", "base");
  const lastResult = ctx.draws[ctx.n - 1]?.result ?? "";
  if (!lastResult) return emptyEngineV4("repeat", "Repeat Pattern", "base");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const rpts = ctx.repeatCounters[n] ?? 0;
    const tot = ctx.freq[n] ?? 1;
    const repeatRate = rpts / tot;
    const score = n === lastResult
      ? (repeatRate > 0 ? repeatRate * 2 : 0.05)
      : (ctx.freq30[n] ?? 0) / 30 * (1 - repeatRate);
    if (score > 0) scored.push({ number: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "repeat", label: "Repeat Pattern", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["repeat"] ?? 1,
    explanation: `Last draw ${lastResult} repeat rate: ${((ctx.repeatCounters[lastResult] ?? 0) / (ctx.freq[lastResult] ?? 1) * 100).toFixed(1)}%.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["repeat"] !== false,
  };
}

// ─── Engine 13: Day Pattern ───────────────────────────────────────────────

export function engineDayPattern(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("daypattern", "Day Pattern", "base");
  const dayData = ctx.dowFreq[ctx.targetDow] ?? {};
  const maxCount = Math.max(...Object.values(dayData), 1);
  if (Object.keys(dayData).length < 3) return emptyEngineV4("daypattern", "Day Pattern", "base");
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (dayData[n] ?? 0) / maxCount }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "daypattern", label: "Day Pattern", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["daypattern"] ?? 1,
    explanation: `Day-of-week ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][ctx.targetDow]} pattern. ${Object.keys(dayData).length} unique numbers.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["daypattern"] !== false,
  };
}

// ─── Engine 14: Session Pattern ───────────────────────────────────────────

export function engineSessionPattern(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("sessionpattern", "Session Pattern", "base");
  const sessData = ctx.sessionFreq[ctx.period] ?? {};
  const maxCount = Math.max(...Object.values(sessData), 1);
  if (Object.keys(sessData).length < 3) return emptyEngineV4("sessionpattern", "Session Pattern", "base");
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (sessData[n] ?? 0) / maxCount }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "sessionpattern", label: "Session Pattern", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["sessionpattern"] ?? 1,
    explanation: `Session ${ctx.period}. Top: ${scored.slice(0, 3).map((x) => `${x.number}(${sessData[x.number] ?? 0}×)`).join(", ")}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["sessionpattern"] !== false,
  };
}

// ─── Engine 15: Weekly Pattern ────────────────────────────────────────────

export function engineWeeklyPattern(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("weeklypattern", "Weekly Pattern", "base");
  const wom = ctx.currentWeekOfMonth;
  const weekData = ctx.weekOfMonthFreq[wom] ?? {};
  const maxCount = Math.max(...Object.values(weekData), 1);
  if (Object.keys(weekData).length < 3) return emptyEngineV4("weeklypattern", "Weekly Pattern", "base");
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (weekData[n] ?? 0) / maxCount }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "weeklypattern", label: "Weekly Pattern", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["weeklypattern"] ?? 1,
    explanation: `Week-of-month ${wom} pattern. ${Object.keys(weekData).length} unique numbers this week slot.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["weeklypattern"] !== false,
  };
}

// ─── Engine 16: Monthly Pattern ───────────────────────────────────────────

export function engineMonthlyPattern(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 100) return emptyEngineV4("monthlypattern", "Monthly Pattern", "base");
  const mData = ctx.monthFreq[ctx.currentMonthNum] ?? {};
  const maxCount = Math.max(...Object.values(mData), 1);
  if (Object.keys(mData).length < 3) return emptyEngineV4("monthlypattern", "Monthly Pattern", "base");
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (mData[n] ?? 0) / maxCount }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const monthNames = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return {
    name: "monthlypattern", label: "Monthly Pattern", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["monthlypattern"] ?? 1,
    explanation: `Month ${monthNames[ctx.currentMonthNum] ?? ctx.currentMonthNum} historical pattern. ${Object.keys(mData).length} unique.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["monthlypattern"] !== false,
  };
}

// ─── Engine 17: Correlation Position ─────────────────────────────────────

export function engineCorrelation(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 100) return emptyEngineV4("correlation", "Correlation Position", "base");
  const ld = ctx.lastDigits[0];
  if (!ld) return emptyEngineV4("correlation", "Correlation Position", "base");
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let pj = 0; pj < 4; pj++) {
    for (let d = 0; d < 10; d++) {
      let totalSignal = 0;
      for (let pi = 0; pi < 4; pi++) {
        if (pi === pj) continue;
        const key = `${ld[pi]},${String(d)}`;
        const cnt = ctx.corrMatrix[pi]![pj]![key] ?? 0;
        let totPi = 0;
        for (let dd = 0; dd < 10; dd++) totPi += ctx.corrMatrix[pi]![pj]![`${ld[pi]},${String(dd)}`] ?? 0;
        if (totPi > 0) totalSignal += cnt / totPi;
      }
      posScores[pj]![d] = totalSignal / 3;
    }
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "correlation", label: "Correlation Position", category: "base",
    candidates, posScores: ps, signal: true,
    weight: ctx.engineWeights["correlation"] ?? 1,
    explanation: `Cross-position digit correlation from last draw ${ld.join("")}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["correlation"] !== false,
  };
}

// ─── Engine 18: Digit Pair Correlation ───────────────────────────────────

export function engineDigitPair(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("digitpair", "Digit Pair Correlation", "base");
  const ld = ctx.lastDigits[0];
  if (!ld) return emptyEngineV4("digitpair", "Digit Pair Correlation", "base");
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let p = 0; p < 4; p++) {
    const ldp = ld[p]!;
    let totalCnt = 0;
    for (let d = 0; d < 10; d++) {
      const key = `${ldp}${d}@${p}`;
      const cnt = ctx.pairCounts[key] ?? 0;
      posScores[p]![d] = cnt;
      totalCnt += cnt;
    }
    if (totalCnt > 0) for (let d = 0; d < 10; d++) posScores[p]![d]! /= totalCnt;
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);

  // Count full-draw pair transitions
  const lastResult = ctx.draws[ctx.n - 1]?.result ?? "";
  const pairKey = `${lastResult}→`;
  const pairMatches = Object.entries(ctx.pairCounts)
    .filter(([k]) => k.startsWith(pairKey))
    .sort((a, b) => b[1] - a[1]);
  const topPairs = pairMatches.slice(0, 3).map(([k, v]) => `${k.replace(pairKey, "")}(${v}×)`).join(", ");

  return {
    name: "digitpair", label: "Digit Pair Correlation", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["digitpair"] ?? 1,
    explanation: `Digit pair transitions per position. After ${lastResult}: ${topPairs || "no pair data"}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["digitpair"] !== false,
  };
}

// ─── Engine 19: Triple Correlation ────────────────────────────────────────

export function engineTripleCorr(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("triplecorr", "Triple Correlation", "base");
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  let totalSignal = 0;
  const ld = ctx.lastDigits;
  if (!ld[0] || !ld[1] || !ld[2]) return emptyEngineV4("triplecorr", "Triple Correlation", "base");

  for (let p = 0; p < 4; p++) {
    const st = `${ld[2]![p]},${ld[1]![p]},${ld[0]![p]}`;
    const row = ctx.T3[p]![st];
    if (row) {
      const tot = Object.values(row).reduce((a, v) => a + v, 0);
      if (tot >= 3) {
        for (let d = 0; d < 10; d++) posScores[p]![d] = (row[String(d)] ?? 0) / tot;
        totalSignal++;
      }
    }
  }
  if (totalSignal === 0) return emptyEngineV4("triplecorr", "Triple Correlation", "base");
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "triplecorr", label: "Triple Correlation", category: "base",
    candidates, posScores: ps, signal: totalSignal >= 2,
    weight: ctx.engineWeights["triplecorr"] ?? 1,
    explanation: `Triple-position correlation (3-draw state). ${totalSignal}/4 positions have triple data.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["triplecorr"] !== false,
  };
}

// ─── Engine 20: Sum Digit Pattern ─────────────────────────────────────────

export function engineSumDigit(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("sumdigit", "Sum Digit Pattern", "base");
  const maxSum30 = Math.max(...ctx.sumFreq30);
  if (maxSum30 === 0) return emptyEngineV4("sumdigit", "Sum Digit Pattern", "base");
  const scored = ctx.seenNumbers.map((n) => {
    const s = digitSum(n);
    const score30 = (ctx.sumFreq30[s] ?? 0) / maxSum30;
    const maxSum100 = Math.max(...ctx.sumFreq100);
    const score100 = maxSum100 > 0 ? (ctx.sumFreq100[s] ?? 0) / maxSum100 : 0;
    return { number: n, score: 0.7 * score30 + 0.3 * score100 };
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const topSum = ctx.sumFreq30.indexOf(Math.max(...ctx.sumFreq30));
  return {
    name: "sumdigit", label: "Sum Digit Pattern", category: "base",
    candidates, posScores: ps, signal: true,
    weight: ctx.engineWeights["sumdigit"] ?? 1,
    explanation: `Top sums in last 30: ${ctx.sumFreq30.map((v, i) => ({ i, v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => `${x.i}(${x.v}×)`).join(", ")}. Predicted sum=${topSum}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["sumdigit"] !== false,
  };
}

// ─── Engine 21: Balance Equilibrium ──────────────────────────────────────

export function engineBalance(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("balance", "Balance Equilibrium", "base");
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let p = 0; p < 4; p++) {
    const [odd30, even30] = ctx.oddEvenFreq30[p]!;
    const [big30, small30] = ctx.bigSmallFreq30[p]!;
    const oddRatio = (odd30 ?? 0) / Math.max((odd30 ?? 0) + (even30 ?? 0), 1);
    const bigRatio = (big30 ?? 0) / Math.max((big30 ?? 0) + (small30 ?? 0), 1);
    const needEven = oddRatio > 0.6;
    const needSmall = bigRatio > 0.6;
    for (let d = 0; d < 10; d++) {
      let score = 0.5;
      const isEven = d % 2 === 0;
      const isBig = d >= 5;
      if (needEven && isEven) score += 0.25;
      if (!needEven && !isEven) score += 0.25;
      if (needSmall && !isBig) score += 0.25;
      if (!needSmall && isBig) score += 0.25;
      posScores[p]![d] = score;
    }
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "balance", label: "Balance Equilibrium", category: "base",
    candidates, posScores: ps, signal: true,
    weight: ctx.engineWeights["balance"] ?? 1,
    explanation: `Odd/Even and Big/Small imbalance correction. Last-30 distribution used.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["balance"] !== false,
  };
}

// ─── Engine 22: Entropy Analysis ──────────────────────────────────────────

export function engineEntropy(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("entropy", "Entropy Analysis", "base");
  const tot30 = Object.values(ctx.freq30).reduce((a, v) => a + v, 0);
  if (tot30 === 0) return emptyEngineV4("entropy", "Entropy Analysis", "base");
  let H = 0;
  for (const v of Object.values(ctx.freq30)) {
    if (v > 0) { const p = v / tot30; H -= p * Math.log2(p); }
  }
  const maxH = Math.log2(Object.keys(ctx.freq30).length || 1);
  const normalizedH = maxH > 0 ? H / maxH : 1;
  if (normalizedH > 0.92) {
    return {
      name: "entropy", label: "Entropy Analysis", category: "base",
      candidates: [], posScores: Array.from({ length: 4 }, () => new Array(10).fill(0)),
      signal: false, weight: ctx.engineWeights["entropy"] ?? 1,
      explanation: `HIGH entropy (${(normalizedH * 100).toFixed(1)}%). System too random. NO SIGNAL.`,
      winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["entropy"] !== false,
    };
  }
  const predictabilityScore = 1 - normalizedH;
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (ctx.freq30[n] ?? 0) / tot30 * predictabilityScore }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "entropy", label: "Entropy Analysis", category: "base",
    candidates, posScores: ps, signal: true,
    weight: ctx.engineWeights["entropy"] ?? 1,
    explanation: `H=${H.toFixed(2)} bits (${(normalizedH * 100).toFixed(1)}% of max). Predictability=${(predictabilityScore * 100).toFixed(1)}%.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["entropy"] !== false,
  };
}

// ─── Engine 23: Shannon Entropy per Position ──────────────────────────────

export function engineShannon(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("shannon", "Shannon Entropy", "base");
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let p = 0; p < 4; p++) {
    const counts = ctx.posCounts[p]!;
    const tot = counts.reduce((a, v) => a + v, 0);
    if (tot === 0) continue;
    let H = 0;
    for (const c of counts) { if (c > 0) { const prob = c / tot; H -= prob * Math.log2(prob); } }
    const maxH = Math.log2(10);
    const normalizedH = H / maxH;
    if (normalizedH > 0.95) continue;
    const predictability = 1 - normalizedH;
    for (let d = 0; d < 10; d++) {
      const freq30d = ctx.oddEvenFreq30[p] ? (d % 2 === 0 ? ctx.oddEvenFreq30[p]![1]! : ctx.oddEvenFreq30[p]![0]!) : 0;
      posScores[p]![d] = (counts[d] ?? 0) / tot * predictability + freq30d / Math.min(ctx.n, 30) * (1 - predictability);
    }
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "shannon", label: "Shannon Entropy", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["shannon"] ?? 1,
    explanation: `Per-position Shannon entropy. Low-entropy positions predict more reliably.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["shannon"] !== false,
  };
}

// ─── Engine 24: Cycle Detection ───────────────────────────────────────────

export function engineCycleDetection(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 100) return emptyEngineV4("cycle", "Cycle Detection", "base");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const gs = ctx.gapStats[n];
    if (!gs || gs.cv > 0.6 || gs.mean <= 0) continue;
    const score = Math.max(0, 1 - Math.abs(gs.currentGap - gs.mean) / (gs.mean + 1e-9));
    if (score > 0.1) scored.push({ number: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "cycle", label: "Cycle Detection", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["cycle"] ?? 1,
    explanation: `${scored.length} numbers with regular cycle (CV<0.6). Proximity to expected return scored.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["cycle"] !== false,
  };
}

// ─── Engine 25: Fourier Cycle Detection ───────────────────────────────────

export function engineFourier(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 60) return emptyEngineV4("fourier", "Fourier Cycle Detection", "base");
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));

  for (let p = 0; p < 4; p++) {
    const seq = ctx.posDrawSeq[p];
    if (!seq || seq.length < 20) continue;
    const L = seq.length;

    for (let d = 0; d < 10; d++) {
      const signal = seq.map((v) => (v === d ? 1.0 : 0.0));
      let maxAmp = 0;
      let bestFreq = 0;

      for (let k = 1; k <= Math.floor(L / 4); k++) {
        let re = 0; let im = 0;
        for (let i = 0; i < L; i++) {
          re += (signal[i] ?? 0) * Math.cos((2 * Math.PI * k * i) / L);
          im += (signal[i] ?? 0) * Math.sin((2 * Math.PI * k * i) / L);
        }
        const amp = Math.sqrt(re * re + im * im) / L;
        if (amp > maxAmp) { maxAmp = amp; bestFreq = k; }
      }

      if (bestFreq > 0) {
        const period = L / bestFreq;
        const phase = ctx.n % Math.max(1, Math.round(period));
        const expectedNext = Math.round(period / 4);
        posScores[p]![d] = maxAmp * (phase <= expectedNext ? 1.5 : 0.5);
      }
    }
  }

  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "fourier", label: "Fourier Cycle Detection", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["fourier"] ?? 1,
    explanation: `DFT-based cycle detection per position digit (last 100 draws). Dominant frequency phase used.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["fourier"] !== false,
  };
}

// ─── Engine 26: Hot Cold Number ───────────────────────────────────────────

export function engineHotCold(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("hotcold", "Hot Cold Number", "base");
  const hotInRecent = Object.values(ctx.freq30).filter((v) => v >= 2).length;
  const hotRegime = hotInRecent > Object.keys(ctx.freq30).length * 0.3;
  let scored: Array<{ number: string; score: number }>;
  if (hotRegime) {
    scored = ctx.seenNumbers.map((n) => ({ number: n, score: ctx.freq30[n] ?? 0 }));
  } else {
    scored = ctx.seenNumbers.map((n) => {
      const gs = ctx.gapStats[n];
      const overdueScore = gs ? Math.max(0, gs.overdueFactor - 1) : 0;
      return { number: n, score: overdueScore };
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "hotcold", label: "Hot Cold Number", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["hotcold"] ?? 1,
    explanation: `Regime: ${hotRegime ? "HOT" : "COLD"}. ${hotInRecent} hot numbers in last 30.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["hotcold"] !== false,
  };
}

// ─── Engine 27: Streak Analysis ───────────────────────────────────────────

export function engineStreak(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("streak", "Streak Analysis", "base");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const sd = ctx.streakData[n];
    if (!sd) continue;
    const freq = ctx.freq[n] ?? 1;
    const avgGap = ctx.n / freq;
    if (sd.isHot) {
      const score = Math.min(1, sd.current / 3) * 0.5 + (ctx.freq30[n] ?? 0) / 30 * 2;
      scored.push({ number: n, score });
    } else {
      const gs = ctx.gapStats[n];
      if (gs && gs.currentGap >= gs.mean * 0.8 && gs.cv < 0.7) {
        scored.push({ number: n, score: Math.min(1, gs.currentGap / gs.mean) });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const hotStreaks = Object.values(ctx.streakData).filter((s) => s.isHot && s.current > 1).length;
  return {
    name: "streak", label: "Streak Analysis", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["streak"] ?? 1,
    explanation: `${hotStreaks} numbers on hot streak. ${scored.length - hotStreaks} on cold streak waiting to appear.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["streak"] !== false,
  };
}

// ─── Engine 28: Gap Distribution ──────────────────────────────────────────

export function engineGapDist(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("gapdist", "Gap Distribution", "base");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const gs = ctx.gapStats[n];
    if (!gs || gs.mean <= 0) continue;
    const zScore = (gs.currentGap - gs.mean) / (gs.std + 1e-9);
    if (zScore >= 0.5) {
      scored.push({ number: n, score: Math.min(3, zScore) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "gapdist", label: "Gap Distribution", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["gapdist"] ?? 1,
    explanation: `Z-score of current gap vs historical distribution. Positive z-score = overdue (z≥0.5 threshold).`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["gapdist"] !== false,
  };
}

// ─── Engine 29: Bayesian Probability ─────────────────────────────────────

export function engineBayesian(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("bayesian", "Bayesian Probability", "base");
  const sessData = ctx.sessionFreq[ctx.period] ?? {};
  const dayData = ctx.dowFreq[ctx.targetDow] ?? {};
  const monthData = ctx.monthFreq[ctx.currentMonthNum] ?? {};
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const freqN = ctx.freq[n] ?? 0;
    if (freqN === 0) continue;
    const prior = freqN / ctx.n;
    const pSess = (sessData[n] ?? 0) / (freqN + 1);
    const pDay = (dayData[n] ?? 0) / (freqN + 1);
    const pMonth = (monthData[n] ?? 0) / (freqN + 1);
    const likelihood = (pSess + 0.1) * (pDay + 0.1) * (pMonth + 0.05);
    scored.push({ number: n, score: prior * likelihood });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "bayesian", label: "Bayesian Probability", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["bayesian"] ?? 1,
    explanation: `Posterior ∝ prior(freq) × P(session|n) × P(day|n) × P(month|n). Laplace smoothing applied.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["bayesian"] !== false,
  };
}

// ─── Engine 30: Conditional Probability ───────────────────────────────────

export function engineConditional(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("conditional", "Conditional Probability", "base");
  const lastResult = ctx.draws[ctx.n - 1]?.result ?? "";
  if (!lastResult) return emptyEngineV4("conditional", "Conditional Probability", "base");

  const pairKey = `${lastResult}→`;
  const nextProbs: Record<string, number> = {};
  let totalCount = 0;
  for (const [k, v] of Object.entries(ctx.pairCounts)) {
    if (k.startsWith(pairKey)) {
      const next = k.replace(pairKey, "");
      nextProbs[next] = (nextProbs[next] ?? 0) + v;
      totalCount += v;
    }
  }

  if (totalCount < 3) {
    const sumLast = digitSum(lastResult);
    const wantSumHigh = sumLast < 18;
    const scored2 = ctx.seenNumbers.map((n) => {
      const s = digitSum(n);
      return { number: n, score: (wantSumHigh ? s : 36 - s) / 36 * (ctx.freq30[n] ?? 0) };
    });
    scored2.sort((a, b) => b.score - a.score);
    const candidates2 = normalize(scored2.slice(0, 200));
    const ps2 = derivePosScores(candidates2, ctx.freq);
    return {
      name: "conditional", label: "Conditional Probability", category: "base",
      candidates: candidates2, posScores: ps2, signal: candidates2.length >= 5,
      weight: ctx.engineWeights["conditional"] ?? 1,
      explanation: `Fallback: sum pattern after ${lastResult}. Sum=${sumLast}, expecting ${wantSumHigh ? "higher" : "lower"} sum.`,
      winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["conditional"] !== false,
    };
  }

  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (nextProbs[n] ?? 0) / totalCount }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.filter((x) => x.score > 0).slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "conditional", label: "Conditional Probability", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["conditional"] ?? 1,
    explanation: `P(next | last=${lastResult}). ${totalCount} historical transitions found.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["conditional"] !== false,
  };
}

// ─── Engine 31: Position Dependency ───────────────────────────────────────

export function enginePositionDep(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 50) return emptyEngineV4("posdep", "Position Dependency", "base");
  const ld = ctx.lastDigits[0];
  if (!ld) return emptyEngineV4("posdep", "Position Dependency", "base");

  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let p = 0; p < 4; p++) {
    const ldDigit = parseInt(ld[p]!, 10);
    for (let d = 0; d < 10; d++) {
      let total = 0; let count = 0;
      for (const n of ctx.seenNumbers) {
        if (parseInt(n[p]!, 10) === ldDigit) {
          total++;
          for (let q = 0; q < 4; q++) {
            if (q !== p && parseInt(n[q]!, 10) === d) count++;
          }
        }
      }
      posScores[p]![d] = total > 0 ? count / total : 0;
    }
  }
  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "posdep", label: "Position Dependency", category: "base",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["posdep"] ?? 1,
    explanation: `Cross-position dependency: given last draw's per-position digit, predict other positions.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["posdep"] !== false,
  };
}

// ─── Meta Engine 32: Monte Carlo Validation ───────────────────────────────

export function engineMonteCarlo(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  if (ctx.n < 100) return emptyEngineV4("montecarlo", "Monte Carlo Validation", "meta");
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 5) return emptyEngineV4("montecarlo", "Monte Carlo Validation", "meta");

  const scoreMap: Record<string, number> = {};
  const ROUNDS = Math.min(50, signalEngines.length * 3);

  for (let round = 0; round < ROUNDS; round++) {
    const engineIdx = round % signalEngines.length;
    const eng = signalEngines[engineIdx]!;
    const weight = eng.weight;
    for (const c of eng.candidates.slice(0, 30)) {
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * weight;
    }
  }

  const scored = Object.entries(scoreMap)
    .map(([number, score]) => ({ number, score: score / ROUNDS }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "montecarlo", label: "Monte Carlo Validation", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["montecarlo"] ?? 0.8,
    explanation: `Deterministic Monte Carlo: ${ROUNDS} rounds sampling across ${signalEngines.length} signal engines.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["montecarlo"] !== false,
  };
}

// ─── Meta Engine 33: Bootstrap Validation ─────────────────────────────────

export function engineBootstrap(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  if (ctx.n < 100) return emptyEngineV4("bootstrap", "Bootstrap Validation", "meta");
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 5) return emptyEngineV4("bootstrap", "Bootstrap Validation", "meta");

  const candidateFreq: Record<string, number> = {};
  const totalEngines = signalEngines.length;

  for (let j = 0; j < totalEngines; j++) {
    const leaveOut = j;
    const subset = signalEngines.filter((_, i) => i !== leaveOut);
    if (subset.length === 0) continue;
    const localScore: Record<string, number> = {};
    for (const eng of subset) {
      for (const c of eng.candidates.slice(0, 20)) {
        localScore[c.number] = (localScore[c.number] ?? 0) + c.score * eng.weight;
      }
    }
    const topEntry = Object.entries(localScore).sort((a, b) => b[1] - a[1])[0];
    if (topEntry) candidateFreq[topEntry[0]] = (candidateFreq[topEntry[0]] ?? 0) + 1;
  }

  const scored = Object.entries(candidateFreq)
    .map(([number, count]) => ({ number, score: count / totalEngines }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "bootstrap", label: "Bootstrap Validation", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["bootstrap"] ?? 0.9,
    explanation: `Jackknife leave-one-out: ${totalEngines} bootstrap iterations. Stability of top candidates measured.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["bootstrap"] !== false,
  };
}

// ─── Meta Engine 34: Consensus Engine ────────────────────────────────────

export function engineConsensus(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 3) return emptyEngineV4("consensus", "Consensus Engine", "meta");

  const voteCount: Record<string, number> = {};
  for (const eng of signalEngines) {
    const top = eng.candidates[0]?.number;
    if (top) voteCount[top] = (voteCount[top] ?? 0) + 1;
  }
  const scored = Object.entries(voteCount)
    .map(([number, count]) => ({ number, score: count / signalEngines.length }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const topConsensus = scored[0]?.number ?? "—";
  const topVotes = scored[0]?.score ?? 0;
  return {
    name: "consensus", label: "Consensus Engine", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 3,
    weight: ctx.engineWeights["consensus"] ?? 1.2,
    explanation: `${signalEngines.length} signal engines voting. Top consensus: ${topConsensus} (${(topVotes * 100).toFixed(0)}% engines agree).`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["consensus"] !== false,
  };
}

// ─── Meta Engine 35: Adaptive Ensemble ────────────────────────────────────

export function engineAdaptiveEnsemble(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length === 0) return emptyEngineV4("adaptive", "Adaptive Ensemble", "meta");

  const scoreMap: Record<string, number> = {};
  let totalWeight = 0;
  for (const eng of signalEngines) {
    const w = eng.weight;
    totalWeight += w;
    for (const c of eng.candidates.slice(0, 100)) {
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * w;
    }
  }
  if (totalWeight === 0) return emptyEngineV4("adaptive", "Adaptive Ensemble", "meta");
  const scored = Object.entries(scoreMap)
    .map(([number, score]) => ({ number, score: score / totalWeight }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "adaptive", label: "Adaptive Ensemble", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["adaptive"] ?? 1.5,
    explanation: `Weighted ensemble of ${signalEngines.length} engines. Total weight=${totalWeight.toFixed(2)}.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["adaptive"] !== false,
  };
}

// ─── Meta Engine 36: Meta Voting ──────────────────────────────────────────

export function engineMetaVoting(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 3) return emptyEngineV4("metavoting", "Meta Voting", "meta");

  const candidateVotes: Record<string, number> = {};
  for (const eng of signalEngines) {
    for (const c of eng.candidates.slice(0, 10)) {
      candidateVotes[c.number] = (candidateVotes[c.number] ?? 0) + (eng.weight * c.score);
    }
  }
  const scored = Object.entries(candidateVotes)
    .map(([number, score]) => ({ number, score }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "metavoting", label: "Meta Voting", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["metavoting"] ?? 1.0,
    explanation: `Meta voting: top-10 candidates from each engine weighted-voted. ${signalEngines.length} voters.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["metavoting"] !== false,
  };
}

// ─── Meta Engine 37: Borda Count ──────────────────────────────────────────

export function engineBorda(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 3) return emptyEngineV4("borda", "Borda Count", "meta");

  const K = 20;
  const bordaPoints: Record<string, number> = {};
  for (const eng of signalEngines) {
    const top = eng.candidates.slice(0, K);
    for (let i = 0; i < top.length; i++) {
      const pts = (K - i) * eng.weight;
      bordaPoints[top[i]!.number] = (bordaPoints[top[i]!.number] ?? 0) + pts;
    }
  }
  const scored = Object.entries(bordaPoints)
    .map(([number, score]) => ({ number, score }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "borda", label: "Borda Count", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["borda"] ?? 1.1,
    explanation: `Borda count with K=${K}. Each engine assigns ${K} points to rank-1, ${K - 1} to rank-2, etc. Weights applied.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["borda"] !== false,
  };
}

// ─── Meta Engine 38: Weighted Score ───────────────────────────────────────

export function engineWeightedScore(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length === 0) return emptyEngineV4("weighted", "Weighted Score", "meta");

  const posAccWeights = signalEngines.map((e) => ({
    eng: e,
    effWeight: e.weight * Math.max(0.3, e.accuracyGlobal > 0 ? e.accuracyGlobal * 5 : 1),
  }));

  const scoreMap: Record<string, number> = {};
  let totalW = posAccWeights.reduce((a, x) => a + x.effWeight, 0);
  if (totalW === 0) totalW = 1;

  for (const { eng, effWeight } of posAccWeights) {
    for (const c of eng.candidates.slice(0, 50)) {
      scoreMap[c.number] = (scoreMap[c.number] ?? 0) + c.score * effWeight;
    }
  }
  const scored = Object.entries(scoreMap)
    .map(([number, score]) => ({ number, score: score / totalW }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "weighted", label: "Weighted Score", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["weighted"] ?? 1.3,
    explanation: `Accuracy-adjusted weighted score. Historically accurate engines get boosted weight.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["weighted"] !== false,
  };
}

// ─── Meta Engine 39: Recency Decay ────────────────────────────────────────

export function engineRecencyDecay(ctx: V4Context): EngineResultV4 {
  if (ctx.n < 30) return emptyEngineV4("recencydecay", "Recency Decay", "meta");
  const decayFactor = 0.92;
  const scoreMap: Record<string, number> = {};

  for (let i = Math.max(0, ctx.n - 200); i < ctx.n; i++) {
    const r = ctx.draws[i]?.result;
    if (!r || r.length !== 4) continue;
    const age = ctx.n - 1 - i;
    const weight = Math.pow(decayFactor, age);
    scoreMap[r] = (scoreMap[r] ?? 0) + weight;
  }

  const scored = Object.entries(scoreMap)
    .map(([number, score]) => ({ number, score }))
    .sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "recencydecay", label: "Recency Decay", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["recencydecay"] ?? 0.9,
    explanation: `Exponential decay (λ=0.92) weighting of last 200 draws. Recent draws matter exponentially more.`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["recencydecay"] !== false,
  };
}

// ─── Meta Engine 40: Hybrid Statistical Engine ────────────────────────────

export function engineHybrid(
  ctx: V4Context,
  baseEngines: EngineResultV4[]
): EngineResultV4 {
  const signalEngines = baseEngines.filter((e) => e.signal && e.candidates.length > 0);
  if (signalEngines.length < 5) return emptyEngineV4("hybrid", "Hybrid Statistical Engine", "meta");

  const statistical = signalEngines.filter((e) =>
    ["globalfreq", "bayesian", "shannon", "entropy", "gapdist"].includes(e.name)
  );
  const sequential = signalEngines.filter((e) =>
    ["markov1", "markov2", "markov3", "transition", "hmm"].includes(e.name)
  );
  const pattern = signalEngines.filter((e) =>
    ["daypattern", "sessionpattern", "weeklypattern", "monthlypattern", "cycle", "fourier"].includes(e.name)
  );

  const combineGroup = (group: typeof signalEngines, groupWeight: number) => {
    const result: Record<string, number> = {};
    const totalW = group.reduce((a, e) => a + e.weight, 0);
    if (totalW === 0) return result;
    for (const eng of group) {
      for (const c of eng.candidates.slice(0, 50)) {
        result[c.number] = (result[c.number] ?? 0) + c.score * (eng.weight / totalW) * groupWeight;
      }
    }
    return result;
  };

  const s1 = combineGroup(statistical, 0.35);
  const s2 = combineGroup(sequential, 0.40);
  const s3 = combineGroup(pattern, 0.25);

  const allNums = new Set([...Object.keys(s1), ...Object.keys(s2), ...Object.keys(s3)]);
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of allNums) {
    scored.push({ number: n, score: (s1[n] ?? 0) + (s2[n] ?? 0) + (s3[n] ?? 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "hybrid", label: "Hybrid Statistical Engine", category: "meta",
    candidates, posScores: ps, signal: candidates.length >= 5,
    weight: ctx.engineWeights["hybrid"] ?? 1.4,
    explanation: `Hybrid: 40% sequential (Markov/HMM), 35% statistical (Bayesian/Entropy), 25% pattern (Day/Month/Cycle).`,
    winCount: 0, lossCount: 0, accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: ctx.engineActive["hybrid"] !== false,
  };
}

// ─── Run All Base Engines (1-31) ──────────────────────────────────────────

export function runBaseEngines(ctx: V4Context): EngineResultV4[] {
  return [
    engineMarkov1(ctx),
    engineMarkov2(ctx),
    engineMarkov3(ctx),
    engineHMM(ctx),
    engineTransitionMatrix(ctx),
    enginePoissonGap(ctx),
    engineGlobalFreq(ctx),
    engineLocalFreq(ctx),
    engineMultiRecency(ctx),
    engineMomentum(ctx),
    engineAcceleration(ctx),
    engineRepeatPattern(ctx),
    engineDayPattern(ctx),
    engineSessionPattern(ctx),
    engineWeeklyPattern(ctx),
    engineMonthlyPattern(ctx),
    engineCorrelation(ctx),
    engineDigitPair(ctx),
    engineTripleCorr(ctx),
    engineSumDigit(ctx),
    engineBalance(ctx),
    engineEntropy(ctx),
    engineShannon(ctx),
    engineCycleDetection(ctx),
    engineFourier(ctx),
    engineHotCold(ctx),
    engineStreak(ctx),
    engineGapDist(ctx),
    engineBayesian(ctx),
    engineConditional(ctx),
    enginePositionDep(ctx),
  ].filter((e) => e.isActive);
}

// ─── Run All Meta Engines (32-40) ─────────────────────────────────────────

export function runMetaEngines(ctx: V4Context, baseEngines: EngineResultV4[]): EngineResultV4[] {
  return [
    engineMonteCarlo(ctx, baseEngines),
    engineBootstrap(ctx, baseEngines),
    engineConsensus(ctx, baseEngines),
    engineAdaptiveEnsemble(ctx, baseEngines),
    engineMetaVoting(ctx, baseEngines),
    engineBorda(ctx, baseEngines),
    engineWeightedScore(ctx, baseEngines),
    engineRecencyDecay(ctx),
    engineHybrid(ctx, baseEngines),
  ].filter((e) => e.isActive);
}
