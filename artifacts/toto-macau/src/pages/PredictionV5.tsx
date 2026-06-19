import React, { useState } from "react";
import {
  Bot, Zap, RefreshCw, AlertCircle, CheckCircle,
  BarChart2, TrendingUp, Shield, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SESSIONS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

// ─── Types ───────────────────────────────────────────────────────────────────

interface V5EngineContribution {
  id: string;
  label: string;
  category: string;
  signal: boolean;
  score: number;
  weight: number;
  contributionPct: number;
  topCandidate: string | null;
}

interface V5ConfidenceBreakdown {
  engineAgreement: number;
  signalStrength: number;
  dataQuality: number;
  concentration: number;
  total: number;
  level: "LOW" | "MEDIUM" | "HIGH";
}

interface V5BacktestResult {
  total: number;
  hit4D: number; hitRate4D: number;
  hit3D: number; hitRate3D: number;
  hit2D: number; hitRate2D: number;
  hitAs: number; hitKop: number; hitKepala: number; hitEkor: number;
  hitRateAs: number; hitRateKop: number; hitRateKepala: number; hitRateEkor: number;
  avgAccuracy: number;
}

interface PredictionV5Result {
  predictionId: string;
  prediction: string | null;
  noSignal: boolean;
  noSignalReason: string;
  confidence: number;
  confidenceBreakdown: V5ConfidenceBreakdown;
  engineContributions: V5EngineContribution[];
  period: string;
  dataPoints: number;
  activeEngines: number;
  signalEngines: number;
  topCandidates: Array<{ number: string; score: number; rank: number }>;
  bbfsCandidates: string[];
  backtest: V5BacktestResult | null;
  generatedAt: string;
  threshold: number;
}

// ─── Confidence Gauge ─────────────────────────────────────────────────────────

function ConfidenceGauge({ value, level, threshold }: { value: number; level: string; threshold: number }) {
  const pct = Math.round(value * 100);
  const color =
    level === "HIGH" ? "text-emerald-400" :
    level === "MEDIUM" ? "text-primary" : "text-red-400";
  const barColor =
    level === "HIGH" ? "bg-emerald-500" :
    level === "MEDIUM" ? "bg-primary" : "bg-red-500";

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Confidence Score</span>
        <span className={cn("text-xs font-mono font-bold px-2 py-0.5 rounded border", {
          "bg-emerald-500/10 text-emerald-400 border-emerald-500/30": level === "HIGH",
          "bg-primary/10 text-primary border-primary/30": level === "MEDIUM",
          "bg-red-500/10 text-red-400 border-red-500/30": level === "LOW",
        })}>
          {level}
        </span>
      </div>
      <div className={cn("text-6xl font-mono font-bold mb-3", color)}>{pct}%</div>
      <div className="relative h-3 bg-secondary rounded-full overflow-hidden mb-2">
        {/* Threshold marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-yellow-500/60 z-10"
          style={{ left: `${threshold * 100}%` }}
        />
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/50">
        <span>0%</span>
        <span className="text-yellow-500/70">▲ {Math.round(threshold * 100)}% threshold</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ─── Confidence Breakdown ─────────────────────────────────────────────────────

function BreakdownBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-mono mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={color}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color.includes("emerald") ? "bg-emerald-500" : color.includes("primary") ? "bg-primary" : color.includes("blue") ? "bg-blue-500" : "bg-violet-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Engine Contribution Bar ──────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  "Probabilistik": "bg-primary",
  "Statistik": "bg-blue-500",
  "Tren": "bg-cyan-500",
  "Posisi": "bg-violet-500",
  "Pola": "bg-amber-500",
  "Distribusi": "bg-rose-500",
  "Ensemble": "bg-emerald-500",
};

function EngineBar({ engine, maxPct }: { engine: V5EngineContribution; maxPct: number }) {
  const barColor = engine.signal
    ? (CATEGORY_COLORS[engine.category] ?? "bg-primary")
    : "bg-secondary";

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-sm transition-colors",
      engine.signal ? "hover:bg-secondary/30" : "opacity-50"
    )}>
      {/* Signal dot */}
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", engine.signal ? "bg-emerald-400" : "bg-muted-foreground/30")} />

      {/* Engine name */}
      <div className="w-48 shrink-0">
        <div className="text-xs font-mono text-foreground truncate">{engine.label}</div>
        <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">{engine.category}</div>
      </div>

      {/* Bar */}
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: maxPct > 0 ? `${(engine.contributionPct / maxPct) * 100}%` : "0%" }}
        />
      </div>

      {/* Pct */}
      <div className="w-12 text-right">
        <span className={cn("text-xs font-mono", engine.signal ? "text-foreground" : "text-muted-foreground/30")}>
          {engine.signal ? `${engine.contributionPct.toFixed(1)}%` : "—"}
        </span>
      </div>

      {/* Top candidate */}
      <div className="w-14 text-right">
        <span className={cn("text-xs font-mono font-bold tracking-widest", engine.signal ? "text-primary" : "text-muted-foreground/20")}>
          {engine.topCandidate ?? "—"}
        </span>
      </div>
    </div>
  );
}

