export interface FlatDraw {
  date: string;
  period: string;
  result: string;
}

export interface EngineResultV4 {
  name: string;
  label: string;
  category: "base" | "meta";
  candidates: Array<{ number: string; score: number }>;
  posScores: number[][];
  signal: boolean;
  explanation: string;
  weight: number;
  winCount: number;
  lossCount: number;
  accuracyGlobal: number;
  accuracy30: number;
  accuracy100: number;
  isActive: boolean;
}

export interface GapStats {
  mean: number;
  std: number;
  cv: number;
  currentGap: number;
  overdueFactor: number;
}

export interface DigitExplanationV4 {
  digit: string;
  positionName: string;
  score: number;
  supportingEngines: string[];
  frequency: number;
  frequencyPct: number;
  momentum: number;
  acceleration: number;
  transitionScore: number;
  correlationScore: number;
  entropyScore: number;
  gapScore: number;
  bayesianScore: number;
  reason: string;
}

export interface BacktestWindow {
  total: number;
  hitAs: number; hitKop: number; hitKepala: number; hitEkor: number;
  hit2D: number; hit3D: number; hit4D: number;
  hitRateAs: number; hitRateKop: number; hitRateKepala: number; hitRateEkor: number;
  hitRate2D: number; hitRate3D: number; hitRate4D: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface BacktestSummaryV4 {
  last30: BacktestWindow;
  last100: BacktestWindow;
  last300: BacktestWindow;
  last500: BacktestWindow;
  allHistory: BacktestWindow;
  trainAccuracy: number;
  validAccuracy: number;
  testAccuracy: number;
  warningOverfitting: boolean;
}

export interface ConfidenceBreakdownV4 {
  engineAgreement: number;
  entropyScore: number;
  concentration: number;
  dataQuality: number;
  backtestScore: number;
  stabilityScore: number;
  varianceScore: number;
  total: number;
}

export interface AnomalyReport {
  hasAnomaly: boolean;
  anomalies: string[];
  dataIntegrity: "VALID" | "DATA_INVALID";
  duplicatesRemoved: number;
  invalidRowsRemoved: number;
  outliersDetected: number;
}

export interface EngineLeaderboardEntry {
  rank: number;
  engineName: string;
  label: string;
  winCount: number;
  lossCount: number;
  accuracyGlobal: number;
  accuracy30: number;
  accuracy100: number;
  currentWeight: number;
  isActive: boolean;
  consecutiveLosses: number;
}

export interface PredictionAuditEntry {
  predictionId: string;
  timestamp: string;
  period: string;
  prediction: string | null;
  confidence: number;
  topEngines: string[];
  backtestScore: number;
  noSignal: boolean;
  reasoning: string;
}

export interface PredictionV4Result {
  predictionId: string;
  prediction: string | null;
  noSignal: boolean;
  noSignalReason: string;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdownV4;
  period: string;
  dataPoints: number;
  engines: EngineResultV4[];
  activeEngines: number;
  signalEngines: number;
  digitExplanations: DigitExplanationV4[][];
  topCandidates: Array<{ number: string; score: number; rank: number }>;
  bbfsCandidates: string[];
  backtest: BacktestSummaryV4 | null;
  anomalyReport: AnomalyReport;
  engineLeaderboard: EngineLeaderboardEntry[];
  generatedAt: string;
}

export interface V4Context {
  draws: FlatDraw[];
  n: number;
  period: string;
  targetDow: number;
  currentMonthNum: number;
  currentWeekOfMonth: number;

  freq: Record<string, number>;
  freq7: Record<string, number>;
  freq14: Record<string, number>;
  freq30: Record<string, number>;
  freq100: Record<string, number>;
  freq300: Record<string, number>;
  freq500: Record<string, number>;

  posCounts: number[][];
  T1: number[][][];
  T2: Record<string, Record<string, number>>[];
  T3: Record<string, Record<string, number>>[];

  sumFreq: number[];
  sumFreq30: number[];
  sumFreq100: number[];

  sessionFreq: Record<string, Record<string, number>>;
  dowFreq: Record<number, Record<string, number>>;
  monthFreq: Record<number, Record<string, number>>;
  weekOfMonthFreq: Record<number, Record<string, number>>;

  lastSeenIdx: Record<string, number>;
  gapsList: Record<string, number[]>;
  gapStats: Record<string, GapStats>;
  repeatCounters: Record<string, number>;
  streakData: Record<string, { current: number; isHot: boolean }>;

  corrMatrix: Record<string, number>[][];
  pairCounts: Record<string, number>;

  hmmObs: number[];
  medianFreq: number;
  maxFreq: number;
  seenNumbers: string[];
  lastDigits: string[][];

  posDrawSeq: number[][];
  oddEvenFreq30: Array<[number, number]>;
  bigSmallFreq30: Array<[number, number]>;

  engineWeights: Record<string, number>;
  engineActive: Record<string, boolean>;
}
