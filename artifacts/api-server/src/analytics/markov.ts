import type { FlatDraw } from "./engine";

export interface MarkovData {
  matrix: Record<string, Record<string, number>>;
  topTransitions: Array<{ from: string; to: string; probability: number }>;
  totalTransitions: number;
}

export function computeMarkovChain(draws: FlatDraw[]): MarkovData {
  // Digit-level transitions: for each consecutive pair of draws,
  // record transitions from each digit of draw[i] to each digit of draw[i+1].
  const rawCounts: Record<string, Record<string, number>> = {};

  for (let d = 0; d <= 9; d++) {
    rawCounts[String(d)] = {};
    for (let e = 0; e <= 9; e++) rawCounts[String(d)][String(e)] = 0;
  }

  let totalTransitions = 0;

  for (let i = 1; i < draws.length; i++) {
    const prev = draws[i - 1].result;
    const curr = draws[i].result;

    // Use last digit of previous → first digit of current (most meaningful transition)
    const from = prev[prev.length - 1];
    const to = curr[0];

    if (from && to) {
      rawCounts[from][to]++;
      totalTransitions++;
    }
  }

  // Normalize each row to probabilities
  const matrix: Record<string, Record<string, number>> = {};
  for (const from of Object.keys(rawCounts)) {
    const rowTotal = Object.values(rawCounts[from]).reduce((a, b) => a + b, 0);
    matrix[from] = {};
    for (const to of Object.keys(rawCounts[from])) {
      matrix[from][to] = rowTotal === 0 ? 0.1 : rawCounts[from][to] / rowTotal;
    }
  }

  // Top transitions
  const transitions: Array<{ from: string; to: string; probability: number }> = [];
  for (const from of Object.keys(matrix)) {
    for (const to of Object.keys(matrix[from])) {
      transitions.push({ from, to, probability: Math.round(matrix[from][to] * 1000) / 1000 });
    }
  }
  transitions.sort((a, b) => b.probability - a.probability);

  return {
    matrix,
    topTransitions: transitions.slice(0, 20),
    totalTransitions,
  };
}

export function predictNextFirstDigit(lastResult: string, matrix: Record<string, Record<string, number>>): string {
  const lastDigit = lastResult[lastResult.length - 1];
  const row = matrix[lastDigit];
  if (!row) return String(Math.floor(Math.random() * 10));

  let best = "0";
  let bestP = 0;
  for (const [d, p] of Object.entries(row)) {
    if (p > bestP) { bestP = p; best = d; }
  }
  return best;
}
