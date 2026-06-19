import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarDays, RefreshCw, Clock, CheckCircle, XCircle,
  Minus, Zap, AlertCircle, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WIB_SESSIONS, getNextSessionInfo, formatCountdown, getWIBTimeString,
} from "@/lib/schedule";

interface SessionData {
  period: string;
  prediction: string | null;
  confidence: number | null;
  status: string;
  actualResult: string | null;
  matchedDigits: number | null;
  accuracy: number | null;
  source: string | null;
  hasHistory: boolean;
  recordId: number | null;
}

interface TodayData {
  date: string;
  sessions: SessionData[];
}

const SESSION_LABELS: Record<string, string> = {
  "00:01": "00:01 WIB",
  "13:00": "13:00 WIB",
  "16:00": "16:00 WIB",
  "19:00": "19:00 WIB",
  "22:00": "22:00 WIB",
  "23:00": "23:00 WIB",
};

const SESSION_TIMES: Record<string, [number, number]> = {
  "00:01": [0, 1],
  "13:00": [13, 0],
  "16:00": [16, 0],
  "19:00": [19, 0],
  "22:00": [22, 0],
  "23:00": [23, 0],
};

function getWIBNow() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return { h: wib.getUTCHours(), m: wib.getUTCMinutes() };
}

function getSessionState(period: string): "past" | "upcoming" | "next" {
  const { h, m } = getWIBNow();
  const nowMins = h * 60 + m;
  const [sh, sm] = SESSION_TIMES[period] ?? [0, 0];
  const sessionMins = sh * 60 + sm;
  if (nowMins > sessionMins + 2) return "past";
  const info = getNextSessionInfo();
  if (info.period === period) return "next";
  return "upcoming";
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
    case "none":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono bg-secondary text-muted-foreground border border-border">
          <AlertCircle className="w-3 h-3" /> BELUM ADA
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
  if (!actual || !pred) return <span className="font-mono text-muted-foreground text-sm">—</span>;
  return (
    <span className="font-mono tracking-widest text-lg font-bold">
      {pred.split("").map((d, i) => (
        <span key={i} className={d === actual[i] ? "text-emerald-400" : "text-red-400"}>
          {actual[i] ?? "?"}
        </span>
      ))}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 65 ? "bg-emerald-500" : pct >= 45 ? "bg-primary" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{pct}%</span>
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
    <div className="bg-card border border-primary/20 rounded-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
          Sesi Berikutnya
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-mono font-bold text-primary">{info.period} WIB</span>
          <span className="text-xs font-mono text-muted-foreground border border-border px-2 py-0.5 rounded-sm bg-secondary">
            {wibTime}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
          Mundur
        </div>
        <div className="text-3xl font-mono font-bold tabular-nums text-foreground">
          {formatCountdown(info.secondsUntil)}
        </div>
      </div>
    </div>
  );
}

function GenerateButton({
  period,
  loading,
  onClick,
}: {
  period: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
    >
      <Zap className={cn("w-3 h-3", loading && "animate-pulse")} />
      {loading ? "..." : "Generate"}
    </button>
  );
}

