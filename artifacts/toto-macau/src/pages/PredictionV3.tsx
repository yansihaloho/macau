import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain, AlertTriangle, CheckCircle, XCircle, Zap, Shield,
  TrendingUp, Activity, RefreshCw, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WIB_SESSIONS, type WIBSession,
  getNextSessionInfo, getCurrentOrNextSession,
  formatCountdown, getWIBTimeString,
} from "@/lib/schedule";

const POSITION_NAMES = ["As (Rb)", "Kop (Rt)", "Kepala (Pl)", "Ekor (St)"];

interface CandidateScore { number: string; score: number; rank?: number; }
interface EngineResult {
  name: string; label: string;
  candidates: CandidateScore[]; posScores: number[][];
  signal: boolean; explanation: string; weight: number;
}
interface DigitExplanation {
  digit: string; positionName: string; score: number;
  supportingEngines: string[]; frequency: number; frequencyPct: number;
  momentum: number; transitionScore: number; correlationScore: number; reason: string;
}
interface BacktestMetrics {
  total: number; hitAs: number; hitKop: number; hitKepala: number; hitEkor: number;
  hit2D: number; hit3D: number; hit4D: number;
  hitRateAs: number; hitRateKop: number; hitRateKepala: number; hitRateEkor: number;
  hitRate2D: number; hitRate3D: number; hitRate4D: number;
}
interface BacktestSummary {
  last30: BacktestMetrics; last100: BacktestMetrics; last300: BacktestMetrics;
  trainAccuracy: number; validAccuracy: number; testAccuracy: number; warningOverfitting: boolean;
}
interface ConfidenceBreakdown {
  agreement: number; entropy: number; concentration: number;
  dataQuality: number; backtestScore: number; total: number;
}
interface PredictionV3Result {
  prediction: string | null; noSignal: boolean; noSignalReason: string;
  confidence: number; confidenceBreakdown: ConfidenceBreakdown;
  period: string; dataPoints: number;
  engines: EngineResult[];
  digitExplanations: DigitExplanation[][];
  topCandidates: CandidateScore[];
  bbfsCandidates: string[];
  backtest: BacktestSummary | null;
  generatedAt: string;
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
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

function ConfidencePanel({ bd, warning }: { bd: ConfidenceBreakdown; warning?: boolean }) {
  const rows = [
    { label: "Engine Agreement", val: bd.agreement, color: "bg-blue-500" },
    { label: "Entropy (Predictability)", val: bd.entropy, color: "bg-emerald-500" },
    { label: "Concentration", val: bd.concentration, color: "bg-violet-500" },
    { label: "Data Quality", val: bd.dataQuality, color: "bg-amber-500" },
    { label: "Backtest Score", val: bd.backtestScore, color: "bg-cyan-500" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground w-44 shrink-0">{r.label}</span>
          {scoreBar(r.val, r.color)}
        </div>
      ))}
      <div className="pt-2 border-t border-border flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-44 shrink-0 font-bold">TOTAL CONFIDENCE</span>
        {scoreBar(bd.total, bd.total >= 0.6 ? "bg-primary" : "bg-rose-500")}
      </div>
      {warning && (
        <div className="flex items-center gap-2 mt-1 text-amber-400 text-xs font-mono">
          <AlertTriangle className="w-3.5 h-3.5" />
          WARNING OVERFITTING — train accuracy significantly higher than test
        </div>
      )}
    </div>
  );
}

