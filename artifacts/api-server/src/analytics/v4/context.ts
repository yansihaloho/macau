import type { FlatDraw, V4Context, GapStats } from "./types";

export function getDow(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  return new Date(Date.UTC(parts[0] ?? 2025, (parts[1] ?? 1) - 1, parts[2] ?? 1)).getUTCDay();
}

function getMonthNum(dateStr: string): number {
  return parseInt(dateStr.split("-")[1] ?? "1", 10);
}

function getWeekOfMonth(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0] ?? 2025, (parts[1] ?? 1) - 1, parts[2] ?? 1));
  return Math.ceil(d.getUTCDate() / 7);
}

export function digitSum(n: string): number {
  return n.split("").reduce((a, c) => a + parseInt(c, 10), 0);
}

export function normalize(
  arr: Array<{ number: string; score: number }>
): Array<{ number: string; score: number }> {
  if (arr.length === 0) return [];
  const max = Math.max(...arr.map((x) => x.score));
  if (max <= 0) return arr.map((x) => ({ ...x, score: 0 }));
  return arr.map((x) => ({ ...x, score: x.score / max }));
}

export function normalizePosScores(ps: number[][]): number[][] {
  return ps.map((row) => {
    const max = Math.max(...row);
    if (max <= 0) return row.map(() => 0);
    return row.map((v) => v / max);
  });
}

