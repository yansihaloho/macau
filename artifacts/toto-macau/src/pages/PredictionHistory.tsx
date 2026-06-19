import React, { useState } from "react";
import { ClipboardList, RefreshCw, CheckCircle, XCircle, Clock, Minus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PERIODS = ["all", "00:01", "13:00", "16:00", "19:00", "22:00", "23:00"];

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
  confidence: number | null;
}

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
        <div key={i} className={cn(
          "w-2.5 h-2.5 rounded-full",
          i < matched ? "bg-emerald-400" : "bg-secondary/60 border border-border"
        )} />
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
    } catch { /* ignore */ }
    finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-2 py-0.5 text-[10px] font-mono rounded-sm bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
        >
          {deleting ? "..." : "Hapus"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-0.5 text-[10px] font-mono rounded-sm bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 transition-colors"
        >
          Batal
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded-sm text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
      title="Hapus record ini"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

export default function PredictionHistory() {
  const [period, setPeriod] = useState("all");
  const [limit, setLimit] = useState(100);
  const [data, setData] = useState<HistoryRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchHistory() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (period !== "all") params.set("period", period);
      const res = await fetch(`/api/prediction/v4/history?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as HistoryRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat riwayat");
    } finally {
      setLoading(false);
    }
  }

  function handleDeleted(id: number) {
    setData(prev => prev ? prev.filter(r => r.id !== id) : prev);
  }

  React.useEffect(() => { fetchHistory(); }, [period, limit]);

  const resolved = data?.filter((r) => r.status !== "pending") ?? [];
  const exact = resolved.filter((r) => r.status === "exact").length;
  const partial = resolved.filter((r) => r.status === "partial").length;
  const miss = resolved.filter((r) => r.status === "miss").length;
  const avgAccuracy = resolved.length > 0
    ? resolved.reduce((s, r) => s + (r.accuracy ?? 0), 0) / resolved.length
    : 0;

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-widest mb-1">
            <ClipboardList className="w-4 h-4" /> Riwayat Prediksi V4
          </div>
          <h1 className="text-2xl font-bold font-mono">Riwayat Prediksi</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Rekam jejak prediksi mesin V4 dan akurasi hasilnya.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-sm border border-border bg-secondary hover:bg-secondary/80 text-sm font-mono transition-colors disabled:opacity-50 shrink-0 self-start"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border rounded-sm p-3 space-y-3">
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase block mb-2">Sesi:</span>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-2.5 py-1 text-xs font-mono rounded-sm border transition-colors",
                  period === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {p === "all" ? "Semua" : p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase block mb-2">Tampil:</span>
          <div className="flex gap-1.5">
            {[50, 100, 200].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={cn(
                  "px-3 py-1 text-xs font-mono rounded-sm border transition-colors",
                  limit === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {data && resolved.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Rata-rata", value: `${(avgAccuracy * 100).toFixed(1)}%`, color: "text-primary" },
            { label: "Tepat (4D)", value: String(exact), color: "text-emerald-400" },
            { label: "Sebagian", value: String(partial), color: "text-amber-400" },
            { label: "Meleset", value: String(miss), color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-sm p-3">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-1">{label}</div>
              <div className={cn("text-2xl font-mono font-bold", color)}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-sm p-4 text-destructive font-mono text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-muted-foreground font-mono text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Memuat riwayat...
        </div>
      )}

      {data && (
        <>
          {data.length === 0 && (
            <div className="bg-card border border-border rounded-sm p-12 text-center text-muted-foreground font-mono text-sm">
              Belum ada riwayat prediksi V4.
            </div>
          )}

          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {data.map((row) => (
              <div key={row.id} className="bg-card border border-border rounded-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{row.date} · {row.period} WIB</div>
                    <div className="font-mono text-2xl font-bold text-primary tracking-widest mt-0.5">{row.prediction}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={row.status} />
                    <DeleteButton id={row.id} onDeleted={() => handleDeleted(row.id)} />
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Aktual</div>
                    {row.actualResult
                      ? <DigitMatch pred={row.prediction} actual={row.actualResult} />
                      : <span className="font-mono text-muted-foreground text-xs">Menunggu…</span>}
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Digit Cocok</div>
                    <MatchDots matched={row.matchedDigits} />
                  </div>
                  {row.confidence !== null && (
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Confidence</div>
                      <div className="font-mono text-xs text-foreground">{(row.confidence * 100).toFixed(0)}%</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-card border border-border rounded-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    {["Tanggal", "Sesi", "Prediksi", "Aktual", "Digit Cocok", "Confidence", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider last:w-12">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
                      <td className="px-4 py-3 text-foreground">{row.date}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.period}</td>
                      <td className="px-4 py-3">
                        <span className="text-primary font-bold tracking-widest">{row.prediction}</span>
                      </td>
                      <td className="px-4 py-3">
                        <DigitMatch pred={row.prediction} actual={row.actualResult} />
                      </td>
                      <td className="px-4 py-3">
                        <MatchDots matched={row.matchedDigits} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.confidence !== null ? `${(row.confidence * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <DeleteButton id={row.id} onDeleted={() => handleDeleted(row.id)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