function EngineTable({ engines }: { engines: EngineResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const signalCount = engines.filter((e) => e.signal).length;
  return (
    <div>
      <div className="text-xs font-mono text-muted-foreground mb-2">
        {signalCount}/{engines.length} engines aktif · Engine 18 = Weighted Ensemble
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5 pr-3">#</th>
              <th className="text-left py-1.5 pr-3">Engine</th>
              <th className="text-center py-1.5 pr-3">Signal</th>
              <th className="text-left py-1.5 pr-3">Top Kandidat</th>
              <th className="text-right py-1.5 pr-3">Weight</th>
              <th className="text-right py-1.5">Score</th>
            </tr>
          </thead>
          <tbody>
            {engines.map((eng, i) => (
              <React.Fragment key={eng.name}>
                <tr
                  className="border-b border-border/30 hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === eng.name ? null : eng.name)}
                >
                  <td className="py-1.5 pr-3 text-muted-foreground/50">{i + 1}</td>
                  <td className="py-1.5 pr-3 text-foreground/80">{eng.label}</td>
                  <td className="py-1.5 pr-3 text-center">
                    {eng.signal
                      ? <CheckCircle className="w-3.5 h-3.5 text-primary inline" />
                      : <XCircle className="w-3.5 h-3.5 text-rose-500/60 inline" />}
                  </td>
                  <td className="py-1.5 pr-3 text-primary">{eng.candidates[0]?.number ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">{eng.weight.toFixed(2)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {eng.candidates[0]?.score !== undefined ? pct(eng.candidates[0].score) : "—"}
                  </td>
                </tr>
                {expanded === eng.name && (
                  <tr key={`${eng.name}-exp`} className="bg-secondary/20">
                    <td colSpan={6} className="py-2 px-3">
                      <div className="text-muted-foreground text-[11px] mb-1">{eng.explanation}</div>
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
            <tr className="border-t border-border bg-primary/5">
              <td className="py-1.5 pr-3 text-muted-foreground/50">18</td>
              <td className="py-1.5 pr-3 text-primary font-bold">Weighted Ensemble</td>
              <td className="py-1.5 pr-3 text-center"><CheckCircle className="w-3.5 h-3.5 text-primary inline" /></td>
              <td colSpan={3} className="py-1.5 text-muted-foreground text-[11px]">Menggabungkan 17 engine dengan adaptive weights</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DigitCard({ explanations, pos }: { explanations: DigitExplanation[]; pos: number }) {
  const exp = explanations[0];
  if (!exp) return null;
  const posColors = ["text-red-400", "text-amber-400", "text-blue-400", "text-emerald-400"];
  return (
    <div className="bg-card border border-border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">{exp.positionName}</span>
        <span className={cn("text-2xl font-mono font-bold", posColors[pos] ?? "text-primary")}>{exp.digit}</span>
      </div>
      <div className="space-y-1 text-[11px] font-mono">
        <div className="flex justify-between text-muted-foreground/70"><span>Frequency</span><span>{exp.frequencyPct}%</span></div>
        <div className="flex justify-between text-muted-foreground/70">
          <span>Momentum</span>
          <span className={exp.momentum > 0 ? "text-primary" : exp.momentum < 0 ? "text-rose-400" : ""}>
            {exp.momentum > 0 ? "+" : ""}{(exp.momentum * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex justify-between text-muted-foreground/70"><span>Transition</span><span>{pct(exp.transitionScore)}</span></div>
        <div className="flex justify-between text-muted-foreground/70"><span>Correlation</span><span>{pct(exp.correlationScore)}</span></div>
      </div>
      {exp.supportingEngines.length > 0 && (
        <div className="pt-1 border-t border-border/50">
          <div className="text-[10px] text-muted-foreground/50 mb-1">Didukung oleh:</div>
          <div className="flex flex-wrap gap-1">
            {exp.supportingEngines.slice(0, 4).map((e) => (
              <span key={e} className="text-[9px] bg-primary/10 text-primary px-1 py-0.5 rounded">{e.replace(/\s.*/, "")}</span>
            ))}
            {exp.supportingEngines.length > 4 && (
              <span className="text-[9px] text-muted-foreground/50">+{exp.supportingEngines.length - 4}</span>
            )}
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{exp.reason}</p>
    </div>
  );
}

function BacktestTable({ bt }: { bt: BacktestSummary }) {
  const rows = [
    { label: "Last 30 Draws", m: bt.last30 },
    { label: "Last 100 Draws", m: bt.last100 },
    { label: "Last 300 Draws", m: bt.last300 },
  ];
  const fmtRate = (r: number) => (
    <span className={cn("font-mono", r >= 0.15 ? "text-primary" : r >= 0.10 ? "text-amber-400" : "text-muted-foreground")}>
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
              <th className="py-1.5 px-2">N</th>
              <th className="py-1.5 px-2">As</th>
              <th className="py-1.5 px-2">Kop</th>
              <th className="py-1.5 px-2">Kepala</th>
              <th className="py-1.5 px-2">Ekor</th>
              <th className="py-1.5 px-2">2D</th>
              <th className="py-1.5 px-2">3D</th>
              <th className="py-1.5 px-2">4D</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/30 text-center">
                <td className="text-left py-1.5 pr-2 text-muted-foreground">{r.label}</td>
                <td className="py-1.5 px-2 text-muted-foreground">{r.m.total}</td>
                <td className="py-1.5 px-2">{fmtRate(r.m.hitRateAs)}</td>
                <td className="py-1.5 px-2">{fmtRate(r.m.hitRateKop)}</td>
                <td className="py-1.5 px-2">{fmtRate(r.m.hitRateKepala)}</td>
                <td className="py-1.5 px-2">{fmtRate(r.m.hitRateEkor)}</td>
                <td className="py-1.5 px-2">{fmtRate(r.m.hitRate2D)}</td>
                <td className="py-1.5 px-2">{fmtRate(r.m.hitRate3D)}</td>
                <td className="py-1.5 px-2">{fmtRate(r.m.hitRate4D)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-secondary/20 rounded p-3 space-y-1.5">
        <div className="text-xs font-mono text-muted-foreground font-bold mb-2">Walk-Forward Validation (70/15/15 split)</div>
        <div className="flex gap-6 text-xs font-mono">
          <div><span className="text-muted-foreground">Train: </span><span>{pct(bt.trainAccuracy)}</span></div>
          <div><span className="text-muted-foreground">Validasi: </span><span>{pct(bt.validAccuracy)}</span></div>
          <div>
            <span className="text-muted-foreground">Test: </span>
            <span className={bt.testAccuracy >= bt.trainAccuracy * 0.7 ? "text-primary" : "text-amber-400"}>
              {pct(bt.testAccuracy)}
            </span>
          </div>
        </div>
        {bt.warningOverfitting && (
          <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono mt-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            ⚠ WARNING OVERFITTING — gap antara train dan test terlalu besar
          </div>
        )}
      </div>
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
    <div className="flex items-center gap-3 bg-card border border-border rounded-sm px-4 py-2.5 flex-wrap">
      <Clock className="w-4 h-4 text-primary shrink-0" />
      <div className="font-mono text-xs">
        <span className="text-muted-foreground">WIB: </span>
        <span className="text-foreground font-bold">{wibTime}</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="font-mono text-xs">
        <span className="text-muted-foreground">Sesi berikutnya </span>
        <span className="text-primary font-bold">{info.period}</span>
        <span className="text-muted-foreground"> dalam </span>
        <span className="text-amber-400 font-bold tabular-nums">{formatCountdown(info.secondsUntil)}</span>
      </div>
      <div className="ml-auto">
        <span className="text-[10px] font-mono text-muted-foreground/40">Prediksi auto-refresh tiap 5 menit</span>
      </div>
    </div>
  );
}

export default function PredictionV3() {
  const [period, setPeriod] = useState<WIBSession>(() => getCurrentOrNextSession());
  const [result, setResult] = useState<PredictionV3Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionSwitchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runPrediction = useCallback(async (p: WIBSession) => {
    setLoading(true);
    setError(null);
    try {
      const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
      const res = await fetch(`${base}/api/prediction/v3/generate?period=${encodeURIComponent(p)}&skipBacktest=true`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Server error: ${txt}`);
      }
      setResult(await res.json() as PredictionV3Result);
      setLastFetched(new Date().toLocaleTimeString("id-ID"));
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
    refreshTimerRef.current = setInterval(() => {
      runPrediction(period);
    }, 5 * 60 * 1000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [period, runPrediction]);

  // Auto-switch period when session changes
  useEffect(() => {
    sessionSwitchRef.current = setInterval(() => {
      const next = getCurrentOrNextSession();
      if (next !== period) {
        setPeriod(next);
      }
    }, 30 * 1000);
    return () => { if (sessionSwitchRef.current) clearInterval(sessionSwitchRef.current); };
  }, [period]);

  const hasData = result !== null;

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-mono font-bold">Smart Prediction AI V3</h1>
            <span className="text-[10px] font-mono bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30">18 ENGINES</span>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            100% data historis 2025–2026 · Adaptive weights · Anti-overfitting · Explainable AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runPrediction(period)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border font-mono text-xs rounded-sm hover:bg-secondary/70 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          {lastFetched && (
            <span className="font-mono text-[10px] text-muted-foreground/50 hidden sm:inline">
              {new Date(result?.generatedAt ?? "").toLocaleTimeString("id-ID")}
            </span>
          )}
        </div>
      </div>

      {/* Countdown */}
      <Countdown />

      {/* Session picker */}
      <div className="bg-card border border-border rounded-sm p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider mr-1">Sesi:</span>
          {WIB_SESSIONS.map((p) => {
            const isNext = p === getNextSessionInfo().period;
            return (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn(
                  "relative px-3 py-1 text-xs font-mono rounded-sm border transition-colors",
                  period === p ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}>
                {p}
                {isNext && <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-sm p-3 text-rose-400 text-xs font-mono">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-card border border-border rounded-sm p-6 text-center">
          <div className="font-mono text-sm text-muted-foreground animate-pulse space-y-1">
            <p>⚙ Menjalankan 18 engine analisis untuk sesi {period}...</p>
            <p className="text-xs">Markov · Poisson · Bayesian · HMM · Entropy · dan 13 lainnya</p>
          </div>
        </div>
      )}

      {/* Result */}
      {hasData && !loading && (
        <div className="space-y-4">
          {/* Signal status */}
          <div className={cn("border rounded-sm p-4", result.noSignal ? "bg-rose-500/5 border-rose-500/30" : "bg-primary/5 border-primary/30")}>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {result.noSignal
                ? <XCircle className="w-6 h-6 text-rose-500" />
                : <CheckCircle className="w-6 h-6 text-primary" />}
              <span className={cn("text-xl font-mono font-bold", result.noSignal ? "text-rose-500" : "text-primary")}>
                {result.noSignal ? "NO SIGNAL" : "✦ SIGNAL TERDETEKSI"}
              </span>
              <span className={cn("text-xs font-mono px-2 py-0.5 rounded border",
                result.confidence >= 0.6 ? "bg-primary/10 border-primary/30 text-primary" : "bg-rose-500/10 border-rose-500/30 text-rose-400")}>
                Confidence: {pct(result.confidence)}
              </span>
            </div>

            {result.noSignal ? (
              <div className="space-y-1">
                <p className="text-xs font-mono text-rose-400/80">{result.noSignalReason}</p>
                <p className="text-xs font-mono text-muted-foreground/60">
                  Sistem menolak memberikan prediksi untuk menghindari false confidence.
                  Kandidat di bawah ini ditampilkan sebagai referensi saja.
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
              </div>
            )}
          </div>

          <div className="text-xs font-mono text-muted-foreground/50 flex gap-4 flex-wrap">
            <span>Data: <span className="text-muted-foreground">{result.dataPoints.toLocaleString()} draw</span></span>
            <span>Sesi: <span className="text-muted-foreground">{result.period}</span></span>
            <span>Signal engines: <span className="text-muted-foreground">{result.engines.filter((e) => e.signal).length}/17</span></span>
            <span>Digenerate: <span className="text-muted-foreground">{new Date(result.generatedAt).toLocaleString("id-ID")}</span></span>
          </div>

          {/* Confidence */}
          <div className="bg-card border border-border rounded-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-mono font-bold">Confidence Breakdown</h2>
            </div>
            <ConfidencePanel bd={result.confidenceBreakdown} warning={result.backtest?.warningOverfitting} />
          </div>

          {/* Top candidates + BBFS */}
          {result.topCandidates.length > 0 && (
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">Top Kandidat Ensemble</h2>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {result.topCandidates.slice(0, 20).map((c, i) => (
                  <div key={c.number} className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border",
                    i === 0 ? "bg-primary/20 border-primary text-primary" : "bg-secondary/30 border-border text-muted-foreground"
                  )}>
                    <span className="font-bold">{c.number}</span>
                    <span className="text-[10px] opacity-70">{pct(c.score)}</span>
                  </div>
                ))}
              </div>
              {result.bbfsCandidates.length > 0 && (
                <div>
                  <div className="text-xs font-mono text-muted-foreground mb-2">
                    BBFS Smart ({result.bbfsCandidates.length} kombinasi)
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
              )}
            </div>
          )}

          {/* Digit explanations */}
          {result.digitExplanations.some((e) => e.length > 0) && (
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">Explainable AI — Analisis Per Digit</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {result.digitExplanations.map((expList, pos) => (
                  <DigitCard key={pos} explanations={expList} pos={pos} />
                ))}
              </div>
            </div>
          )}

          {/* Engine table */}
          {result.engines.length > 0 && (
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">Detail 18 Engine</h2>
              </div>
              <EngineTable engines={result.engines} />
            </div>
          )}

          {/* Backtest */}
          {result.backtest && (
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold">Backtest Results</h2>
              </div>
              <BacktestTable bt={result.backtest} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
