import type { PredictionContext, EngineResult, FlatDraw } from "./types";

// ─── Helpers ───────────────────────────────────────────────────────────────

export function getDow(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 2025;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function digitSum(n: string): number {
  return n.split("").reduce((a, c) => a + parseInt(c, 10), 0);
}

function normalize(
  arr: Array<{ number: string; score: number }>
): Array<{ number: string; score: number }> {
  if (arr.length === 0) return [];
  const max = Math.max(...arr.map((x) => x.score));
  if (max <= 0) return arr.map((x) => ({ ...x, score: 0 }));
  return arr.map((x) => ({ ...x, score: x.score / max }));
}

function normalizePosScores(ps: number[][]): number[][] {
  return ps.map((row) => {
    const max = Math.max(...row);
    if (max <= 0) return row.map(() => 0);
    return row.map((v) => v / max);
  });
}

function posScoresToCandidates(
  posScores: number[][],
  seenNumbers: string[]
): Array<{ number: string; score: number }> {
  const scored = seenNumbers.map((n) => {
    let s = 0;
    for (let p = 0; p < 4; p++) s += (posScores[p]?.[parseInt(n[p]!)] ?? 0);
    return { number: n, score: s / 4 };
  });
  // Also add the top digit-by-digit combination even if unseen
  let topCombo = "";
  for (let p = 0; p < 4; p++) {
    let best = 0;
    let bestD = 0;
    const row = posScores[p] ?? [];
    for (let d = 0; d < 10; d++) {
      if ((row[d] ?? 0) > best) { best = row[d]!; bestD = d; }
    }
    topCombo += String(bestD);
  }
  if (topCombo.length === 4 && !seenNumbers.includes(topCombo)) {
    const maxSeen = scored.reduce((m, x) => Math.max(m, x.score), 0);
    scored.push({ number: topCombo, score: maxSeen > 0 ? maxSeen * 1.05 : 0.5 });
  }
  scored.sort((a, b) => b.score - a.score);
  return normalize(scored.slice(0, 200));
}

function derivePosScores(
  candidates: Array<{ number: string; score: number }>,
  freq: Record<string, number>
): number[][] {
  const ps: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (const c of candidates) {
    if (c.number.length !== 4) continue;
    for (let p = 0; p < 4; p++) {
      const d = parseInt(c.number[p]!, 10);
      ps[p][d] = (ps[p][d] ?? 0) + c.score * (freq[c.number] ?? 1);
    }
  }
  return normalizePosScores(ps);
}

function emptyEngine(name: string, label: string): EngineResult {
  return {
    name, label, candidates: [], posScores: Array.from({ length: 4 }, () => new Array(10).fill(0)),
    signal: false, explanation: "Insufficient data", weight: 0,
  };
}

// ─── Build Context ─────────────────────────────────────────────────────────

export function buildContext(
  draws: FlatDraw[],
  period: string,
  engineWeights: Record<string, number>
): PredictionContext {
  const n = draws.length;
  const freq: Record<string, number> = {};
  const freq30: Record<string, number> = {};
  const freq100: Record<string, number> = {};
  const freq300: Record<string, number> = {};
  const posCounts: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  const T1: number[][][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 10 }, () => new Array(10).fill(0))
  );
  const T2: Record<string, Record<string, number>>[] = Array.from({ length: 4 }, () => ({}));
  const T3: Record<string, Record<string, number>>[] = Array.from({ length: 4 }, () => ({}));
  const sumFreq: number[] = new Array(37).fill(0);
  const sumFreq30: number[] = new Array(37).fill(0);
  const sessionFreq: Record<string, Record<string, number>> = {};
  const dowFreq: Record<number, Record<string, number>> = {};
  const lastSeenIdx: Record<string, number> = {};
  const gapsList: Record<string, number[]> = {};
  const repeatCounters: Record<string, number> = {};
  const corrMatrix: Record<string, number>[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ({} as Record<string, number>))
  );
  const hmmObs: number[] = [];

  for (let i = 0; i < n; i++) {
    const draw = draws[i]!;
    const r = draw.result;
    if (!r || r.length !== 4 || !/^\d{4}$/.test(r)) continue;

    freq[r] = (freq[r] ?? 0) + 1;
    if (i >= n - 30) freq30[r] = (freq30[r] ?? 0) + 1;
    if (i >= n - 100) freq100[r] = (freq100[r] ?? 0) + 1;
    if (i >= n - 300) freq300[r] = (freq300[r] ?? 0) + 1;

    for (let p = 0; p < 4; p++) {
      const d = parseInt(r[p]!, 10);
      posCounts[p]![d] = (posCounts[p]![d] ?? 0) + 1;
    }

    const s = digitSum(r);
    sumFreq[s] = (sumFreq[s] ?? 0) + 1;
    if (i >= n - 30) sumFreq30[s] = (sumFreq30[s] ?? 0) + 1;

    if (!sessionFreq[draw.period]) sessionFreq[draw.period] = {};
    sessionFreq[draw.period]![r] = (sessionFreq[draw.period]![r] ?? 0) + 1;

    const dow = getDow(draw.date);
    if (!dowFreq[dow]) dowFreq[dow] = {};
    dowFreq[dow]![r] = (dowFreq[dow]![r] ?? 0) + 1;

    if (lastSeenIdx[r] !== undefined) {
      const gap = i - lastSeenIdx[r]!;
      if (!gapsList[r]) gapsList[r] = [];
      gapsList[r]!.push(gap);
    }
    lastSeenIdx[r] = i;

    if (i > 0 && draws[i - 1]?.result === r) {
      repeatCounters[r] = (repeatCounters[r] ?? 0) + 1;
    }

    if (i > 0) {
      const prev = draws[i - 1]!.result;
      if (prev && prev.length === 4) {
        for (let p = 0; p < 4; p++) {
          T1[p]![parseInt(prev[p]!, 10)]![parseInt(r[p]!, 10)]! += 1;
        }
      }
    }
    if (i > 1) {
      const p1 = draws[i - 1]!.result;
      const p2 = draws[i - 2]!.result;
      if (p1 && p2 && p1.length === 4 && p2.length === 4) {
        for (let p = 0; p < 4; p++) {
          const st = `${p2[p]},${p1[p]}`;
          if (!T2[p]![st]) T2[p]![st] = {};
          T2[p]![st]![r[p]!] = (T2[p]![st]![r[p]!] ?? 0) + 1;
        }
      }
    }
    if (i > 2) {
      const p1 = draws[i - 1]!.result;
      const p2 = draws[i - 2]!.result;
      const p3 = draws[i - 3]!.result;
      if (p1 && p2 && p3 && p1.length === 4 && p2.length === 4 && p3.length === 4) {
        for (let p = 0; p < 4; p++) {
          const st = `${p3[p]},${p2[p]},${p1[p]}`;
          if (!T3[p]![st]) T3[p]![st] = {};
          T3[p]![st]![r[p]!] = (T3[p]![st]![r[p]!] ?? 0) + 1;
        }
      }
    }

    for (let pi = 0; pi < 4; pi++) {
      for (let pj = 0; pj < 4; pj++) {
        if (pi !== pj) {
          const key = `${r[pi]},${r[pj]}`;
          corrMatrix[pi]![pj]![key] = (corrMatrix[pi]![pj]![key] ?? 0) + 1;
        }
      }
    }
  }

  // Compute HMM observations (last 60)
  const freqVals = Object.values(freq).sort((a, b) => a - b);
  const medianFreq = freqVals[Math.floor(freqVals.length / 2)] ?? 1;
  const maxFreq = freqVals[freqVals.length - 1] ?? 1;
  for (let i = Math.max(0, n - 60); i < n; i++) {
    const r = draws[i]!.result;
    hmmObs.push((freq[r] ?? 0) >= medianFreq ? 1 : 0);
  }

  const lastDigits: string[][] = [];
  for (let offset = 0; offset < 4; offset++) {
    const idx = n - 1 - offset;
    if (idx >= 0 && draws[idx]!.result.length === 4) {
      lastDigits[offset] = draws[idx]!.result.split("");
    } else {
      lastDigits[offset] = ["0", "0", "0", "0"];
    }
  }

  const targetDow = n > 0 ? getDow(draws[n - 1]!.date) : 1;

  return {
    draws, n, period, targetDow,
    freq, freq30, freq100, freq300,
    posCounts, T1, T2, T3,
    sumFreq, sumFreq30,
    sessionFreq, dowFreq,
    lastSeenIdx, gapsList,
    corrMatrix, repeatCounters,
    hmmObs, medianFreq, maxFreq,
    seenNumbers: Object.keys(freq),
    lastDigits,
    engineWeights,
  };
}

