import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain, AlertTriangle, CheckCircle, XCircle, Zap, Shield, TrendingUp, Activity,
  BarChart3, RefreshCw, Cpu, Award, Eye, ChevronDown, ChevronUp, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WIB_SESSIONS, type WIBSession,
  getNextSessionInfo, getCurrentOrNextSession,
  formatCountdown, getWIBTimeString,
} from "@/lib/schedule";

const POSITION_NAMES = ["As (Rb)", "Kop (Rt)", "Kepala (Pl)", "Ekor (St)"];
const POS_COLORS = ["text-red-400", "text-amber-400", "text-blue-400", "text-emerald-400"];

interface CandidateScore { number: string; score: number; rank: number; }
interface EngineResultV4 {
  name: string; label: string; category: "base" | "meta";
  candidates: CandidateScore[]; posScores: number[][];
  signal: boolean; explanation: string; weight: number;
  winCount: number; lossCount: number; accuracyGlobal: number;
  accuracy30: number; accuracy100: number; isActive: boolean;
}
interface DigitExplanationV4 {
  digit: string; positionName: string; score: number;
  supportingEngines: string[]; frequency: number; frequencyPct: number;
  momentum: number; acceleration: number; transitionScore: number;
  correlationScore: number; entropyScore: number; gapScore: number;
  bayesianScore: number; reason: string;
}
interface BacktestWindow {
  total: number; hitAs: number; hitKop: number; hitKepala: number; hitEkor: number;
  hit2D: number; hit3D: number; hit4D: number;
  hitRateAs: number; hitRateKop: number; hitRateKepala: number; hitRateEkor: number;
  hitRate2D: number; hitRate3D: number; hitRate4D: number; f1Score: number;
}
interface BacktestSummaryV4 {
  last30: BacktestWindow; last100: BacktestWindow;
  last300: BacktestWindow; last500: BacktestWindow; allHistory: BacktestWindow;
  trainAccuracy: number; validAccuracy: number; testAccuracy: number; warningOverfitting: boolean;
}
interface ConfidenceBreakdownV4 {
  engineAgreement: number; entropyScore: number; concentration: number;
  dataQuality: number; backtestScore: number; stabilityScore: number; varianceScore: number; total: number;
}
interface AnomalyReport {
  hasAnomaly: boolean; anomalies: string[]; dataIntegrity: string;
  duplicatesRemoved: number; invalidRowsRemoved: number; outliersDetected: number;
}
interface EngineLeaderboardEntry {
  rank: number; engineName: string; label: string;
  winCount: number; lossCount: number; accuracyGlobal: number;
  accuracy30: number; accuracy100: number; currentWeight: number;
  isActive: boolean; consecutiveLosses: number;
}
interface PredictionV4Result {
  predictionId: string; prediction: string | null;
  noSignal: boolean; noSignalReason: string;
  confidence: number; confidenceBreakdown: ConfidenceBreakdownV4;
  period: string; dataPoints: number;
  engines: EngineResultV4[]; activeEngines: number; signalEngines: number;
  digitExplanations: DigitExplanationV4[][];
  topCandidates: CandidateScore[]; bbfsCandidates: string[];
  backtest: BacktestSummaryV4 | null; anomalyReport: AnomalyReport;
  engineLeaderboard: EngineLeaderboardEntry[];
  generatedAt: string;
}

function pct(v: number, decimals = 1) { return `${(v * 100).toFixed(decimals)}%`; }
function scoreBar(score: number, colorClass = "bg-primary") {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", colorClass)} style={{ width: `${Math.round(score * 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-10 text-right">{pct(score)}</span>
    </div>
  );
}

