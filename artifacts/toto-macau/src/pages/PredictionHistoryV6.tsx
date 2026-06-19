import React, { useState, useCallback } from "react";
import {
  Cpu, RefreshCw, CheckCircle, XCircle, Clock, Minus,
  Trash2, TrendingUp, BarChart2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineBreakdown {
  source?: string;
  confidence?: number;
  signalEngines?: number;
  activeEngines?: number;
  engines?: Array<{
    id: string;
    label: string;
    signal: boolean;
    contributionPct: number;
    topCandidate: string | null;
  }>;
}

interface HistoryRecord {
  id: number;
  date: string;
  period: string;
  prediction: string;
  actualResult: string | null;
  matchedDigits: number | null;
  accuracy: number | null;
  status: string;
  createdAt: string;
  engineBreakdown?: string | null;
  confidence: number | null;
}

interface Parsed extends HistoryRecord {
  bd: EngineBreakdown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS = ["all", "00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

const V6_ENGINE_LABELS: Record<string, string> = {
  markov2:     "Markov Chain V3",
  hmm:         "Hidden Markov Model",
  globalfreq:  "Frequency Analysis",
  gapdist:     "Gap Analysis",
  momentum:    "Trend Analysis",
  cycle:       "Cycle Analysis",
  transition:  "Transition Matrix",
  posdep:      "Position Analysis",
  repeat:      "Repeat Pattern",
  hotcold:     "Mirror Pattern",
  bayesian:    "Digit Probability",
  entropy:     "Odd Even Engine",
  balance:     "Big Small Engine",
  streak:      "Consecutive Pattern",
  localfreq:   "Missing Number Engine",
  conditional: "Bayesian Probability",
  shannon:     "Entropy Analysis",
  correlation: "Correlation Engine",
  adaptive:    "Adaptive Ensemble",
  metavoting:  "Meta Scoring Engine",
};

const ENGINE_COLOR: Record<string, string> = {
  markov2:     "text-violet-400 bg-violet-500/10 border-violet-500/20",
  hmm:         "text-violet-400 bg-violet-500/10 border-violet-500/20",
  globalfreq:  "text-blue-400 bg-blue-500/10 border-blue-500/20",
  gapdist:     "text-blue-400 bg-blue-500/10 border-blue-500/20",
  momentum:    "text-amber-400 bg-amber-500/10 border-amber-500/20",
  cycle:       "text-amber-400 bg-amber-500/10 border-amber-500/20",
  transition:  "text-violet-400 bg-violet-500/10 border-violet-500/20",
  posdep:      "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  repeat:      "text-pink-400 bg-pink-500/10 border-pink-500/20",
  hotcold:     "text-pink-400 bg-pink-500/10 border-pink-500/20",
  bayesian:    "text-violet-400 bg-violet-500/10 border-violet-500/20",
  entropy:     "text-green-400 bg-green-500/10 border-green-500/20",
  balance:     "text-green-400 bg-green-500/10 border-green-500/20",
  streak:      "text-orange-400 bg-orange-500/10 border-orange-500/20",
  localfreq:   "text-blue-400 bg-blue-500/10 border-blue-500/20",
  conditional: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  shannon:     "text-teal-400 bg-teal-500/10 border-teal-500/20",
  correlation: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  adaptive:    "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  metavoting:  "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBd(raw?: string | null): EngineBreakdown {
  try { return raw ? (JSON.parse(raw) as EngineBreakdown) : {}; }
  catch { return {}; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "exact":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3 h-3" /> TEPAT
        </span>
      );
    case "partial":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Minus className="w-3 h-3" /> SEBAGIAN
        </span>
      );
    case "miss":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono bg-red-500/10 text-red-400 border border-red-500/20">
          <XCircle className="w-3 h-3" /> MELESET
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono bg-secondary text-muted-foreground border border-border">
          <Clock className="w-3 h-3" /> PENDING
        </span>
      );
  }
}

function DigitMatch({ pred, actual }: { pred: string; actual: string | null }) {
  if (!actual) return <span className="font-mono text-muted-foreground">—</span>;
  return (
    <span className="font-mono tracking-widest">
      {pred.split("").map((d, i) => (
        <span key={i} className={d === actual[i] ? "text-emerald-400" : "text-red-400"}>
          {actual[i] ?? "?"}
        </span>
      ))}
    </span>
  );
}

function MatchDots({ matched }: { matched: number | null }) {
  if (matched === null) return <span className="text-muted-foreground text-xs font-mono">—</span>;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={cn("w-2.5 h-2.5 rounded-full",
          i < matched ? "bg-emerald-400" : "bg-secondary/60 border border-border")} />
      ))}
      <span className={cn("text-xs font-mono ml-1",
        matched === 4 ? "text-emerald-400" : matched > 0 ? "text-amber-400" : "text-red-400"
      )}>{matched}/4</span>
    </div>
  );
}