// ─── Engine 1: Markov Chain Order 2 ───────────────────────────────────────

export function engineMarkov2(ctx: PredictionContext): EngineResult {
  if (ctx.n < 30) return emptyEngine("markov2", "Markov Chain Order 2");
  const ld = ctx.lastDigits;
  if (!ld[0] || !ld[1]) return emptyEngine("markov2", "Markov Chain Order 2");

  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  let totalSignal = 0;
  for (let p = 0; p < 4; p++) {
    const st = `${ld[1]![p]},${ld[0]![p]}`;
    const row = ctx.T2[p]![st];
    if (row) {
      const tot = Object.values(row).reduce((a, v) => a + v, 0);
      if (tot > 0) {
        for (let d = 0; d < 10; d++) {
          posScores[p]![d] = (row[String(d)] ?? 0) / tot;
        }
        totalSignal++;
      }
    }
    if (!row || Object.values(row ?? {}).length === 0) {
      // fallback to Order 1
      const lastD = parseInt(ld[0]![p]!, 10);
      const rowT1 = ctx.T1[p]![lastD]!;
      const tot = rowT1.reduce((a, v) => a + v, 0);
      if (tot > 0) {
        for (let d = 0; d < 10; d++) posScores[p]![d] = (rowT1[d] ?? 0) / tot;
        totalSignal++;
      }
    }
  }

  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  const topState = ld[1]!.join("") + "→" + ld[0]!.join("");
  return {
    name: "markov2", label: "Markov Chain Order 2",
    candidates, posScores: ps, signal: totalSignal >= 2, weight: ctx.engineWeights["markov2"] ?? 1,
    explanation: `State (${topState}) → next digit. ${totalSignal}/4 positions have data.`,
  };
}