function ConfidencePanel({ bd, warning }: { bd: ConfidenceBreakdownV4; warning?: boolean }) {
  const rows = [
    { label: "Engine Agreement", val: bd.engineAgreement, color: "bg-blue-500" },
    { label: "Entropy (Predictability)", val: bd.entropyScore, color: "bg-emerald-500" },
    { label: "Concentration", val: bd.concentration, color: "bg-violet-500" },
    { label: "Data Quality", val: bd.dataQuality, color: "bg-amber-500" },
    { label: "Backtest Score", val: bd.backtestScore, color: "bg-cyan-500" },
    { label: "Stability Score", val: bd.stabilityScore, color: "bg-rose-400" },
    { label: "Variance Score", val: bd.varianceScore, color: "bg-orange-400" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground w-48 shrink-0">{r.label}</span>
          {scoreBar(r.val, r.color)}
        </div>
      ))}
      <div className="pt-2 border-t border-border flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-48 shrink-0 font-bold">TOTAL CONFIDENCE</span>
        {scoreBar(bd.total, bd.total >= 0.6 ? "bg-primary" : "bg-rose-500")}
      </div>
      {warning && (
        <div className="flex items-center gap-2 mt-1 text-amber-400 text-xs font-mono">
          <AlertTriangle className="w-3.5 h-3.5" />
          ⚠ WARNING OVERFITTING — train accuracy jauh lebih tinggi dari test
        </div>
      )}
    </div>
  );
}

