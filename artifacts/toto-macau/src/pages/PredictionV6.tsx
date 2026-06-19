import React, { useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, LineChart, Line, Legend,
  Cell,
} from "recharts";
import {
  Cpu, Sparkles, ChevronDown, ChevronUp, RefreshCw, AlertTriangle,
  CheckCircle2, TrendingUp, Activity, BarChart3, Target, Zap, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineResult {
  id: string; label: string; category: string;
  signal: boolean; topCandidate: string | null;
  score: number; weight: number; contributionPct: number;
}

interface ConfidenceBreakdown {
  engineAgreement: number; signalStrength: number;
  dataQuality: number; historicalAccuracy: number;
  concentration: number; total: number;
  level: "LOW" | "MEDIUM" | "HIGH";
}

interface BacktestResult {
  total: number;
  hit4D: number; hitRate4D: number;
  hit3D: number; hitRate3D: number;
  hit2D: number; hitRate2D: number;
  hitAs: number; hitKop: number; hitKepala: number; hitEkor: number;
  hitRateAs: number; hitRateKop: number; hitRateKepala: number; hitRateEkor: number;
  avgAccuracy: number;
  engineRanking: Array<{ id: string; label: string; hitRate: number }>;
  performanceHistory: Array<{ window: string; hitRate4D: number; hitRate2D: number; avgAccuracy: number }>;
}

interface ErrorAnalysis {
  positionErrors: Array<{ position: string; hitRate: number; count: number }>;
  digitErrorDist: Array<{ digit: string; errorCount: number; pct: number }>;
  commonMistakes: Array<{ predicted: string; actual: string; count: number }>;
}

interface V6Result {
  predictionId: string; prediction: string | null;
  noSignal: boolean; noSignalReason: string;
  confidence: number; confidenceBreakdown: ConfidenceBreakdown;
  engines: EngineResult[]; period: string;
  dataPoints: number; activeEngines: number; signalEngines: number;
  topCandidates: Array<{ number: string; score: number; rank: number }>;
  bbfsCandidates: string[];
  backtest: BacktestResult | null;
  errorAnalysis: ErrorAnalysis | null;
  generatedAt: string; threshold: number;
}

const PERIODS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

const CATEGORY_COLORS: Record<string, string> = {
  "Probabilistik": "#a78bfa",
  "Statistik":     "#60a5fa",
  "Tren":          "#34d399",
  "Posisi":        "#fbbf24",
  "Pola":          "#f87171",
  "Distribusi":    "#fb923c",
  "Ensemble":      "#e879f9",
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pct0 = (n: number) => `${(n * 100).toFixed(0)}%`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceGauge({ value, level }: { value: number; level: string }) {
  const levelColor = level === "HIGH" ? "#4ade80" : level === "MEDIUM" ? "#facc15" : "#f87171";
  const deg = value * 180;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-16 overflow-hidden">
        <div className="absolute inset-0 rounded-t-full border-[12px] border-white/10 border-b-0" />
        <div
          className="absolute inset-0 rounded-t-full border-[12px] border-b-0 origin-bottom transition-all duration-700"
          style={{ borderColor: levelColor, transform: `rotate(${deg - 180}deg)`, opacity: 0.9 }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <span className="text-xl font-black" style={{ color: levelColor }}>{pct0(value)}</span>
        </div>
      </div>
      <span className={cn("text-xs font-bold px-3 py-0.5 rounded-full border", {
        "text-green-400 bg-green-400/10 border-green-400/30": level === "HIGH",
        "text-yellow-400 bg-yellow-400/10 border-yellow-400/30": level === "MEDIUM",
        "text-red-400 bg-red-400/10 border-red-400/30": level === "LOW",
      })}>{level}</span>
    </div>
  );
}

function EngineCard({ eng }: { eng: EngineResult }) {
  const color = CATEGORY_COLORS[eng.category] ?? "#888";
  return (
    <div className={cn(
      "relative flex items-center gap-3 px-3 py-2 rounded-lg border text-xs",
      eng.signal
        ? "border-white/10 bg-white/5"
        : "border-white/5 bg-white/[0.02] opacity-50"
    )}>
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: eng.signal ? color : "#444" }} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white/80 truncate">{eng.label}</div>
        <div className="text-white/40">{eng.category}</div>
      </div>
      {eng.signal && (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono font-bold" style={{ color }}>{eng.topCandidate ?? "—"}</span>
          <span className="text-white/40">{eng.contributionPct.toFixed(1)}%</span>
        </div>
      )}
      {!eng.signal && (
        <span className="text-white/30 text-[10px] uppercase">no signal</span>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, color = "gold" }: { label: string; value: string; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    gold: "text-yellow-400", green: "text-green-400", violet: "text-violet-400", blue: "text-blue-400",
  };
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-1">
      <div className="text-white/40 text-xs uppercase tracking-wider">{label}</div>
      <div className={cn("text-2xl font-black font-mono", colorMap[color] ?? "text-yellow-400")}>{value}</div>
      {sub && <div className="text-white/30 text-xs">{sub}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PredictionV6() {
  const [period, setPeriod] = useState("00:01");
  const [loading, setLoading] = useState(false);
  const [btLoading, setBtLoading] = useState(false);
  const [result, setResult] = useState<V6Result | null>(null);
  const [btResult, setBtResult] = useState<{ backtest: BacktestResult | null; errorAnalysis: ErrorAnalysis | null; period: string; dataPoints: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEngines, setShowEngines] = useState(true);
  const [showCandidates, setShowCandidates] = useState(false);
  const [tab, setTab] = useState<"overview" | "engines" | "backtest" | "error">("overview");

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/prediction/v6/generate?period=${encodeURIComponent(period)}&skipBacktest=true`);
      if (!r.ok) throw new Error(await r.text());
      setResult(await r.json() as V6Result);
      setTab("overview");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  const runBacktest = useCallback(async () => {
    setBtLoading(true);
    try {
      const r = await fetch(`/api/prediction/v6/backtest?period=${encodeURIComponent(period)}`);
      if (!r.ok) throw new Error(await r.text());
      setBtResult(await r.json() as typeof btResult);
      setTab("backtest");
    } catch (e) {
      setError(String(e));
    } finally {
      setBtLoading(false);
    }
  }, [period]);

  const cb = result?.confidenceBreakdown;
  const radarData = cb ? [
    { subject: "Agreement", v: cb.engineAgreement * 100 },
    { subject: "Signal", v: cb.signalStrength * 100 },
    { subject: "Data", v: cb.dataQuality * 100 },
    { subject: "Accuracy", v: cb.historicalAccuracy * 100 },
    { subject: "Concentrate", v: cb.concentration * 100 },
  ] : [];

  const engineChartData = result?.engines
    .filter(e => e.signal && e.contributionPct > 0)
    .sort((a, b) => b.contributionPct - a.contributionPct)
    .slice(0, 15)
    .map(e => ({ name: e.label.length > 14 ? e.label.slice(0, 14) + "…" : e.label, value: e.contributionPct, category: e.category })) ?? [];

  const posAccData = btResult?.errorAnalysis?.positionErrors.map(p => ({
    pos: p.position.split(" ")[0],
    hitRate: parseFloat((p.hitRate * 100).toFixed(1)),
  })) ?? [];

  const digitErrData = btResult?.errorAnalysis?.digitErrorDist ?? [];
  const perfHistoryData = (btResult?.backtest?.performanceHistory ?? result?.backtest?.performanceHistory ?? []).map(p => ({
    window: p.window,
    "Hit 4D": parseFloat((p.hitRate4D * 100).toFixed(2)),
    "Hit 2D": parseFloat((p.hitRate2D * 100).toFixed(2)),
    "Akurasi": parseFloat((p.avgAccuracy * 100).toFixed(2)),
  }));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-white">
                PREDIKSI <span className="text-cyan-400">V6</span>
                <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-cyan-500/70 border border-cyan-500/20 px-1.5 py-0.5 rounded">Quant Research</span>
              </h1>
              <p className="text-xs text-white/40">20 AI Engines · Dynamic Weights · Self-Learning</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500/50"
            >
              {PERIODS.map(p => <option key={p} value={p}>{p} WIB</option>)}
            </select>
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black text-sm font-bold px-4 py-1.5 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {loading ? "Analisis…" : "Generate V6"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="p-6 rounded-2xl bg-cyan-500/5 border border-cyan-500/10">
              <Cpu className="w-12 h-12 text-cyan-500/40" />
            </div>
            <div className="text-center">
              <p className="text-white/60 font-medium">V6 Quant Research Edition</p>
              <p className="text-white/30 text-sm mt-1">20 engines · Pilih sesi, lalu klik Generate V6</p>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-4 text-center">
              {["Markov V3", "HMM", "Bayesian", "Adaptive"].map(e => (
                <div key={e} className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2">
                  <Zap className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-1" />
                  <p className="text-xs text-white/50">{e}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-white/60">Menganalisis dengan 20 engine AI…</p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <>
            {/* Main result card */}
            <div className="bg-gradient-to-br from-cyan-500/10 via-white/[0.02] to-violet-500/10 border border-white/10 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                {/* Prediction */}
                <div className="flex-1">
                  {result.noSignal ? (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-amber-400 font-bold text-sm">SINYAL TIDAK CUKUP</p>
                        <p className="text-white/50 text-sm mt-1">{result.noSignalReason}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Prediksi 4D · {result.period} WIB</p>
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-6xl font-black tracking-widest text-cyan-400">
                          {result.prediction}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-white/60">
                          {result.signalEngines}/{result.activeEngines} engines menghasilkan sinyal
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 text-xs text-white/30 font-mono">
                    ID: {result.predictionId} · {new Date(result.generatedAt).toLocaleTimeString("id-ID")}
                  </div>
                </div>

                {/* Confidence gauge */}
                <div className="flex flex-col items-center gap-3">
                  <ConfidenceGauge value={result.confidence} level={result.confidenceBreakdown.level} />
                  <div className="text-center">
                    <p className="text-xs text-white/30">Confidence Score</p>
                    <p className="text-xs text-white/20">Threshold: {pct(result.threshold)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="Data" value={result.dataPoints.toLocaleString()} sub="draw historis" color="blue" />
              <StatBox label="Engines Aktif" value={`${result.signalEngines}/20`} sub="menghasilkan sinyal" color="green" />
              <StatBox label="Confidence" value={pct0(result.confidence)} sub={result.confidenceBreakdown.level} color="gold" />
              <StatBox label="Top Kandidat" value={result.topCandidates[0]?.number ?? "—"} sub={`skor ${(result.topCandidates[0]?.score ?? 0).toFixed(3)}`} color="violet" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1">
              {[
                { id: "overview", label: "Overview", icon: BarChart3 },
                { id: "engines", label: "20 Engines", icon: Cpu },
                { id: "backtest", label: "Backtest Lab", icon: FlaskConical },
                { id: "error", label: "Error Analysis", icon: Activity },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as typeof tab)}
                  className={cn(
                    "flex items-center gap-1.5 flex-1 justify-center text-xs font-medium px-2 py-2 rounded-lg transition-colors",
                    tab === t.id
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-white/40 hover:text-white/70"
                  )}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>

            {/* Tab: Overview */}
            {tab === "overview" && (
              <div className="space-y-4">
                {/* Engine contribution bar chart */}
                {engineChartData.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-white/80 mb-4 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-cyan-400" />
                      Kontribusi Engine
                    </h3>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={engineChartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                          <XAxis type="number" tick={{ fill: "#666", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                          <YAxis dataKey="name" type="category" width={100} tick={{ fill: "#aaa", fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }}
                            labelStyle={{ color: "#fff" }}
                            formatter={(v: number) => [`${v.toFixed(1)}%`, "Kontribusi"]}
                          />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {engineChartData.map((entry, i) => (
                              <Cell key={i} fill={CATEGORY_COLORS[entry.category] ?? "#60a5fa"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                        <span key={cat} className="flex items-center gap-1 text-[10px] text-white/40">
                          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence radar */}
                {radarData.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-white/80 mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4 text-violet-400" />
                      Confidence Breakdown
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                      <div className="h-44 w-full sm:w-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData}>
                            <PolarGrid stroke="#ffffff15" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: "#888", fontSize: 10 }} />
                            <Radar dataKey="v" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.25} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-2">
                        {cb && [
                          { label: "Engine Agreement", v: cb.engineAgreement, color: "#a78bfa" },
                          { label: "Signal Strength", v: cb.signalStrength, color: "#60a5fa" },
                          { label: "Data Quality", v: cb.dataQuality, color: "#34d399" },
                          { label: "Historical Accuracy", v: cb.historicalAccuracy, color: "#fbbf24" },
                          { label: "Concentration", v: cb.concentration, color: "#f87171" },
                        ].map(item => (
                          <div key={item.label} className="flex items-center gap-2">
                            <div className="w-24 text-[10px] text-white/50 text-right">{item.label}</div>
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${Math.min(100, item.v * 100)}%`, background: item.color }}
                              />
                            </div>
                            <div className="w-10 text-[10px] font-mono" style={{ color: item.color }}>
                              {pct(item.v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Top candidates */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <button
                    onClick={() => setShowCandidates(p => !p)}
                    className="w-full flex items-center justify-between text-sm font-bold text-white/80"
                  >
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      Top 20 Kandidat
                    </span>
                    {showCandidates ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showCandidates && (
                    <div className="mt-4 grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {result.topCandidates.slice(0, 20).map(c => (
                        <div key={c.number} className={cn(
                          "flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-center",
                          c.rank === 1
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                            : c.rank <= 3
                              ? "border-violet-500/30 bg-violet-500/5 text-violet-300"
                              : "border-white/10 bg-white/5 text-white/60"
                        )}>
                          <span className="font-mono text-xs text-white/30">#{c.rank}</span>
                          <span className="font-mono font-bold text-base tracking-widest">{c.number}</span>
                          <span className="text-[10px] text-white/30">{c.score.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* BBFS */}
                {result.bbfsCandidates.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-white/80 mb-3">BBFS Kandidat ({result.bbfsCandidates.length})</h3>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {result.bbfsCandidates.map(n => (
                        <span key={n} className="font-mono text-[11px] px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/50">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Engines */}
            {tab === "engines" && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    20 Engine Analisis
                  </h3>
                  <button
                    onClick={() => setShowEngines(p => !p)}
                    className="text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showEngines ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                {showEngines && (
                  <div className="space-y-2">
                    {/* Active engines */}
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                      ✓ Sinyal Aktif ({result.engines.filter(e => e.signal).length})
                    </p>
                    {result.engines.filter(e => e.signal).map(eng => (
                      <EngineCard key={eng.id} eng={eng} />
                    ))}
                    <p className="text-xs text-white/40 uppercase tracking-wider mt-4 mb-2">
                      ○ Tidak Aktif ({result.engines.filter(e => !e.signal).length})
                    </p>
                    {result.engines.filter(e => !e.signal).map(eng => (
                      <EngineCard key={eng.id} eng={eng} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Backtest */}
            {tab === "backtest" && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-amber-400" />
                        Backtest Lab
                      </h3>
                      <p className="text-xs text-white/40 mt-1">Simulasi 30/60/100 draw historis</p>
                    </div>
                    <button
                      onClick={runBacktest}
                      disabled={btLoading}
                      className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {btLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                      {btLoading ? "Running…" : "Run Backtest"}
                    </button>
                  </div>
                </div>

                {btResult?.backtest && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatBox label="Avg Akurasi" value={pct0(btResult.backtest.avgAccuracy)} sub={`${btResult.backtest.total} draw diuji`} color="green" />
                      <StatBox label="Hit 4D" value={pct0(btResult.backtest.hitRate4D)} sub={`${btResult.backtest.hit4D} kali`} color="gold" />
                      <StatBox label="Hit 2D" value={pct0(btResult.backtest.hitRate2D)} sub={`${btResult.backtest.hit2D} kali`} color="violet" />
                      <StatBox label="Hit 3D" value={pct0(btResult.backtest.hitRate3D)} sub={`${btResult.backtest.hit3D} kali`} color="blue" />
                    </div>

                    {/* Position accuracy */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-white/80 mb-3">Hit Rate per Posisi</h3>
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: "As (Rb)", v: btResult.backtest.hitRateAs, color: "#a78bfa" },
                          { label: "Kop (Rt)", v: btResult.backtest.hitRateKop, color: "#60a5fa" },
                          { label: "Kepala (Pl)", v: btResult.backtest.hitRateKepala, color: "#34d399" },
                          { label: "Ekor (St)", v: btResult.backtest.hitRateEkor, color: "#fbbf24" },
                        ].map(item => (
                          <div key={item.label} className="flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-3">
                            <span className="text-xs text-white/40">{item.label}</span>
                            <span className="text-xl font-black font-mono" style={{ color: item.color }}>{pct0(item.v)}</span>
                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${item.v * 100}%`, background: item.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Performance history chart */}
                    {perfHistoryData.length > 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-white/80 mb-4">Performance per Window</h3>
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={perfHistoryData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                              <XAxis dataKey="window" tick={{ fill: "#666", fontSize: 10 }} />
                              <YAxis tick={{ fill: "#666", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                              <Tooltip
                                contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }}
                                formatter={(v: number) => [`${v}%`]}
                              />
                              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                              <Line dataKey="Hit 4D" stroke="#fbbf24" strokeWidth={2} dot={false} />
                              <Line dataKey="Hit 2D" stroke="#60a5fa" strokeWidth={2} dot={false} />
                              <Line dataKey="Akurasi" stroke="#34d399" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Engine ranking */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-white/80 mb-3">Engine Ranking</h3>
                      <div className="space-y-1.5">
                        {btResult.backtest.engineRanking.slice(0, 10).map((e, i) => (
                          <div key={e.id} className="flex items-center gap-3">
                            <span className="w-5 text-[10px] text-white/30 text-right">#{i + 1}</span>
                            <span className="flex-1 text-xs text-white/60 truncate">{e.label}</span>
                            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${e.hitRate * 100}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs font-mono text-cyan-300">{pct0(e.hitRate)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {!btResult && !btLoading && (
                  <p className="text-center text-white/30 text-sm py-8">Klik "Run Backtest" untuk memulai simulasi</p>
                )}
              </div>
            )}

            {/* Tab: Error Analysis */}
            {tab === "error" && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-red-400" />
                      Error Analysis
                    </h3>
                    {!btResult && (
                      <button
                        onClick={runBacktest}
                        disabled={btLoading}
                        className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {btLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                        {btLoading ? "Menganalisis…" : "Run Analisis"}
                      </button>
                    )}
                  </div>
                </div>

                {btResult?.errorAnalysis && (
                  <>
                    {/* Position hit rate */}
                    {posAccData.length > 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-white/80 mb-4">Akurasi per Posisi (%)</h3>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={posAccData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                              <XAxis dataKey="pos" tick={{ fill: "#888", fontSize: 11 }} />
                              <YAxis tick={{ fill: "#666", fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }}
                                formatter={(v: number) => [`${v}%`, "Hit Rate"]}
                              />
                              <Bar dataKey="hitRate" radius={[4, 4, 0, 0]} fill="#34d399" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Digit error distribution */}
                    {digitErrData.length > 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-white/80 mb-4">Distribusi Error per Digit</h3>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={digitErrData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                              <XAxis dataKey="digit" tick={{ fill: "#888", fontSize: 11 }} />
                              <YAxis tick={{ fill: "#666", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                              <Tooltip
                                contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }}
                                formatter={(v: number, name: string) => [name === "pct" ? `${v}%` : v, name === "pct" ? "Error %" : "Jumlah"]}
                              />
                              <Bar dataKey="pct" radius={[4, 4, 0, 0]} fill="#f87171" name="Error %" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Common mistakes */}
                    {btResult.errorAnalysis.commonMistakes.length > 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-white/80 mb-3">Kesalahan Paling Sering</h3>
                        <div className="space-y-2">
                          {btResult.errorAnalysis.commonMistakes.map((m, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm">
                              <span className="text-white/30">#{i + 1}</span>
                              <span className="font-mono text-red-400/80">{m.predicted}</span>
                              <span className="text-white/30">→</span>
                              <span className="font-mono text-green-400/80">{m.actual}</span>
                              <span className="ml-auto text-white/40 text-xs">{m.count}× terjadi</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!btResult && !btLoading && (
                  <p className="text-center text-white/30 text-sm py-8">Jalankan Analisis untuk melihat distribusi error</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