export default function TodayPrediction() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prediction/today");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as TodayData);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  const generateForSession = async (period: string) => {
    setGenerating(g => ({ ...g, [period]: true }));
    try {
      await fetch(`/api/prediction/v4/generate?period=${encodeURIComponent(period)}&skipBacktest=true`);
      await fetchToday();
    } catch { /* ignore */ }
    finally {
      setGenerating(g => ({ ...g, [period]: false }));
    }
  };

  const generateAll = async () => {
    setLoading(true);
    const sessions = WIB_SESSIONS as readonly string[];
    await Promise.allSettled(
      sessions.map(p =>
        fetch(`/api/prediction/v4/generate?period=${encodeURIComponent(p)}&skipBacktest=true`)
      )
    );
    await fetchToday();
  };

  useEffect(() => {
    fetchToday();
    // Auto-refresh every 2 minutes
    const t = setInterval(fetchToday, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchToday]);

  const dateStr = data?.date
    ? new Date(data.date + "T00:00:00+07:00").toLocaleDateString("id-ID", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })
    : "—";

  const resolved = data?.sessions.filter(s => s.status !== "pending" && s.status !== "none") ?? [];
  const exact = resolved.filter(s => s.status === "exact").length;
  const partial = resolved.filter(s => s.status === "partial").length;
  const miss = resolved.filter(s => s.status === "miss").length;
  const pending = data?.sessions.filter(s => s.status === "pending" || s.status === "none").length ?? 0;

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-widest mb-1">
            <CalendarDays className="w-4 h-4" /> Prediksi Hari Ini
          </div>
          <h1 className="text-2xl font-bold font-mono">Prediksi Hari Ini</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">{dateStr}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start">
          <button
            onClick={generateAll}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 text-sm font-mono transition-colors disabled:opacity-50"
          >
            <Zap className={cn("w-4 h-4", loading && "animate-pulse")} />
            Generate Semua
          </button>
          <button
            onClick={fetchToday}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-sm border border-border bg-secondary hover:bg-secondary/80 text-sm font-mono transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Countdown */}
      <Countdown />

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Tepat 4D", value: String(exact), color: "text-emerald-400" },
            { label: "Sebagian", value: String(partial), color: "text-amber-400" },
            { label: "Meleset", value: String(miss), color: "text-red-400" },
            { label: "Pending", value: String(pending), color: "text-muted-foreground" },
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
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Memuat prediksi...
        </div>
      )}

      {/* Session cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.sessions.map((session) => {
            const state = getSessionState(session.period);
            const isNext = state === "next";
            const isPast = state === "past";

            return (
              <div
                key={session.period}
                className={cn(
                  "bg-card border rounded-sm p-4 space-y-3 transition-all",
                  isNext
                    ? "border-primary/50 shadow-[0_0_20px_rgba(var(--primary)/0.08)] ring-1 ring-primary/20"
                    : isPast
                    ? "border-border/50 opacity-90"
                    : "border-border"
                )}
              >
                {/* Top row: session label + state badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={cn(
                      "text-xs font-mono uppercase tracking-widest mb-0.5",
                      isNext ? "text-primary" : "text-muted-foreground"
                    )}>
                      {SESSION_LABELS[session.period]}
                    </div>
                    {isNext && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border bg-primary/10 text-primary border-primary/30 animate-pulse">
                        ● BERIKUTNYA
                      </span>
                    )}
                    {isPast && session.actualResult && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border bg-secondary text-muted-foreground border-border">
                        ✓ SELESAI
                      </span>
                    )}
                  </div>
                  <div className="shrink-0">
                    {session.hasHistory && !isPast && (
                      <GenerateButton
                        period={session.period}
                        loading={generating[session.period] ?? false}
                        onClick={() => generateForSession(session.period)}
                      />
                    )}
                    {!session.hasHistory && (
                      <GenerateButton
                        period={session.period}
                        loading={generating[session.period] ?? false}
                        onClick={() => generateForSession(session.period)}
                      />
                    )}
                  </div>
                </div>

                {/* Prediction number */}
                <div>
                  {session.prediction ? (
                    <div className={cn(
                      "text-5xl font-mono font-bold tracking-[0.15em] leading-none",
                      isNext ? "text-primary" : isPast && session.actualResult ? "text-muted-foreground" : "text-foreground"
                    )}>
                      {session.prediction}
                    </div>
                  ) : (
                    <div className="text-3xl font-mono text-muted-foreground/40 tracking-widest">— — — —</div>
                  )}
                </div>

                {/* Confidence */}
                {session.confidence !== null && (
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Confidence</div>
                    <ConfidenceBar value={session.confidence} />
                  </div>
                )}

                {/* Actual result (if past) */}
                {session.actualResult && (
                  <div className="pt-1 border-t border-border/50">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1.5">Hasil Aktual</div>
                    <div className="flex items-center gap-3">
                      <DigitMatch pred={session.prediction ?? ""} actual={session.actualResult} />
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            i < (session.matchedDigits ?? 0) ? "bg-emerald-400" : "bg-secondary/60 border border-border"
                          )} />
                        ))}
                        <span className="text-xs font-mono ml-1 text-muted-foreground">
                          {session.matchedDigits ?? 0}/4
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center justify-between">
                  <StatusBadge status={session.status} />
                  {session.source && (
                    <span className="text-[9px] font-mono text-muted-foreground/40 uppercase">
                      {session.source.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {lastUpdated && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/40">
          <TrendingUp className="w-3 h-3" />
          Diperbarui: {lastUpdated.toLocaleTimeString("id-ID")} · Auto-refresh setiap 2 menit
        </div>
      )}
    </div>
  );
}