// ─── Backtest Panel ───────────────────────────────────────────────────────────

function BacktestPanel({ bt }: { bt: V5BacktestResult }) {
  const rows = [
    { label: "4D Exact", value: bt.hitRate4D, count: `${bt.hit4D}/${bt.total}`, color: "text-emerald-400" },
    { label: "3D Tepat", value: bt.hitRate3D, count: `${bt.hit3D}/${bt.total}`, color: "text-primary" },
    { label: "2D Tepat", value: bt.hitRate2D, count: `${bt.hit2D}/${bt.total}`, color: "text-amber-400" },
  ];
  const positions = [
    { label: "As", value: bt.hitRateAs },
    { label: "Kop", value: bt.hitRateKop },
    { label: "Kepala", value: bt.hitRateKepala },
    { label: "Ekor", value: bt.hitRateEkor },
  ];

  return (
    <div className="bg-card border border-border rounded-sm p-4 space-y-4">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
        <BarChart2 className="w-3.5 h-3.5" /> Backtest ({bt.total} Simulasi)
      </div>

      <div className="grid grid-cols-3 gap-3">
        {rows.map(r => (
          <div key={r.label} className="text-center">
            <div className="text-xs font-mono text-muted-foreground mb-1">{r.label}</div>
            <div className={cn("text-2xl font-mono font-bold", r.color)}>
              {(r.value * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/50">{r.count}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Akurasi Per Posisi</div>
        <div className="grid grid-cols-4 gap-2">
          {positions.map(p => (
            <div key={p.label} className="text-center">
              <div className="text-[10px] font-mono text-muted-foreground/60 mb-0.5">{p.label}</div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-0.5">
                <div className="h-full bg-primary rounded-full" style={{ width: `${p.value * 100}%` }} />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">{(p.value * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between text-xs font-mono text-muted-foreground border-t border-border pt-3">
        <span>Akurasi rata-rata</span>
        <span className="text-foreground font-bold">{(bt.avgAccuracy * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PredictionV5() {
  const [period, setPeriod] = useState("19:00");
  const [result, setResult] = useState<PredictionV5Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(withBacktest = false) {
    if (withBacktest) setLoadingBacktest(true);
    else setLoading(true);
    setError(null);
    try {
      const skipBacktest = withBacktest ? "false" : "true";
      const res = await fetch(`/api/prediction/v5/generate?period=${encodeURIComponent(period)}&skipBacktest=${skipBacktest}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json() as PredictionV5Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal generate prediksi");
    } finally {
      setLoading(false);
      setLoadingBacktest(false);
    }
  }

  const maxContributionPct = result
    ? Math.max(...result.engineContributions.map(e => e.contributionPct), 1)
    : 1;

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-400 font-mono text-xs uppercase tracking-widest mb-1">
            <Bot className="w-4 h-4" /> Prediksi V5 — 13 Engine AI
          </div>
          <h1 className="text-2xl font-bold font-mono">Prediksi V5</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            13 mesin analitik dengan breakdown kontribusi transparan. Threshold 55%.
          </p>
        </div>
      </div>

      {/* Session picker + generate buttons */}
      <div className="bg-card border border-border rounded-sm p-4 space-y-4">
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase block mb-2">Pilih Sesi:</span>
          <div className="flex flex-wrap gap-1.5">
            {SESSIONS.map(s => (
              <button
                key={s}
                onClick={() => { setPeriod(s); setResult(null); }}
                className={cn(
                  "px-3 py-1.5 text-xs font-mono rounded-sm border transition-colors",
                  period === s
                    ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {s} WIB
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generate(false)}
            disabled={loading || loadingBacktest}
            className="flex items-center gap-2 px-4 py-2 rounded-sm border border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 font-mono text-sm transition-colors disabled:opacity-50"
          >
            <Zap className={cn("w-4 h-4", loading && "animate-pulse")} />
            {loading ? "Memproses..." : "Generate Prediksi"}
          </button>
          <button
            onClick={() => generate(true)}
            disabled={loading || loadingBacktest}
            className="flex items-center gap-2 px-4 py-2 rounded-sm border border-border bg-secondary hover:bg-secondary/80 text-sm font-mono transition-colors disabled:opacity-50"
          >
            <BarChart2 className={cn("w-4 h-4", loadingBacktest && "animate-pulse")} />
            {loadingBacktest ? "Backtesting..." : "+ Backtest"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-sm p-4 text-destructive font-mono text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* No signal banner */}
      {result?.noSignal && (
        <div className="bg-red-500/5 border border-red-500/30 rounded-sm p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-400 font-mono text-sm font-bold">
            <AlertCircle className="w-4 h-4" /> NO SIGNAL
            <span className="font-normal text-xs text-muted-foreground ml-2">
              Confidence: {(result.confidence * 100).toFixed(1)}% · {result.signalEngines}/{result.activeEngines} engines aktif
            </span>
          </div>
          <p className="text-red-400/80 font-mono text-xs leading-relaxed">{result.noSignalReason}</p>
          <p className="text-muted-foreground/60 font-mono text-xs">Sistem menolak prediksi untuk mencegah false confidence. Kandidat di bawah hanya referensi.</p>
        </div>
      )}

      {/* Main result grid */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left: Prediction + confidence */}
          <div className="lg:col-span-1 space-y-4">
            {/* Prediction number */}
            <div className={cn(
              "bg-card border rounded-sm p-6 text-center",
              result.noSignal ? "border-border" : "border-violet-500/30"
            )}>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
                Prediksi V5 · {result.period} WIB
              </div>
              {result.prediction ? (
                <>
                  <div className="text-7xl font-mono font-bold text-violet-400 tracking-[0.15em] leading-none mb-4">
                    {result.prediction}
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-mono text-emerald-400">SINYAL VALID</span>
                  </div>
                </>
              ) : (
                <div className="text-5xl font-mono text-muted-foreground/20 tracking-widest py-4">
                  — — — —
                </div>
              )}
              <div className="mt-3 text-[10px] font-mono text-muted-foreground/40">
                {result.dataPoints} draw historis · {result.predictionId}
              </div>
            </div>

            {/* Confidence gauge */}
            <ConfidenceGauge
              value={result.confidence}
              level={result.confidenceBreakdown.level}
              threshold={result.threshold}
            />

            {/* Confidence breakdown */}
            <div className="bg-card border border-border rounded-sm p-4 space-y-3">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Breakdown</div>
              <BreakdownBar label="Engine Agreement" value={result.confidenceBreakdown.engineAgreement} color="text-emerald-400" />
              <BreakdownBar label="Signal Strength" value={result.confidenceBreakdown.signalStrength} color="text-primary" />
              <BreakdownBar label="Data Quality" value={result.confidenceBreakdown.dataQuality} color="text-blue-400" />
              <BreakdownBar label="Concentration" value={result.confidenceBreakdown.concentration} color="text-violet-400" />
            </div>

            {/* Backtest */}
            {result.backtest && <BacktestPanel bt={result.backtest} />}
          </div>

          {/* Right: Engine contributions */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  <Activity className="w-3.5 h-3.5" /> 13 Engine Kontribusi
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  <span className="text-emerald-400 font-bold">{result.signalEngines}</span>/{result.activeEngines} sinyal
                </div>
              </div>

              {/* Legend */}
              <div className="px-4 py-2 border-b border-border/50 bg-secondary/10 flex items-center gap-4 text-[9px] font-mono text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> SINYAL</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 inline-block" /> TIDAK AKTIF</span>
                {Object.entries(CATEGORY_COLORS).map(([cat, cls]) => (
                  <span key={cat} className="flex items-center gap-1 hidden sm:flex">
                    <span className={cn("w-1.5 h-1.5 rounded-full inline-block", cls)} /> {cat}
                  </span>
                ))}
              </div>

              <div className="divide-y divide-border/30">
                {result.engineContributions.map((eng) => (
                  <EngineBar key={eng.id} engine={eng} maxPct={maxContributionPct} />
                ))}
              </div>
            </div>

            {/* Top candidates */}
            {result.topCandidates.length > 0 && (
              <div className="bg-card border border-border rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-secondary/30">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Top 10 Kandidat</div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 divide-x divide-y divide-border/30">
                  {result.topCandidates.slice(0, 10).map((c) => (
                    <div key={c.number} className={cn(
                      "p-3 text-center",
                      c.rank === 1 ? "bg-violet-500/5" : ""
                    )}>
                      <div className="text-[10px] font-mono text-muted-foreground/50 mb-1">#{c.rank}</div>
                      <div className={cn(
                        "text-xl font-mono font-bold tracking-widest",
                        c.rank === 1 ? "text-violet-400" : "text-foreground"
                      )}>
                        {c.number}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                        {(c.score * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BBFS candidates */}
            {result.bbfsCandidates.length > 0 && (
              <div className="bg-card border border-border rounded-sm p-4">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
                  <Shield className="w-3.5 h-3.5" /> BBFS Kandidat ({result.bbfsCandidates.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.bbfsCandidates.slice(0, 27).map((num) => (
                    <span key={num} className="px-2 py-1 font-mono text-xs rounded-sm bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors">
                      {num}
                    </span>
                  ))}
                  {result.bbfsCandidates.length > 27 && (
                    <span className="px-2 py-1 font-mono text-xs text-muted-foreground/40">
                      +{result.bbfsCandidates.length - 27} lainnya
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="text-[10px] font-mono text-muted-foreground/30 flex items-center gap-2">
              <TrendingUp className="w-3 h-3" />
              Generated: {new Date(result.generatedAt).toLocaleString("id-ID")} ·
              Threshold: {Math.round(result.threshold * 100)}% ·
              Data: {result.dataPoints} draw
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !loadingBacktest && !error && (
        <div className="bg-card border border-border rounded-sm p-16 text-center space-y-3">
          <Bot className="w-10 h-10 text-muted-foreground/20 mx-auto" />
          <div className="font-mono text-muted-foreground text-sm">
            Pilih sesi dan klik <span className="text-violet-400 font-bold">Generate Prediksi</span>
          </div>
          <div className="text-xs font-mono text-muted-foreground/50">
            13 mesin AI akan dijalankan untuk menganalisis data historis
          </div>
        </div>
      )}
    </div>
  );
}