export function posScoresToCandidates(
  posScores: number[][],
  seenNumbers: string[]
): Array<{ number: string; score: number }> {
  const scored = seenNumbers.map((n) => {
    let s = 0;
    for (let p = 0; p < 4; p++) s += (posScores[p]?.[parseInt(n[p]!)] ?? 0);
    return { number: n, score: s / 4 };
  });
  let topCombo = "";
  for (let p = 0; p < 4; p++) {
    let best = 0; let bestD = 0;
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

export function derivePosScores(
  candidates: Array<{ number: string; score: number }>,
  freq: Record<string, number>
): number[][] {
  const ps: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  for (const c of candidates) {
    if (c.number.length !== 4) continue;
    for (let p = 0; p < 4; p++) {
      const d = parseInt(c.number[p]!, 10);
      ps[p]![d] = (ps[p]![d] ?? 0) + c.score * (freq[c.number] ?? 1);
    }
  }
  return normalizePosScores(ps);
}

export function emptyEngineV4(name: string, label: string, category: "base" | "meta" = "base"): import("./types").EngineResultV4 {
  return {
    name, label, category,
    candidates: [],
    posScores: Array.from({ length: 4 }, () => new Array(10).fill(0)),
    signal: false, explanation: "Insufficient data",
    weight: 1, winCount: 0, lossCount: 0,
    accuracyGlobal: 0, accuracy30: 0, accuracy100: 0, isActive: true,
  };
}

export function buildV4Context(
  rawDraws: FlatDraw[],
  period: string,
  engineWeights: Record<string, number>,
  engineActive: Record<string, boolean>
): V4Context {
  // ─── Data Cleaning & Validation ───────────────────────────────────────
  const seen = new Set<string>();
  const draws: FlatDraw[] = [];
  for (const d of rawDraws) {
    if (!d.result || !/^\d{4}$/.test(d.result)) continue;
    if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    const key = `${d.date}|${d.period}|${d.result}`;
    if (seen.has(key)) continue;
    seen.add(key);
    draws.push(d);
  }

  const n = draws.length;

  const freq: Record<string, number> = {};
  const freq7: Record<string, number> = {};
  const freq14: Record<string, number> = {};
  const freq30: Record<string, number> = {};
  const freq100: Record<string, number> = {};
  const freq300: Record<string, number> = {};
  const freq500: Record<string, number> = {};
  const posCounts: number[][] = Array.from({ length: 4 }, () => new Array(10).fill(0));
  const T1: number[][][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 10 }, () => new Array(10).fill(0))
  );
  const T2: Record<string, Record<string, number>>[] = Array.from({ length: 4 }, () => ({}));
  const T3: Record<string, Record<string, number>>[] = Array.from({ length: 4 }, () => ({}));
  const sumFreq: number[] = new Array(37).fill(0);
  const sumFreq30: number[] = new Array(37).fill(0);
  const sumFreq100: number[] = new Array(37).fill(0);
  const sessionFreq: Record<string, Record<string, number>> = {};
  const dowFreq: Record<number, Record<string, number>> = {};
  const monthFreq: Record<number, Record<string, number>> = {};
  const weekOfMonthFreq: Record<number, Record<string, number>> = {};
  const lastSeenIdx: Record<string, number> = {};
  const gapsList: Record<string, number[]> = {};
  const repeatCounters: Record<string, number> = {};
  const corrMatrix: Record<string, number>[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ({} as Record<string, number>))
  );
  const pairCounts: Record<string, number> = {};
  const streakData: Record<string, { current: number; isHot: boolean }> = {};
  const hmmObs: number[] = [];
  const posDrawSeq: number[][] = Array.from({ length: 4 }, () => []);

  for (let i = 0; i < n; i++) {
    const draw = draws[i]!;
    const r = draw.result;

    freq[r] = (freq[r] ?? 0) + 1;
    if (i >= n - 7)   freq7[r]   = (freq7[r]   ?? 0) + 1;
    if (i >= n - 14)  freq14[r]  = (freq14[r]  ?? 0) + 1;
    if (i >= n - 30)  freq30[r]  = (freq30[r]  ?? 0) + 1;
    if (i >= n - 100) freq100[r] = (freq100[r] ?? 0) + 1;
    if (i >= n - 300) freq300[r] = (freq300[r] ?? 0) + 1;
    if (i >= n - 500) freq500[r] = (freq500[r] ?? 0) + 1;

    for (let p = 0; p < 4; p++) {
      const d = parseInt(r[p]!, 10);
      posCounts[p]![d] = (posCounts[p]![d] ?? 0) + 1;
      if (i >= n - 100) posDrawSeq[p]!.push(d);
    }

    const s = digitSum(r);
    sumFreq[s] = (sumFreq[s] ?? 0) + 1;
    if (i >= n - 30) sumFreq30[s] = (sumFreq30[s] ?? 0) + 1;
    if (i >= n - 100) sumFreq100[s] = (sumFreq100[s] ?? 0) + 1;

    if (!sessionFreq[draw.period]) sessionFreq[draw.period] = {};
    sessionFreq[draw.period]![r] = (sessionFreq[draw.period]![r] ?? 0) + 1;

    const dow = getDow(draw.date);
    if (!dowFreq[dow]) dowFreq[dow] = {};
    dowFreq[dow]![r] = (dowFreq[dow]![r] ?? 0) + 1;

    const mNum = getMonthNum(draw.date);
    if (!monthFreq[mNum]) monthFreq[mNum] = {};
    monthFreq[mNum]![r] = (monthFreq[mNum]![r] ?? 0) + 1;

    const wom = getWeekOfMonth(draw.date);
    if (!weekOfMonthFreq[wom]) weekOfMonthFreq[wom] = {};
    weekOfMonthFreq[wom]![r] = (weekOfMonthFreq[wom]![r] ?? 0) + 1;

    if (lastSeenIdx[r] !== undefined) {
      const gap = i - lastSeenIdx[r]!;
      if (!gapsList[r]) gapsList[r] = [];
      gapsList[r]!.push(gap);
    }
    lastSeenIdx[r] = i;

    if (i > 0 && draws[i - 1]?.result === r) {
      repeatCounters[r] = (repeatCounters[r] ?? 0) + 1;
    }

    // Pair consecutive numbers (full 4D)
    if (i > 0) {
      const prev = draws[i - 1]!.result;
      if (prev) {
        const pk = `${prev}→${r}`;
        pairCounts[pk] = (pairCounts[pk] ?? 0) + 1;
        for (let p = 0; p < 4; p++) {
          T1[p]![parseInt(prev[p]!, 10)]![parseInt(r[p]!, 10)]! += 1;
        }
      }
    }
    if (i > 1) {
      const p1 = draws[i - 1]!.result;
      const p2 = draws[i - 2]!.result;
      if (p1 && p2) {
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
      if (p1 && p2 && p3) {
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

  // ─── Pre-compute streak data ────────────────────────────────────────────
  for (const num of Object.keys(freq)) {
    const lastIdx = lastSeenIdx[num] ?? -1;
    const gap = n - 1 - lastIdx;
    const avgGap = n / Math.max(freq[num] ?? 1, 1);
    const isHot = gap < avgGap * 0.5;
    let streak = 0;
    if (isHot) {
      for (let i = n - 1; i >= 0 && draws[i]?.result === num; i--) streak++;
    } else {
      for (let i = n - 1; i >= 0 && draws[i]?.result !== num; i--) streak++;
    }
    streakData[num] = { current: streak, isHot };
  }

  // ─── Pre-compute gap stats ──────────────────────────────────────────────
  const gapStats: Record<string, GapStats> = {};
  for (const [num, gaps] of Object.entries(gapsList)) {
    if (gaps.length < 2) continue;
    const mean = gaps.reduce((a, v) => a + v, 0) / gaps.length;
    const variance = gaps.reduce((a, v) => a + (v - mean) ** 2, 0) / gaps.length;
    const std = Math.sqrt(variance);
    const cv = std / (mean + 1e-9);
    const currentGap = n - 1 - (lastSeenIdx[num] ?? 0);
    const overdueFactor = currentGap / (mean + 1e-9);
    gapStats[num] = { mean, std, cv, currentGap, overdueFactor };
  }

  // ─── HMM observations ───────────────────────────────────────────────────
  const freqVals = Object.values(freq).sort((a, b) => a - b);
  const medianFreq = freqVals[Math.floor(freqVals.length / 2)] ?? 1;
  const maxFreq = freqVals[freqVals.length - 1] ?? 1;
  for (let i = Math.max(0, n - 60); i < n; i++) {
    hmmObs.push((freq[draws[i]!.result] ?? 0) >= medianFreq ? 1 : 0);
  }

  // ─── Last digits ────────────────────────────────────────────────────────
  const lastDigits: string[][] = [];
  for (let offset = 0; offset < 4; offset++) {
    const idx = n - 1 - offset;
    if (idx >= 0 && draws[idx]!.result.length === 4) {
      lastDigits[offset] = draws[idx]!.result.split("");
    } else {
      lastDigits[offset] = ["0", "0", "0", "0"];
    }
  }

  // ─── Odd/Even and Big/Small freq in last 30 ────────────────────────────
  const oddEvenFreq30: Array<[number, number]> = Array.from({ length: 4 }, () => [0, 0]);
  const bigSmallFreq30: Array<[number, number]> = Array.from({ length: 4 }, () => [0, 0]);
  for (let i = Math.max(0, n - 30); i < n; i++) {
    const r = draws[i]!.result;
    for (let p = 0; p < 4; p++) {
      const d = parseInt(r[p]!, 10);
      if (d % 2 === 0) oddEvenFreq30[p]![1]!++;
      else oddEvenFreq30[p]![0]!++;
      if (d >= 5) bigSmallFreq30[p]![0]!++;
      else bigSmallFreq30[p]![1]!++;
    }
  }

  const lastDraw = draws[n - 1];
  const targetDow = lastDraw ? getDow(lastDraw.date) : 1;
  const currentMonthNum = lastDraw ? getMonthNum(lastDraw.date) : 1;
  const currentWeekOfMonth = lastDraw ? getWeekOfMonth(lastDraw.date) : 1;

  return {
    draws, n, period, targetDow, currentMonthNum, currentWeekOfMonth,
    freq, freq7, freq14, freq30, freq100, freq300, freq500,
    posCounts, T1, T2, T3,
    sumFreq, sumFreq30, sumFreq100,
    sessionFreq, dowFreq, monthFreq, weekOfMonthFreq,
    lastSeenIdx, gapsList, gapStats,
    repeatCounters, streakData,
    corrMatrix, pairCounts,
    hmmObs, medianFreq, maxFreq,
    seenNumbers: Object.keys(freq),
    lastDigits, posDrawSeq,
    oddEvenFreq30, bigSmallFreq30,
    engineWeights, engineActive,
  };
}
