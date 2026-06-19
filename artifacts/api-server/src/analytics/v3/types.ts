export interface FlatDraw {
  date: string;
  period: string;
  result: string;
}

export interface EngineResult {
  name: string;
  label: string;
  candidates: Array<{ number: string; score: number }>;
  posScores: number[][];
  signal: boolean;
  explanation: string;
  weight: number;
}

export interface DigitExplanation {
  digit: string;
  positionName: string;
  score: number;
  supportingEngines: string[];
  frequency: number;
  frequencyPct: number;
  momentum: number;
  transitionScore: number;
  correlationScore: number;
  reason: string;
}

export interface BacktestEntry {
  index: number;
  prediction: string;
  actual: string;
  hitAs: boolean;
  hitKop: boolean;
  hitKepala: boolean;
  hitEkor: boolean;
  hit2D: boolean;
  hit3D: boolean;
  hit4D: boolean;
}

export interface BacktestMetrics {
  total: number;
  hitAs: number;
  hitKop: number;
  hitKepala: number;
  hitEkor: number;
  hit2D: number;
  hit3D: number;
  hit4D: number;
  hitRateAs: number;
  hitRateKop: number;
  hitRateKepala: number;
  hitRateEkor: number;
  hitRate2D: number;
  hitRate3D: number;
  hitRate4D: number;
}

export interface BacktestSummary {
  last30: BacktestMetrics;
  last100: BacktestMetrics;
  last300: BacktestMetrics;
  trainAccuracy: number;
  validAccuracy: number;
  testAccuracy: number;
  warningOverfitting: boolean;
}

export interface ConfidenceBreakdown {
  agreement: number;
  entropy: number;
  concentration: number;
  dataQuality: number;
  backtestScore: number;
  total: number;
}

export interface PredictionV3Result {
  prediction: string | null;
  noSignal: boolean;
  noSignalReason: string;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  period: string;
  dataPoints: number;
  engines: EngineResult[];
  digitExplanations: DigitExplanation[][];
  topCandidates: Array<{ number: string; score: number; rank: number }>;
  bbfsCandidates: string[];
  backtest: BacktestSummary | null;
  generatedAt: string;
}

export interface PredictionContext {
  draws: FlatDraw[];
  n: number;
  period: string;
  targetDow: number;
  freq: Record<string, number>;
  freq30: Record<string, number>;
  freq100: Record<string, number>;
  freq300: Record<string, number>;
  posCounts: number[][];
  T1: number[][][];
  T2: Record<string, Record<string, number>>[];
  T3: Record<string, Record<string, number>>[];
  sumFreq: number[];
  sumFreq30: number[];
  sessionFreq: Record<string, Record<string, number>>;
  dowFreq: Record<number, Record<string, number>>;
  lastSeenIdx: Record<string, number>;
  gapsList: Record<string, number[]>;
  corrMatrix: Record<string, number>[][];
  repeatCounters: Record<string, number>;
  hmmObs: number[];
  medianFreq: number;
  maxFreq: number;
  seenNumbers: string[];
  lastDigits: string[][];
  engineWeights: Record<string, number>;
}