function DeleteButton({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/prediction/history/${id}`, { method: "DELETE" });
      if (res.ok) onDeleted();
    } catch { /* ignore */ } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button onClick={handleDelete} disabled={deleting}
          className="px-2 py-0.5 text-[10px] font-mono rounded-sm bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50">
          {deleting ? "..." : "Hapus"}
        </button>
        <button onClick={() => setConfirming(false)}
          className="px-2 py-0.5 text-[10px] font-mono rounded-sm bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 transition-colors">
          Batal
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirming(true)}
      className="p-1.5 rounded-sm text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
      title="Hapus record ini">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

// ─── Engine breakdown panel ───────────────────────────────────────────────────

function EngineDetailPanel({ bd }: { bd: EngineBreakdown }) {
  const engines = bd.engines ?? [];
  if (engines.length === 0) return (
    <div className="text-xs font-mono text-muted-foreground/60 italic">Tidak ada data engine breakdown.</div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
      {engines.map((e) => (
        <div key={e.id} className={cn(
          "flex items-center justify-between px-2.5 py-1.5 rounded-sm border text-xs font-mono",
          e.signal
            ? ENGINE_COLOR[e.id] ?? "text-foreground bg-secondary border-border"
            : "text-muted-foreground/50 bg-secondary/30 border-border/50"
        )}>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", e.signal ? "bg-current" : "bg-muted-foreground/30")} />
            <span className="truncate">{V6_ENGINE_LABELS[e.id] ?? e.label}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {e.topCandidate && e.signal && (
              <span className="text-[10px] opacity-70">{e.topCandidate}</span>
            )}
            <span className={cn("text-[10px] font-bold", e.signal ? "opacity-100" : "opacity-40")}>
              {e.signal ? `${e.contributionPct.toFixed(0)}%` : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Expandable record card ───────────────────────────────────────────────────

function ExpandableCard({ row, onDeleted }: { row: Parsed; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const { bd } = row;
  const conf = typeof bd.confidence === "number" ? bd.confidence : null;
  const signalCount = bd.signalEngines ?? 0;
  const activeCount = bd.activeEngines ?? 0;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-mono text-xs text-muted-foreground">{row.date}</span>
            <span className="font-mono text-xs text-muted-foreground/50">·</span>
            <span className="font-mono text-xs text-muted-foreground">{row.period} WIB</span>
            {signalCount > 0 && (
              <span className="text-[10px] font-mono text-cyan-400/70">{signalCount}/{activeCount} engines aktif</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-2xl font-bold text-cyan-400 tracking-widest">{row.prediction}</span>
            {row.actualResult && (
              <>
                <span className="text-muted-foreground/30 font-mono">→</span>
                <DigitMatch pred={row.prediction} actual={row.actualResult} />
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={row.status} />
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 pb-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Digit Cocok</div>
          <MatchDots matched={row.matchedDigits} />
        </div>
        {conf !== null && (
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Confidence</div>
            <div className={cn("font-mono text-sm font-bold",
              conf >= 0.70 ? "text-emerald-400" : conf >= 0.60 ? "text-amber-400" : "text-red-400"
            )}>{(conf * 100).toFixed(1)}%</div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded-sm border border-border bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Cpu className="w-3 h-3" /> 20 Engine
          </button>
          <div onClick={(e) => e.stopPropagation()}>
            <DeleteButton id={row.id} onDeleted={onDeleted} />
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/50 px-4 py-3 bg-secondary/10">
          <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2 tracking-wider">
            Kontribusi 20 Engine V6 — Quant Research
          </div>
          <EngineDetailPanel bd={bd} />
        </div>
      )}
    </div>
  );
}

// ─── Engine accuracy table ────────────────────────────────────────────────────

function EngineAccuracyTable({ records }: { records: Parsed[] }) {
  const resolved = records.filter((r) => r.status !== "pending");
  if (resolved.length === 0) return null;

  type EngStat = { id: string; label: string; appearances: number; signal: number; wins: number; partial: number; totalPct: number };
  const stats: Record<string, EngStat> = {};

  for (const row of resolved) {
    for (const e of (row.bd.engines ?? [])) {
      if (!stats[e.id]) {
        stats[e.id] = { id: e.id, label: V6_ENGINE_LABELS[e.id] ?? e.label, appearances: 0, signal: 0, wins: 0, partial: 0, totalPct: 0 };
      }
      stats[e.id]!.appearances++;
      if (e.signal) {
        stats[e.id]!.signal++;
        stats[e.id]!.totalPct += e.contributionPct;
        if (row.status === "exact") stats[e.id]!.wins++;
        if (row.status === "partial") stats[e.id]!.partial++;
      }
    }
  }

  const sorted = Object.values(stats).filter((s) => s.signal > 0).sort((a, b) => b.wins - a.wins || b.signal - a.signal);
  if (sorted.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
        <BarChart2 className="w-4 h-4 text-cyan-400" />
        <span className="font-mono text-sm font-bold text-foreground">Akurasi Per Engine</span>
        <span className="text-xs font-mono text-muted-foreground ml-auto">{resolved.length} prediksi dianalisis</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              {["Engine", "Aktif", "Win (4D)", "Sebagian", "Win Rate", "Avg Kontribusi"].map((h) => (
                <th key={h} className="text-left px-4 py-2 text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const winRate = s.signal > 0 ? s.wins / s.signal : 0;
              const avgPct = s.signal > 0 ? s.totalPct / s.signal : 0;
              const col = ENGINE_COLOR[s.id] ?? "";
              const dotColor = col.includes("violet") ? "bg-violet-400"
                : col.includes("blue") ? "bg-blue-400"
                : col.includes("amber") ? "bg-amber-400"
                : col.includes("cyan") ? "bg-cyan-400"
                : col.includes("pink") ? "bg-pink-400"
                : col.includes("green") ? "bg-green-400"
                : col.includes("orange") ? "bg-orange-400"
                : col.includes("teal") ? "bg-teal-400"
                : "bg-primary";
              return (
                <tr key={s.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
                      <span className="text-foreground">{s.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{s.signal}/{s.appearances}</td>
                  <td className="px-4 py-2"><span className="text-emerald-400 font-bold">{s.wins}</span></td>
                  <td className="px-4 py-2"><span className="text-amber-400">{s.partial}</span></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full",
                          winRate >= 0.3 ? "bg-emerald-400" : winRate >= 0.1 ? "bg-amber-400" : "bg-red-400"
                        )} style={{ width: `${Math.round(winRate * 100)}%` }} />
                      </div>
                      <span className={cn("font-bold",
                        winRate >= 0.3 ? "text-emerald-400" : winRate >= 0.1 ? "text-amber-400" : "text-red-400"
                      )}>{(winRate * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{avgPct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Accuracy timeline ────────────────────────────────────────────────────────

function AccuracyTimeline({ records }: { records: Parsed[] }) {
  const resolved = records.filter((r) => r.status !== "pending").slice(0, 30).reverse();
  if (resolved.length < 3) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-cyan-400" />
        <span className="font-mono text-sm font-bold text-foreground">Tren Akurasi (30 Terakhir)</span>
        <span className="text-xs font-mono text-muted-foreground ml-auto">Digit cocok per prediksi</span>
      </div>
      <div className="flex items-end gap-1 h-16">
        {resolved.map((r) => {
          const matched = r.matchedDigits ?? 0;
          return (
            <div key={r.id} className="flex-1 flex flex-col items-center justify-end"
              title={`${r.date} ${r.period}: ${matched}/4`}>
              <div
                className={cn("w-full rounded-sm transition-all",
                  matched === 4 ? "bg-emerald-400"
                  : matched >= 2 ? "bg-amber-400"
                  : matched === 1 ? "bg-orange-400"
                  : "bg-red-400/60"
                )}
                style={{ height: `${Math.max((matched / 4) * 100, 8)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] font-mono text-muted-foreground/50">Lama</span>
        <span className="text-[9px] font-mono text-muted-foreground/50">Terbaru</span>
      </div>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {[
          { color: "bg-emerald-400", label: "4D Tepat" },
          { color: "bg-amber-400", label: "2–3D" },
          { color: "bg-red-400/60", label: "0D" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={cn("w-2.5 h-2.5 rounded-sm", color)} />
            <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PredictionHistoryV6() {
  const [period, setPeriod] = useState("all");
  const [limit, setLimit] = useState(100);
  const [data, setData] = useState<Parsed[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (period !== "all") params.set("period", period);
      const res = await fetch(`/api/prediction/v6/history?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json() as HistoryRecord[];
      setData(raw.map((r) => ({ ...r, bd: parseBd(r.engineBreakdown) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat riwayat V6");
    } finally {
      setLoading(false);
    }
  }, [period, limit]);

  React.useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  function handleDeleted(id: number) {
    setData((prev) => prev ? prev.filter((r) => r.id !== id) : prev);
  }

  const resolved = data?.filter((r) => r.status !== "pending") ?? [];
  const exact    = resolved.filter((r) => r.status === "exact").length;
  const partial  = resolved.filter((r) => r.status === "partial").length;
  const miss     = resolved.filter((r) => r.status === "miss").length;
  const pending  = (data?.length ?? 0) - resolved.length;
  const avgAccuracy = resolved.length > 0
    ? resolved.reduce((s, r) => s + (r.accuracy ?? 0), 0) / resolved.length : 0;

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest mb-1">
            <Cpu className="w-4 h-4" /> Riwayat Prediksi V6
          </div>
          <h1 className="text-2xl font-bold font-mono">Riwayat Prediksi V6</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Rekam jejak &amp; akurasi 20 engine V6 — Quant Research Edition.
          </p>
        </div>
        <button
          onClick={() => void fetchHistory()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-sm border border-border bg-secondary hover:bg-secondary/80 text-sm font-mono transition-colors disabled:opacity-50 shrink-0 self-start"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase block mb-2">Sesi:</span>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("px-2.5 py-1 text-xs font-mono rounded-sm border transition-colors",
                  period === p
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                )}>
                {p === "all" ? "Semua" : p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase block mb-2">Tampil:</span>
          <div className="flex gap-1.5">
            {[50, 100, 200].map((n) => (
              <button key={n} onClick={() => setLimit(n)}
                className={cn("px-3 py-1 text-xs font-mono rounded-sm border transition-colors",
                  limit === n
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                )}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total",      value: String(data.length),                                     color: "text-foreground" },
            { label: "Rata-rata",  value: resolved.length ? `${(avgAccuracy * 100).toFixed(1)}%` : "—", color: "text-cyan-400" },
            { label: "Tepat (4D)", value: String(exact),                                            color: "text-emerald-400" },
            { label: "Sebagian",   value: String(partial),                                          color: "text-amber-400" },
            { label: "Meleset",    value: String(miss),                                             color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 last:col-span-full sm:last:col-span-1">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-1">{label}</div>
              <div className={cn("text-2xl font-mono font-bold", color)}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Win/loss distribution bar */}
      {resolved.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-mono text-muted-foreground uppercase mb-3">
            Distribusi Hasil ({resolved.length} resolved)
          </div>
          <div className="flex h-4 rounded-sm overflow-hidden gap-0.5">
            {exact > 0 && (
              <div className="bg-emerald-400" style={{ width: `${(exact / resolved.length) * 100}%` }}
                title={`Tepat: ${exact}`} />
            )}
            {partial > 0 && (
              <div className="bg-amber-400" style={{ width: `${(partial / resolved.length) * 100}%` }}
                title={`Sebagian: ${partial}`} />
            )}
            {miss > 0 && (
              <div className="bg-red-400/70" style={{ width: `${(miss / resolved.length) * 100}%` }}
                title={`Meleset: ${miss}`} />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] font-mono text-muted-foreground flex-wrap">
            <span><span className="text-emerald-400 font-bold">{exact}</span> Tepat ({((exact / resolved.length) * 100).toFixed(0)}%)</span>
            <span><span className="text-amber-400 font-bold">{partial}</span> Sebagian ({((partial / resolved.length) * 100).toFixed(0)}%)</span>
            <span><span className="text-red-400 font-bold">{miss}</span> Meleset ({((miss / resolved.length) * 100).toFixed(0)}%)</span>
            {pending > 0 && <span><span className="text-muted-foreground font-bold">{pending}</span> Pending</span>}
          </div>
        </div>
      )}

      {/* Accuracy timeline */}
      {data && <AccuracyTimeline records={data} />}

      {/* Engine accuracy table */}
      {data && <EngineAccuracyTable records={data} />}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive font-mono text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-muted-foreground font-mono text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Memuat riwayat V6…
        </div>
      )}

      {/* Records */}
      {data && (
        <>
          {data.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Cpu className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <div className="text-muted-foreground font-mono text-sm">
                Belum ada riwayat prediksi V6.
              </div>
              <div className="text-muted-foreground/50 font-mono text-xs mt-1">
                Buat prediksi pertama di halaman Prediksi V6.
              </div>
            </div>
          )}
          <div className="space-y-2">
            {data.map((row) => (
              <ExpandableCard key={row.id} row={row} onDeleted={() => handleDeleted(row.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
