export interface FlatDraw {
  date: string;
  period: string;
  result: string;
}

export interface DigitFreqEntry {
  digit: string;
  count: number;
  percentage: number;
}

export interface NumberFrequency {
  number: string;
  count: number;
}

export interface GapEntry {
  number: string;
  lastSeen: string;
  gapDraws: number;
}

export interface AdvancedAnalytics {
  totalDraws: number;
  digitFrequency: DigitFreqEntry[];
  pairFrequency: Array<{ pair: string; count: number }>;
  hotNumbers: NumberFrequency[];
  coldNumbers: NumberFrequency[];
  oddEven: { odd: number; even: number; oddPct: number; evenPct: number };
  bigSmall: { big: number; small: number; bigPct: number; smallPct: number };
  missingNumbers: string[];
  totalMissingCount: number;
  gapDistribution: GapEntry[];
  repeatNumbers: NumberFrequency[];
  trendNumbers: NumberFrequency[];
}

export interface HeatmapData {
  positions: Array<{
    position: number;
    label: string;
    digits: Array<{ digit: string; count: number; pct: number }>;
  }>;
  totalNumbers: number;
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}

export function computeAdvancedAnalytics(draws: FlatDraw[]): AdvancedAnalytics {
  const total = draws.length;
  const freq: Record<string, number> = {};
  const digitFreq: Record<string, number> = {};
  const pairFreq: Record<string, number> = {};
  let odd = 0, even = 0, big = 0, small = 0;

  for (let d = 0; d <= 9; d++) digitFreq[String(d)] = 0;

  for (const draw of draws) {
    const n = draw.result;
    if (!/^\d{4}$/.test(n)) continue; // guard against malformed results
    freq[n] = (freq[n] ?? 0) + 1;

    for (const ch of n) digitFreq[ch] = (digitFreq[ch] ?? 0) + 1;

    for (let i = 0; i < n.length - 1; i++) {
      const pair = n[i] + n[i + 1];
      pairFreq[pair] = (pairFreq[pair] ?? 0) + 1;
    }

    const num = parseInt(n, 10);
    if (num % 2 === 1) odd++; else even++;
    if (num >= 5000) big++; else small++;
  }

  const totalDigits = Object.values(digitFreq).reduce((a, b) => a + b, 0);
  const digitFreqArr: DigitFreqEntry[] = Object.entries(digitFreq)
    .map(([digit, count]) => ({ digit, count, percentage: pct(count, totalDigits) }))
    .sort((a, b) => a.digit.localeCompare(b.digit));

  const pairFreqArr = Object.entries(pairFreq)
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  const sorted = Object.entries(freq)
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count);

  const hotNumbers = sorted.slice(0, 20);
  const coldNumbers = [...sorted].sort((a, b) => a.count - b.count).slice(0, 20);

  // Missing: all 0000-9999 that never appeared in draws
  const allNums = new Set(Object.keys(freq));
  const missingNumbers: string[] = [];
  for (let i = 0; i <= 9999; i++) {
    const s = String(i).padStart(4, "0");
    if (!allNums.has(s)) missingNumbers.push(s);
  }
  const totalMissingCount = missingNumbers.length;

  // Gap distribution — for each number seen, compute draws since last appearance
  const lastSeenIdx: Record<string, number> = {};
  for (let i = 0; i < draws.length; i++) {
    lastSeenIdx[draws[i].result] = i;
  }
  const gapDistribution: GapEntry[] = Object.entries(lastSeenIdx)
    .map(([number, idx]) => ({
      number,
      lastSeen: draws[idx]?.date ?? "",
      gapDraws: draws.length - 1 - idx,
    }))
    .sort((a, b) => b.gapDraws - a.gapDraws)
    .slice(0, 20);

  // Repeat numbers — appeared in consecutive draws (same period window)
  const repeatFreq: Record<string, number> = {};
  for (let i = 1; i < draws.length; i++) {
    if (draws[i].result === draws[i - 1].result) {
      repeatFreq[draws[i].result] = (repeatFreq[draws[i].result] ?? 0) + 1;
    }
  }
  const repeatNumbers = Object.entries(repeatFreq)
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Trend numbers — compare frequency in last 30 draws vs overall
  const recent30 = draws.slice(-30);
  const recentFreq: Record<string, number> = {};
  for (const d of recent30) recentFreq[d.result] = (recentFreq[d.result] ?? 0) + 1;

  const overallRate = (n: string) => (freq[n] ?? 0) / Math.max(total, 1);
  const recentRate = (n: string) => (recentFreq[n] ?? 0) / 30;

  const trendNumbers = Object.keys(recentFreq)
    .map(n => ({ number: n, count: recentFreq[n] ?? 0, trend: recentRate(n) - overallRate(n) }))
    .filter(x => x.trend > 0)
    .sort((a, b) => b.trend - a.trend)
    .slice(0, 10)
    .map(x => ({ number: x.number, count: x.count }));

  return {
    totalDraws: total,
    digitFrequency: digitFreqArr,
    pairFrequency: pairFreqArr,
    hotNumbers,
    coldNumbers,
    oddEven: { odd, even, oddPct: pct(odd, total), evenPct: pct(even, total) },
    bigSmall: { big, small, bigPct: pct(big, total), smallPct: pct(small, total) },
    missingNumbers: missingNumbers.slice(0, 200),
    totalMissingCount,
    gapDistribution,
    repeatNumbers,
    trendNumbers,
  };
}

export function computeHeatmap(draws: FlatDraw[]): HeatmapData {
  const positions = [0, 1, 2, 3];
  const posLabels = ["Pos 1 (Ribuan)", "Pos 2 (Ratusan)", "Pos 3 (Puluhan)", "Pos 4 (Satuan)"];

  const posDigitCount: Record<number, Record<string, number>> = {};
  for (const p of positions) {
    posDigitCount[p] = {};
    for (let d = 0; d <= 9; d++) posDigitCount[p][String(d)] = 0;
  }

  for (const draw of draws) {
    if (!/^\d{4}$/.test(draw.result)) continue;
    for (let p = 0; p < 4; p++) {
      const digit = draw.result[p];
      if (digit !== undefined) posDigitCount[p][digit]++;
    }
  }

  const positionsData = positions.map((p) => {
    const total = Object.values(posDigitCount[p]).reduce((a, b) => a + b, 0);
    return {
      position: p + 1,
      label: posLabels[p],
      digits: Object.entries(posDigitCount[p])
        .map(([digit, count]) => ({ digit, count, pct: pct(count, total) }))
        .sort((a, b) => a.digit.localeCompare(b.digit)),
    };
  });

  return { positions: positionsData, totalNumbers: draws.length };
}