// ─── Engine 2: Markov Chain Order 3 ───────────────────────────────────────

export function engineMarkov3(ctx: PredictionContext): EngineResult {
  if (ctx.n < 50) return emptyEngine("markov3", "Markov Chain Order 3");
  const ld = ctx.lastDigits;
  if (!ld[0] || !ld[1] || !ld[2]) return emptyEngine("markov3", "Markov Chain Order 3");

  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  let totalSignal = 0;
  for (let p = 0; p < 4; p++) {
    const st = `${ld[2]![p]},${ld[1]![p]},${ld[0]![p]}`;
    const row = ctx.T3[p]![st];
    if (row) {
      const tot = Object.values(row).reduce((a, v) => a + v, 0);
      if (tot > 0) {
        for (let d = 0; d < 10; d++) posScores[p]![d] = (row[String(d)] ?? 0) / tot;
        totalSignal++;
      }
    }
    if (!row) {
      const st2 = `${ld[1]![p]},${ld[0]![p]}`;
      const row2 = ctx.T2[p]![st2];
      if (row2) {
        const tot = Object.values(row2).reduce((a, v) => a + v, 0);
        if (tot > 0) {
          for (let d = 0; d < 10; d++) posScores[p]![d] = (row2[String(d)] ?? 0) / tot;
          totalSignal++;
        }
      }
    }
  }

  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "markov3", label: "Markov Chain Order 3",
    candidates, posScores: ps, signal: totalSignal >= 2, weight: ctx.engineWeights["markov3"] ?? 1,
    explanation: `3-order state (${ld[2]!.join("")}→${ld[1]!.join("")}→${ld[0]!.join("")}). ${totalSignal}/4 positions resolved.`,
  };
}