function EngineTable({ engines }: { engines: EngineResultV4[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "base" | "meta">("all");
  const baseEngines = engines.filter((e) => e.category === "base");
  const metaEngines = engines.filter((e) => e.category === "meta");
  const filtered = filter === "base" ? baseEngines : filter === "meta" ? metaEngines : engines;
  const signalCount = filtered.filter((e) => e.signal).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-mono text-muted-foreground">
          {signalCount}/{filtered.length} signal · Base: {baseEngines.filter((e) => e.signal).length}/{baseEngines.length} · Meta: {metaEngines.filter((e) => e.signal).length}/{metaEngines.length}
        </div>
        <div className="flex gap-1">
          {(["all", "base", "meta"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-2 py-0.5 text-[10px] font-mono rounded border transition-colors",
                filter === f ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5 pr-2">#</th>
              <th className="text-left py-1.5 pr-2">Engine</th>
              <th className="text-center py-1.5 pr-2">Tipe</th>
              <th className="text-center py-1.5 pr-2">Signal</th>
              <th className="text-left py-1.5 pr-2">Top Cand</th>
              <th className="text-right py-1.5 pr-2">Wt</th>
              <th className="text-right py-1.5 pr-2">Acc30</th>
              <th className="text-right py-1.5">Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((eng, i) => (
              <React.Fragment key={eng.name}>
                <tr className="border-b border-border/30 hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === eng.name ? null : eng.name)}>
                  <td className="py-1.5 pr-2 text-muted-foreground/40">{i + 1}</td>
                  <td className="py-1.5 pr-2 text-foreground/80 max-w-[140px] truncate">{eng.label}</td>
                  <td className="py-1.5 pr-2 text-center">
                    <span className={cn("text-[9px] px-1 py-0.5 rounded",
                      eng.category === "meta" ? "bg-violet-500/20 text-violet-300" : "bg-blue-500/20 text-blue-300")}>
                      {eng.category === "meta" ? "META" : "BASE"}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    {eng.signal ? <CheckCircle className="w-3.5 h-3.5 text-primary inline" /> : <XCircle className="w-3.5 h-3.5 text-rose-500/60 inline" />}
                  </td>
                  <td className="py-1.5 pr-2 text-primary">{eng.candidates[0]?.number ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-muted-foreground">{eng.weight.toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <span className={cn(eng.accuracy30 >= 0.2 ? "text-primary" : eng.accuracy30 >= 0.1 ? "text-amber-400" : "text-muted-foreground")}>
                      {eng.accuracy30 > 0 ? pct(eng.accuracy30) : "—"}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {eng.candidates[0]?.score !== undefined ? pct(eng.candidates[0].score) : "—"}
                  </td>
                </tr>
                {expanded === eng.name && (
                  <tr className="bg-secondary/20">
                    <td colSpan={8} className="py-2 px-3">
                      <div className="text-muted-foreground text-[11px] mb-1">{eng.explanation}</div>
                      <div className="text-[10px] text-muted-foreground/50 mb-1">
                        Wins: {eng.winCount} · Losses: {eng.lossCount} · AccGlobal: {eng.accuracyGlobal > 0 ? pct(eng.accuracyGlobal) : "N/A"}
                      </div>
                      {eng.candidates.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {eng.candidates.slice(0, 10).map((c) => (
                            <span key={c.number} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                              {c.number} {pct(c.score)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DigitCard({ explanations, pos }: { explanations: DigitExplanationV4[]; pos: number }) {
  const [showAll, setShowAll] = useState(false);
  const exp = explanations[0];
  if (!exp) return null;
  return (
    <div className="bg-card border border-border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">{exp.positionName}</span>
        <span className={cn("text-2xl font-mono font-bold", POS_COLORS[pos] ?? "text-primary")}>{exp.digit}</span>
      </div>
      <div className="space-y-1 text-[11px] font-mono">
        {[
          { label: "Frequency", val: `${exp.frequencyPct}%` },
          { label: "Momentum", val: `${exp.momentum > 0 ? "+" : ""}${(exp.momentum * 100).toFixed(0)}%`, highlight: exp.momentum > 0 ? "text-primary" : exp.momentum < 0 ? "text-rose-400" : undefined },
          { label: "Transition", val: pct(exp.transitionScore) },
          { label: "Bayesian", val: pct(exp.bayesianScore) },
          { label: "Gap Score", val: pct(exp.gapScore) },
          { label: "Entropy", val: pct(exp.entropyScore) },
        ].map((row) => (
          <div key={row.label} className="flex justify-between text-muted-foreground/70">
            <span>{row.label}</span>
            <span className={row.highlight}>{row.val}</span>
          </div>
        ))}
      </div>
      {exp.supportingEngines.length > 0 && (
        <div className="pt-1 border-t border-border/50">
          <div className="text-[10px] text-muted-foreground/50 mb-1">Didukung {exp.supportingEngines.length} engine</div>
          <div className="flex flex-wrap gap-1">
            {(showAll ? exp.supportingEngines : exp.supportingEngines.slice(0, 4)).map((e) => (
              <span key={e} className="text-[9px] bg-primary/10 text-primary px-1 py-0.5 rounded">{e.replace(/\s.*/, "")}</span>
            ))}
            {exp.supportingEngines.length > 4 && (
              <button onClick={() => setShowAll(!showAll)} className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground">
                {showAll ? "less" : `+${exp.supportingEngines.length - 4}`}
              </button>
            )}
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{exp.reason}</p>
    </div>
  );
}

function BacktestTableV4({ bt }: { bt: BacktestSummaryV4 }) {
  const rows = [
    { label: "Last 30", m: bt.last30 },
    { label: "Last 100", m: bt.last100 },
    { label: "Last 300", m: bt.last300 },
    { label: "Last 500", m: bt.last500 },
    { label: "All History", m: bt.allHistory },
  ];
  const fmtRate = (r: number) => (
    <span className={cn("font-mono text-[11px]", r >= 0.15 ? "text-primary" : r >= 0.08 ? "text-amber-400" : "text-muted-foreground")}>
      {pct(r)}
    </span>
  );
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-center">
              <th className="text-left py-1.5 pr-2">Window</th>
              <th className="py-1.5 px-1">N</th>
              <th className="py-1.5 px-1">As</th>
              <th className="py-1.5 px-1">Kop</th>
              <th className="py-1.5 px-1">Kpl</th>
              <th className="py-1.5 px-1">Ekor</th>
              <th className="py-1.5 px-1">2D</th>
              <th className="py-1.5 px-1">3D</th>
              <th className="py-1.5 px-1">4D</th>
              <th className="py-1.5 px-1">F1</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/30 text-center">
                <td className="text-left py-1.5 pr-2 text-muted-foreground">{r.label}</td>
                <td className="py-1.5 px-1 text-muted-foreground">{r.m.total}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.hitRateAs)}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.hitRateKop)}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.hitRateKepala)}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.hitRateEkor)}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.hitRate2D)}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.hitRate3D)}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.hitRate4D)}</td>
                <td className="py-1.5 px-1">{fmtRate(r.m.f1Score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-secondary/20 rounded p-3">
        <div className="text-xs font-mono text-muted-foreground font-bold mb-2">Walk-Forward Validation (70/15/15)</div>
        <div className="flex gap-6 text-xs font-mono">
          <div><span className="text-muted-foreground">Train: </span><span>{pct(bt.trainAccuracy)}</span></div>
          <div><span className="text-muted-foreground">Val: </span><span>{pct(bt.validAccuracy)}</span></div>
          <div><span className="text-muted-foreground">Test: </span><span className={bt.testAccuracy >= bt.trainAccuracy * 0.7 ? "text-primary" : "text-amber-400"}>{pct(bt.testAccuracy)}</span></div>
        </div>
        {bt.warningOverfitting && (
          <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono mt-2">
            <AlertTriangle className="w-3.5 h-3.5" />⚠ WARNING OVERFITTING
          </div>
        )}
      </div>
    </div>
  );
}

function EngineLeaderboard({ leaderboard }: { leaderboard: EngineLeaderboardEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const top = showAll ? leaderboard : leaderboard.slice(0, 10);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5 pr-2">#</th>
              <th className="text-left py-1.5 pr-2">Engine</th>
              <th className="text-right py-1.5 pr-2">W/L</th>
              <th className="text-right py-1.5 pr-2">Acc30</th>
              <th className="text-right py-1.5 pr-2">AccAll</th>
              <th className="text-right py-1.5 pr-2">Wt</th>
              <th className="text-center py-1.5">Aktif</th>
            </tr>
          </thead>
          <tbody>
            {top.map((e) => (
              <tr key={e.engineName} className={cn("border-b border-border/30", !e.isActive && "opacity-40")}>
                <td className="py-1.5 pr-2 text-muted-foreground/40">{e.rank}</td>
                <td className="py-1.5 pr-2 text-foreground/80 max-w-[160px] truncate">{e.label}</td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">{e.winCount}/{e.lossCount}</td>
                <td className="py-1.5 pr-2 text-right">
                  <span className={cn(e.accuracy30 >= 0.2 ? "text-primary" : e.accuracy30 >= 0.1 ? "text-amber-400" : "text-muted-foreground")}>
                    {e.accuracy30 > 0 ? pct(e.accuracy30) : "—"}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <span className={cn(e.accuracyGlobal >= 0.2 ? "text-primary" : e.accuracyGlobal >= 0.1 ? "text-amber-400" : "text-muted-foreground")}>
                    {e.accuracyGlobal > 0 ? pct(e.accuracyGlobal) : "—"}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">{e.currentWeight.toFixed(2)}</td>
                <td className="py-1.5 text-center">
                  {e.isActive ? <CheckCircle className="w-3 h-3 text-primary inline" /> : <XCircle className="w-3 h-3 text-rose-500 inline" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {leaderboard.length > 10 && (
        <button onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
          {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua ${leaderboard.length} engine`}
        </button>
      )}
    </div>
  );
}

function AnomalyPanel({ report }: { report: AnomalyReport }) {
  if (!report.hasAnomaly) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <CheckCircle className="w-3.5 h-3.5 text-primary" />
        Data integrity VALID · Duplikat: {report.duplicatesRemoved} · Invalid: {report.invalidRowsRemoved} · Outlier: {report.outliersDetected}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {report.anomalies.map((a, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-mono text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{a}
        </div>
      ))}
    </div>
  );
}

function Countdown() {
  const [info, setInfo] = useState(() => getNextSessionInfo());
  const [wibTime, setWibTime] = useState(() => getWIBTimeString());
  useEffect(() => {
    const t = setInterval(() => {
      setInfo(getNextSessionInfo());
      setWibTime(getWIBTimeString());
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-y-1 gap-x-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary shrink-0" />
        <div className="font-mono text-xs">
          <span className="text-muted-foreground">WIB: </span>
          <span className="text-foreground font-bold">{wibTime}</span>
        </div>
      </div>
      <div className="font-mono text-xs">
        <span className="text-muted-foreground">Sesi berikutnya </span>
        <span className="text-primary font-bold">{info.period}</span>
        <span className="text-muted-foreground"> dalam </span>
        <span className="text-amber-400 font-bold tabular-nums">{formatCountdown(info.secondsUntil)}</span>
      </div>
      <span className="hidden sm:block ml-auto text-[10px] font-mono text-muted-foreground/40">Auto-refresh tiap 5 menit</span>
    </div>
  );
}

export default function PredictionV4() {
  const [period, setPeriod] = useState<WIBSession>(() => getCurrentOrNextSession());
  const [result, setResult] = useState<PredictionV4Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionSwitchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runPrediction = useCallback(async (p: WIBSession) => {
    setLoading(true);
    setError(null);
    try {
      const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
      const res = await fetch(`${base}/api/prediction/v4/generate?period=${encodeURIComponent(p)}&skipBacktest=true`);
      if (!res.ok) { const txt = await res.text(); throw new Error(`Server: ${txt}`); }
      setResult(await res.json() as PredictionV4Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run on mount and period change
  useEffect(() => {
    runPrediction(period);
  }, [period]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => { runPrediction(period); }, 5 * 60 * 1000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [period, runPrediction]);

  // Auto-switch period when next session arrives
  useEffect(() => {
    sessionSwitchRef.current = setInterval(() => {
      const next = getCurrentOrNextSession();
      if (next !== period) setPeriod(next);
    }, 30 * 1000);
    return () => { if (sessionSwitchRef.current) clearInterval(sessionSwitchRef.current); };
  }, [period]);

  const hasData = result !== null;

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Brain className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-lg sm:text-2xl font-mono font-bold">Smart Prediction AI V4</h1>
            <span className="text-[10px] font-mono bg-primary/20 text-primary px-2 py-0.5 rounded-lg border border-primary/30 shrink-0">40 ENGINES</span>
            <span className="text-[10px] font-mono bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-lg border border-violet-500/30 shrink-0">SELF-LEARNING</span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground font-mono leading-relaxed">
            40 engine · Self-learning · Anti-overfitting · Auto-predict per jadwal
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => runPrediction(period)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border font-mono text-xs rounded-xl hover:bg-secondary/70 disabled:opacity-50 transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          {hasData && (
            <span className="font-mono text-[10px] text-muted-foreground/40 hidden sm:inline">
              ID: {result.predictionId}
            </span>
          )}
        </div>
      </div>

      {/* Countdown */}
      <Countdown />

      {/* Session picker */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider mr-1">Sesi:</span>
          {WIB_SESSIONS.map((p) => {
            const isNext = p === getNextSessionInfo().period;
            return (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("relative px-3 py-1 text-xs font-mono rounded-lg border transition-colors",
                  period === p ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
                {p}
                {isNext && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-400 text-xs font-mono">
          Error: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="font-mono text-sm text-muted-foreground animate-pulse space-y-2">
            <p>⚙ Menjalankan 40 engine analisis V4 untuk sesi {period}...</p>
            <p className="text-xs">31 Base: Markov1/2/3 · HMM · Poisson · Bayesian · Fourier · Streak · Gap ...</p>
            <p className="text-xs">9 Meta: Consensus · Bootstrap · Borda · Hybrid · Monte Carlo ...</p>
          </div>
        </div>
      )}

      {/* Result */}
      {hasData && !loading && (
        <div className="space-y-4">
          {/* Signal / No Signal */}
          <div className={cn("border rounded-xl p-4", result.noSignal ? "bg-rose-500/5 border-rose-500/30" : "bg-primary/5 border-primary/30")}>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {result.noSignal ? <XCircle className="w-6 h-6 text-rose-500" /> : <CheckCircle className="w-6 h-6 text-primary" />}
              <span className={cn("text-xl font-mono font-bold", result.noSignal ? "text-rose-500" : "text-primary")}>
                {result.noSignal ? "NO SIGNAL" : "✦ SIGNAL TERDETEKSI"}
              </span>
              <span className={cn("text-xs font-mono px-2 py-0.5 rounded border",
                result.confidence >= 0.6 ? "bg-primary/10 border-primary/30 text-primary" : "bg-rose-500/10 border-rose-500/30 text-rose-400")}>
                Confidence: {pct(result.confidence)}
              </span>
              <span className="text-xs font-mono text-muted-foreground/60">
                {result.signalEngines}/{result.activeEngines} engines aktif
              </span>
            </div>

            {result.noSignal ? (
              <div className="space-y-1">
                <p className="text-xs font-mono text-rose-400/80">{result.noSignalReason}</p>
                <p className="text-xs font-mono text-muted-foreground/60">
                  Sistem menolak prediksi untuk mencegah false confidence. Kandidat di bawah hanya referensi.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div>
                  <div className="text-xs font-mono text-muted-foreground mb-1">Prediksi 4D — Sesi {result.period} WIB</div>
                  <div className="text-5xl sm:text-6xl font-mono font-bold tracking-widest text-primary leading-none">{result.prediction}</div>
                </div>
                <div className="sm:flex-1">
                  <div className="text-xs font-mono text-muted-foreground mb-2">Digit per Posisi</div>
                  <div className="flex gap-2">
                    {(result.prediction ?? "????").split("").map((d, i) => (
                      <div key={i} className="text-center">
                        <div className="text-[10px] text-muted-foreground font-mono leading-tight">{POSITION_NAMES[i]}</div>
                        <div className="text-2xl font-mono font-bold text-foreground bg-secondary px-2 py-1 rounded mt-1">{d}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/50">
                  <div>ID: {result.predictionId}</div>
                  <div>Data: {result.dataPoints.toLocaleString()} draw</div>
                </div>
              </div>
            )}
          </div>

          {/* Anomaly */}
          {result.anomalyReport.hasAnomaly && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-amber-400">Anomaly Detection Report</span>
              </div>
              <AnomalyPanel report={result.anomalyReport} />
            </div>
          )}

          {/* Stats bar */}
          <div className="text-xs font-mono text-muted-foreground/50 flex flex-wrap gap-4">
            <span>Data: <span className="text-muted-foreground">{result.dataPoints.toLocaleString()} draw</span></span>
            <span>Sesi: <span className="text-muted-foreground">{result.period}</span></span>
            <span>Active: <span className="text-muted-foreground">{result.signalEngines}/{result.activeEngines}</span></span>
            <span>Integrity: <span className={result.anomalyReport.dataIntegrity === "VALID" ? "text-primary" : "text-rose-400"}>{result.anomalyReport.dataIntegrity}</span></span>
            <span>Digenerate: <span className="text-muted-foreground">{new Date(result.generatedAt).toLocaleString("id-ID")}</span></span>
          </div>

          {/* Confidence */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-mono font-bold">Confidence Breakdown (7 faktor)</h2>
            </div>
            <ConfidencePanel bd={result.confidenceBreakdown} warning={result.backtest?.warningOverfitting} />
          </div>

          {/* Digit explanations */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-mono font-bold">Explainable AI — Analisis Per Digit</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {result.digitExplanations.map((expList, pos) => (
                <DigitCard key={pos} explanations={expList} pos={pos} />
              ))}
            </div>
          </div>

          {/* Top candidates + BBFS */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">Top Kandidat (Ensemble)</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.topCandidates.slice(0, 20).map((c) => (
                  <div key={c.number} className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border",
                    c.rank === 1 ? "bg-primary/20 border-primary text-primary" : "bg-secondary/30 border-border text-muted-foreground")}>
                    <span className="text-[10px] opacity-60">#{c.rank}</span>
                    <span className="font-bold">{c.number}</span>
                    <span className="text-[10px] opacity-70">{pct(c.score)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">BBFS Smart ({result.bbfsCandidates.length} kombinasi)</h2>
              </div>
              <div className="flex flex-wrap gap-1">
                {result.bbfsCandidates.slice(0, 27).map((n) => (
                  <span key={n} className="text-[11px] font-mono bg-primary/5 border border-primary/20 text-primary px-1.5 py-0.5 rounded">{n}</span>
                ))}
                {result.bbfsCandidates.length > 27 && (
                  <span className="text-[10px] font-mono text-muted-foreground/50">+{result.bbfsCandidates.length - 27}</span>
                )}
              </div>
            </div>
          </div>

          {/* Engine table */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-mono font-bold">Detail 40 Engine V4</h2>
            </div>
            <EngineTable engines={result.engines} />
          </div>

          {/* Engine leaderboard */}
          {result.engineLeaderboard.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">Engine Leaderboard (Self-Learning)</h2>
              </div>
              <EngineLeaderboard leaderboard={result.engineLeaderboard} />
            </div>
          )}

          {/* Backtest */}
          {result.backtest && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">Backtest 5 Window</h2>
              </div>
              <BacktestTableV4 bt={result.backtest} />
            </div>
          )}

          {/* No anomaly info line */}
          {!result.anomalyReport.hasAnomaly && (
            <div className="bg-card border border-border/50 rounded-xl p-3">
              <AnomalyPanel report={result.anomalyReport} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