// ─── Engine 3: Poisson Gap Model ──────────────────────────────────────────

export function enginePoissonGap(ctx: PredictionContext): EngineResult {
  if (ctx.n < 50) return emptyEngine("poisson", "Poisson Gap Model");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const gaps = ctx.gapsList[n];
    if (!gaps || gaps.length < 2) continue;
    const avgGap = gaps.reduce((a, v) => a + v, 0) / gaps.length;
    if (avgGap <= 0) continue;
    const lambda = 1 / avgGap;
    const currentGap = ctx.n - 1 - (ctx.lastSeenIdx[n] ?? 0);
    // CDF of exponential: P(X <= current_gap) = 1 - e^(-lambda * gap)
    const score = 1 - Math.exp(-lambda * currentGap);
    scored.push({ number: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "poisson", label: "Poisson Gap Model",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["poisson"] ?? 1,
    explanation: `Exponential gap model. λ = 1/avg_gap. Numbers closer to expected reappearance ranked higher.`,
  };
}

// ─── Engine 4: Global Frequency ───────────────────────────────────────────

export function engineGlobalFreq(ctx: PredictionContext): EngineResult {
  if (ctx.n < 20) return emptyEngine("globalfreq", "Global Frequency");
  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: ctx.freq[n] ?? 0 }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const topN = candidates.slice(0, 3).map((c) => `${c.number}(×${ctx.freq[c.number] ?? 0})`).join(", ");
  return {
    name: "globalfreq", label: "Global Frequency",
    candidates, posScores: ps, signal: true, weight: ctx.engineWeights["globalfreq"] ?? 1,
    explanation: `All-time frequency. Top: ${topN}. Total unique numbers: ${ctx.seenNumbers.length}.`,
  };
}

// ─── Engine 5: Multi-Window Recency ───────────────────────────────────────

export function engineMultiRecency(ctx: PredictionContext): EngineResult {
  if (ctx.n < 30) return emptyEngine("multirecency", "Multi-Window Recency");
  const w = [0.50, 0.25, 0.15, 0.10];
  const scored = ctx.seenNumbers.map((n) => {
    const r30 = (ctx.freq30[n] ?? 0) / 30;
    const r100 = (ctx.freq100[n] ?? 0) / Math.min(ctx.n, 100);
    const r300 = (ctx.freq300[n] ?? 0) / Math.min(ctx.n, 300);
    const rAll = (ctx.freq[n] ?? 0) / ctx.n;
    return { number: n, score: w[0]! * r30 + w[1]! * r100 + w[2]! * r300 + w[3]! * rAll };
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "multirecency", label: "Multi-Window Recency",
    candidates, posScores: ps, signal: true, weight: ctx.engineWeights["multirecency"] ?? 1,
    explanation: `Weighted recency: 50% last-30, 25% last-100, 15% last-300, 10% all-time.`,
  };
}

// ─── Engine 6: Momentum Acceleration ─────────────────────────────────────

export function engineMomentum(ctx: PredictionContext): EngineResult {
  if (ctx.n < 100) return emptyEngine("momentum", "Momentum Acceleration");
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
    name: "momentum", label: "Momentum Acceleration",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["momentum"] ?? 1,
    explanation: `Positive momentum: (rate-30)/(rate-100) > 1. ${scored.length} numbers with rising momentum.`,
  };
}

// ─── Engine 7: Hot Cold Number ────────────────────────────────────────────

export function engineHotCold(ctx: PredictionContext): EngineResult {
  if (ctx.n < 30) return emptyEngine("hotcold", "Hot Cold Number");
  // Determine regime: are recent draws dominated by hot numbers?
  const hotInRecent = Object.values(ctx.freq30).filter((v) => v >= 2).length;
  const hotRegime = hotInRecent > Object.keys(ctx.freq30).length * 0.3;

  let scored: Array<{ number: string; score: number }>;
  if (hotRegime) {
    // Hot regime: favour numbers seen recently
    scored = ctx.seenNumbers.map((n) => ({ number: n, score: ctx.freq30[n] ?? 0 }));
  } else {
    // Cold regime: favour numbers overdue
    const maxGap = ctx.n;
    scored = ctx.seenNumbers.map((n) => {
      const lastIdx = ctx.lastSeenIdx[n] ?? 0;
      const gap = ctx.n - 1 - lastIdx;
      const avgGap = ctx.n / Math.max(ctx.freq[n] ?? 1, 1);
      const overdueScore = gap / (avgGap + 1);
      return { number: n, score: Math.max(0, overdueScore - 1) };
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "hotcold", label: "Hot Cold Number",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["hotcold"] ?? 1,
    explanation: `Regime: ${hotRegime ? "HOT (recent numbers trending)" : "COLD (overdue numbers due)"}. ${hotInRecent} hot numbers in last 30.`,
  };
}

// ─── Engine 8: Correlation Position ───────────────────────────────────────

export function engineCorrelation(ctx: PredictionContext): EngineResult {
  if (ctx.n < 100) return emptyEngine("correlation", "Correlation Position");
  const ld = ctx.lastDigits[0];
  if (!ld) return emptyEngine("correlation", "Correlation Position");

  // posScores[pj][d]: how often digit d at position pj co-occurs with lastDraw's digits
  const posScores: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (let pj = 0; pj < 4; pj++) {
    for (let d = 0; d < 10; d++) {
      let totalSignal = 0;
      for (let pi = 0; pi < 4; pi++) {
        if (pi === pj) continue;
        const key = `${ld[pi]},${String(d)}`;
        const cnt = ctx.corrMatrix[pi]![pj]![key] ?? 0;
        // Normalize by total occurrences of that source digit at pi
        let totPi = 0;
        for (let dd = 0; dd < 10; dd++) {
          totPi += ctx.corrMatrix[pi]![pj]![`${ld[pi]},${String(dd)}`] ?? 0;
        }
        if (totPi > 0) { totalSignal += cnt / totPi; }
      }
      posScores[pj]![d] = totalSignal / 3;
    }
  }

  const ps = normalizePosScores(posScores);
  const candidates = posScoresToCandidates(ps, ctx.seenNumbers);
  return {
    name: "correlation", label: "Correlation Position",
    candidates, posScores: ps, signal: true, weight: ctx.engineWeights["correlation"] ?? 1,
    explanation: `Cross-position digit correlation based on last draw ${ld.join("")}.`,
  };
}

// ─── Engine 9: Repeat Pattern ─────────────────────────────────────────────

export function engineRepeatPattern(ctx: PredictionContext): EngineResult {
  if (ctx.n < 30) return emptyEngine("repeat", "Repeat Pattern");
  const lastResult = ctx.draws[ctx.n - 1]?.result ?? "";
  if (!lastResult || lastResult.length !== 4) return emptyEngine("repeat", "Repeat Pattern");

  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const rpts = ctx.repeatCounters[n] ?? 0;
    const tot = ctx.freq[n] ?? 1;
    const repeatRate = rpts / tot;
    let score = 0;
    if (n === lastResult) {
      score = repeatRate > 0 ? repeatRate * 2 : 0.05;
    } else {
      score = (ctx.freq30[n] ?? 0) / 30 * (1 - repeatRate);
    }
    if (score > 0) scored.push({ number: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const lastRepeatRate = ((ctx.repeatCounters[lastResult] ?? 0) / (ctx.freq[lastResult] ?? 1) * 100).toFixed(1);
  return {
    name: "repeat", label: "Repeat Pattern",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["repeat"] ?? 1,
    explanation: `Last draw ${lastResult} has ${lastRepeatRate}% repeat rate. Pattern-adjusted scoring.`,
  };
}

// ─── Engine 10: Sum Digit Pattern ─────────────────────────────────────────

export function engineSumDigit(ctx: PredictionContext): EngineResult {
  if (ctx.n < 30) return emptyEngine("sumdigit", "Sum Digit Pattern");
  // Find most frequent sums in last 30 draws
  const maxSum30 = Math.max(...ctx.sumFreq30);
  if (maxSum30 === 0) return emptyEngine("sumdigit", "Sum Digit Pattern");

  const scored = ctx.seenNumbers.map((n) => {
    const s = digitSum(n);
    return { number: n, score: (ctx.sumFreq30[s] ?? 0) / maxSum30 };
  });
  // Add top unseen numbers matching the most frequent sum
  const topSum = ctx.sumFreq30.indexOf(maxSum30);
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const freqSums = ctx.sumFreq30
    .map((v, i) => ({ sum: i, count: v }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((x) => `${x.sum}(${x.count}×)`)
    .join(", ");
  return {
    name: "sumdigit", label: "Sum Digit Pattern",
    candidates, posScores: ps, signal: true, weight: ctx.engineWeights["sumdigit"] ?? 1,
    explanation: `Top digit sums in last 30 draws: ${freqSums}. Predicted sum = ${topSum}.`,
  };
}

// ─── Engine 11: Day Pattern ───────────────────────────────────────────────

export function engineDayPattern(ctx: PredictionContext): EngineResult {
  if (ctx.n < 50) return emptyEngine("daypattern", "Day Pattern");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayData = ctx.dowFreq[ctx.targetDow] ?? {};
  const maxCount = Math.max(...Object.values(dayData), 1);
  if (maxCount === 0 || Object.keys(dayData).length < 3) return emptyEngine("daypattern", "Day Pattern");

  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (dayData[n] ?? 0) / maxCount }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const topDay = scored.slice(0, 3).map((x) => `${x.number}(${dayData[x.number] ?? 0}×)`).join(", ");
  return {
    name: "daypattern", label: "Day Pattern",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["daypattern"] ?? 1,
    explanation: `${dayNames[ctx.targetDow]} pattern. Top: ${topDay}. ${Object.keys(dayData).length} unique numbers this day.`,
  };
}

// ─── Engine 12: Session Pattern ───────────────────────────────────────────

export function engineSessionPattern(ctx: PredictionContext): EngineResult {
  if (ctx.n < 30) return emptyEngine("sessionpattern", "Session Pattern");
  const sessData = ctx.sessionFreq[ctx.period] ?? {};
  const maxCount = Math.max(...Object.values(sessData), 1);
  if (Object.keys(sessData).length < 3) return emptyEngine("sessionpattern", "Session Pattern");

  const scored = ctx.seenNumbers.map((n) => ({ number: n, score: (sessData[n] ?? 0) / maxCount }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  const topSess = scored.slice(0, 3).map((x) => `${x.number}(${sessData[x.number] ?? 0}×)`).join(", ");
  return {
    name: "sessionpattern", label: "Session Pattern",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["sessionpattern"] ?? 1,
    explanation: `Session ${ctx.period}. Top: ${topSess}. ${Object.keys(sessData).length} unique numbers in this session.`,
  };
}

// ─── Engine 13: Cycle Detection ───────────────────────────────────────────

export function engineCycleDetection(ctx: PredictionContext): EngineResult {
  if (ctx.n < 100) return emptyEngine("cycle", "Cycle Detection");
  const scored: Array<{ number: string; score: number }> = [];
  for (const n of ctx.seenNumbers) {
    const gaps = ctx.gapsList[n];
    if (!gaps || gaps.length < 3) continue;
    const avgGap = gaps.reduce((a, v) => a + v, 0) / gaps.length;
    const variance = gaps.reduce((a, v) => a + (v - avgGap) ** 2, 0) / gaps.length;
    const stdGap = Math.sqrt(variance);
    const cv = stdGap / (avgGap + 1e-9);
    if (cv > 0.6) continue; // irregular cycle — skip
    const currentGap = ctx.n - 1 - (ctx.lastSeenIdx[n] ?? 0);
    const deviation = Math.abs(currentGap - avgGap);
    const score = Math.max(0, 1 - deviation / (avgGap + 1e-9));
    if (score > 0.1) scored.push({ number: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "cycle", label: "Cycle Detection",
    candidates, posScores: ps, signal: candidates.length >= 3, weight: ctx.engineWeights["cycle"] ?? 1,
    explanation: `${scored.length} numbers with regular cycle (CV < 0.6). Scores based on proximity to expected return.`,
  };
}

// ─── Engine 14: Bayesian Probability ─────────────────────────────────────

export function engineBayesian(ctx: PredictionContext): EngineResult {
  if (ctx.n < 50) return emptyEngine("bayesian", "Bayesian Probability");
  const sessData = ctx.sessionFreq[ctx.period] ?? {};
  const dayData = ctx.dowFreq[ctx.targetDow] ?? {};
  const scored: Array<{ number: string; score: number }> = [];

  for (const n of ctx.seenNumbers) {
    const freq = ctx.freq[n] ?? 0;
    if (freq === 0) continue;
    const prior = freq / ctx.n;
    const pSess = (sessData[n] ?? 0) / (freq + 1e-9);
    const pDay = (dayData[n] ?? 0) / (freq + 1e-9);
    const likelihood = (pSess + 0.1) * (pDay + 0.1); // add-0.1 Laplace smoothing
    const posterior = prior * likelihood;
    scored.push({ number: n, score: posterior });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "bayesian", label: "Bayesian Probability",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["bayesian"] ?? 1,
    explanation: `Posterior ∝ prior(frequency) × P(session|number) × P(day|number). Laplace smoothing applied.`,
  };
}

// ─── Engine 15: Transition Matrix ─────────────────────────────────────────

export function engineTransitionMatrix(ctx: PredictionContext): EngineResult {
  if (ctx.n < 20) return emptyEngine("transition", "Transition Matrix");
  const ld = ctx.lastDigits[0];
  if (!ld) return emptyEngine("transition", "Transition Matrix");

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
    name: "transition", label: "Transition Matrix",
    candidates, posScores: ps, signal: true, weight: ctx.engineWeights["transition"] ?? 1,
    explanation: `Per-position Order-1 Markov. Last draw digits: ${ld.join("")}. Transition probabilities applied.`,
  };
}

// ─── Engine 16: Entropy Analysis ──────────────────────────────────────────

export function engineEntropy(ctx: PredictionContext): EngineResult {
  if (ctx.n < 30) return emptyEngine("entropy", "Entropy Analysis");
  const tot30 = Object.values(ctx.freq30).reduce((a, v) => a + v, 0);
  if (tot30 === 0) return emptyEngine("entropy", "Entropy Analysis");

  let H = 0;
  for (const v of Object.values(ctx.freq30)) {
    if (v > 0) { const p = v / tot30; H -= p * Math.log2(p); }
  }
  const maxH = Math.log2(Object.keys(ctx.freq30).length || 1);
  const normalizedH = maxH > 0 ? H / maxH : 1;

  // Low entropy → predictable → score top-frequency numbers higher
  if (normalizedH > 0.92) {
    return {
      name: "entropy", label: "Entropy Analysis",
      candidates: [], posScores: Array.from({ length: 4 }, () => new Array(10).fill(0)),
      signal: false, weight: ctx.engineWeights["entropy"] ?? 1,
      explanation: `High entropy (${(normalizedH * 100).toFixed(1)}%). System is too random for reliable prediction.`,
    };
  }

  // Low entropy: boost high-frequency in recent draws (they dominate the distribution)
  const predictabilityScore = 1 - normalizedH;
  const scored = ctx.seenNumbers.map((n) => ({
    number: n, score: (ctx.freq30[n] ?? 0) / tot30 * predictabilityScore,
  }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "entropy", label: "Entropy Analysis",
    candidates, posScores: ps, signal: true, weight: ctx.engineWeights["entropy"] ?? 1,
    explanation: `Entropy = ${H.toFixed(2)} bits (${(normalizedH * 100).toFixed(1)}% of max). Predictability = ${(predictabilityScore * 100).toFixed(1)}%.`,
  };
}

// ─── Engine 17: Hidden Markov Model ───────────────────────────────────────

export function engineHMM(ctx: PredictionContext): EngineResult {
  if (ctx.n < 60 || ctx.hmmObs.length < 10) return emptyEngine("hmm", "Hidden Markov Model");

  // 2 hidden states: 0=Hot (hot numbers dominate), 1=Cold (diverse/random)
  // Build empirical transition matrix from observations
  const A = [[0, 0], [0, 0]]; // A[from][to]
  const obs = ctx.hmmObs;
  let prevState = obs[0]! === 1 ? 0 : 1;
  for (let i = 1; i < obs.length; i++) {
    const curState = obs[i]! === 1 ? 0 : 1;
    A[prevState]![curState]! += 1;
    prevState = curState;
  }
  // Normalize rows
  for (let s = 0; s < 2; s++) {
    const tot = (A[s]![0] ?? 0) + (A[s]![1] ?? 0);
    if (tot > 0) { A[s]![0]! /= tot; A[s]![1]! /= tot; }
    else { A[s]![0] = 0.5; A[s]![1] = 0.5; }
  }

  // Emission: P(obs=1 | state=0) should be high, P(obs=1 | state=1) should be low
  const hotObs = obs.filter((v) => v === 1).length / obs.length;
  const B = [[hotObs + 0.1, 1 - hotObs - 0.1], [hotObs - 0.1, 1 - hotObs + 0.1]].map((row) =>
    row.map((v) => Math.max(0.05, Math.min(0.95, v)))
  );

  // Forward algorithm (simplified, last 15 obs)
  let alpha = [0.5, 0.5]; // initial state dist
  const recentObs = obs.slice(-15);
  for (const o of recentObs) {
    const nextAlpha = [0, 0];
    for (let s = 0; s < 2; s++) {
      for (let prev = 0; prev < 2; prev++) {
        nextAlpha[s]! += alpha[prev]! * (A[prev]![s] ?? 0.5);
      }
      nextAlpha[s]! *= (B[s]![o] ?? 0.5);
    }
    const norm = (nextAlpha[0] ?? 0) + (nextAlpha[1] ?? 0);
    alpha = norm > 0 ? [(nextAlpha[0] ?? 0) / norm, (nextAlpha[1] ?? 0) / norm] : [0.5, 0.5];
  }

  const pHot = alpha[0] ?? 0.5;
  const pCold = alpha[1] ?? 0.5;

  let scored: Array<{ number: string; score: number }>;
  if (pHot > pCold) {
    // Hot state: boost numbers above median frequency
    scored = ctx.seenNumbers.map((n) => ({
      number: n, score: (ctx.freq[n] ?? 0) >= ctx.medianFreq ? (ctx.freq30[n] ?? 0) + 1 : 0,
    }));
  } else {
    // Cold state: boost numbers below median (diverse/due)
    scored = ctx.seenNumbers.map((n) => {
      const gap = ctx.n - 1 - (ctx.lastSeenIdx[n] ?? 0);
      return { number: n, score: (ctx.freq[n] ?? 0) < ctx.medianFreq ? gap : 0 };
    });
  }
  scored = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const candidates = normalize(scored.slice(0, 200));
  const ps = derivePosScores(candidates, ctx.freq);
  return {
    name: "hmm", label: "Hidden Markov Model",
    candidates, posScores: ps, signal: candidates.length >= 5, weight: ctx.engineWeights["hmm"] ?? 1,
    explanation: `P(Hot state)=${(pHot * 100).toFixed(0)}%, P(Cold)=${(pCold * 100).toFixed(0)}%. ${pHot > pCold ? "Trending HOT" : "Trending COLD"}.`,
  };
}

// ─── Run All Engines ───────────────────────────────────────────────────────

export function runAllEngines(ctx: PredictionContext): EngineResult[] {
  return [
    engineMarkov2(ctx),
    engineMarkov3(ctx),
    enginePoissonGap(ctx),
    engineGlobalFreq(ctx),
    engineMultiRecency(ctx),
    engineMomentum(ctx),
    engineHotCold(ctx),
    engineCorrelation(ctx),
    engineRepeatPattern(ctx),
    engineSumDigit(ctx),
    engineDayPattern(ctx),
    engineSessionPattern(ctx),
    engineCycleDetection(ctx),
    engineBayesian(ctx),
    engineTransitionMatrix(ctx),
    engineEntropy(ctx),
    engineHMM(ctx),
  ];
}
