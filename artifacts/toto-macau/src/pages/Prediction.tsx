import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { Cpu, RefreshCw, Clock, Zap } from "lucide-react";
import {
  WIB_SESSIONS, type WIBSession,
  getNextSessionInfo, getCurrentOrNextSession,
  formatCountdown, getWIBTimeString,
} from "@/lib/schedule";

const ENGINE_COLORS: Record<string, string> = {
  markov: "#f59e0b",
  frequency: "#3b82f6",
  gap: "#f97316",
  trend: "#22c55e",
  cycle: "#a855f7",
};

const tooltipStyle = {
  contentStyle: { backgroundColor: "#0a0a0a", borderColor: "#262626", fontFamily: "monospace", fontSize: 12 },
  itemStyle: { color: "#f59e0b" },
  cursor: { fill: "#1a1a1a" },
};

interface EngineScore { name: string; prediction: string; weight: number; score: number; }
interface Candidate { number: string; score: number; }
interface PredictionResult {
  prediction: string; confidence: number; period: string;
  engines: EngineScore[]; topCandidates: Candidate[]; generatedAt: string;
}
interface PredictionRecord {
  id: number; date: string; period: string; prediction: string;
  actualResult: string | null; matchedDigits: number | null;
  accuracy: number | null; status: string; createdAt: string;
}
interface AccuracyStats {
  total: number; resolved: number; avgAccuracy: number;
  avg7d: number; avg30d: number; engineWeights: Record<string, number>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "exact") return <Badge className="bg-green-900/40 text-green-400 border-green-800 font-mono text-[10px]">EXACT</Badge>;
  if (status === "partial") return <Badge className="bg-amber-900/40 text-amber-400 border-amber-800 font-mono text-[10px]">PARTIAL</Badge>;
  if (status === "miss") return <Badge className="bg-red-900/40 text-red-400 border-red-800 font-mono text-[10px]">MISS</Badge>;
  return <Badge className="bg-secondary text-muted-foreground border-border font-mono text-[10px]">PENDING</Badge>;
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
    <div className="flex items-center gap-3 bg-card border border-border rounded-sm px-4 py-2">
      <Clock className="w-4 h-4 text-primary shrink-0" />
      <div className="font-mono text-xs">
        <span className="text-muted-foreground">Waktu WIB: </span>
        <span className="text-foreground">{wibTime}</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="font-mono text-xs">
        <span className="text-muted-foreground">Sesi berikutnya </span>
        <span className="text-primary font-bold">{info.period}</span>
        <span className="text-muted-foreground"> dalam </span>
        <span className="text-amber-400 font-bold tabular-nums">{formatCountdown(info.secondsUntil)}</span>
      </div>
    </div>
  );
}

export default function Prediction() {
  const [period, setPeriod] = useState<WIBSession>(() => getCurrentOrNextSession());
  const [pred, setPred] = useState<PredictionResult | null>(null);
  const [history, setHistory] = useState<PredictionRecord[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionSwitchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrediction = useCallback(async (p: WIBSession) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prediction/generate?period=${encodeURIComponent(p)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPred(await res.json() as PredictionResult);
      setLastFetched(new Date().toLocaleTimeString("id-ID"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat prediksi");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const [hRes, aRes] = await Promise.all([
        fetch("/api/prediction/history?limit=30"),
        fetch("/api/prediction/accuracy"),
      ]);
      if (hRes.ok) setHistory(await hRes.json() as PredictionRecord[]);
      if (aRes.ok) setAccuracy(await aRes.json() as AccuracyStats);
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrediction(period);
    fetchHistory();
  }, [period]);

  // Auto-refresh prediction every 5 minutes
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      fetchPrediction(period);
    }, 5 * 60 * 1000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [period, fetchPrediction]);

  // Auto-switch to next session when current session time arrives
  useEffect(() => {
    sessionSwitchRef.current = setInterval(() => {
      const next = getCurrentOrNextSession();
      if (next !== period) {
        setPeriod(next);
      }
    }, 30 * 1000);
    return () => { if (sessionSwitchRef.current) clearInterval(sessionSwitchRef.current); };
  }, [period]);

  const engineWeightData = accuracy?.engineWeights
    ? Object.entries(accuracy.engineWeights).map(([name, weight]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        weight: Math.round((weight as number) * 100),
      }))
    : [];

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight">AI PREDICTION ENGINE</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Markov · Frequency · Gap · Trend · Cycle · Prediksi otomatis per sesi</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { fetchPrediction(period); fetchHistory(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border font-mono text-xs rounded-sm hover:bg-secondary/70 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          {lastFetched && (
            <span className="font-mono text-[10px] text-muted-foreground/50">Diperbarui {lastFetched}</span>
          )}
        </div>
      </div>

      {/* Countdown */}
      <Countdown />

      {/* Session picker */}
      <div className="bg-card border border-border rounded-sm p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider mr-1">Pilih sesi:</span>
          {WIB_SESSIONS.map((s) => {
            const isNext = s === getNextSessionInfo().period;
            return (
              <button
                key={s}
                onClick={() => setPeriod(s)}
                className={cn(
                  "relative px-3 py-1 text-xs font-mono rounded-sm border transition-colors",
                  period === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {s}
                {isNext && (
                  <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">
            ● = sesi aktif berikutnya
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-sm p-3 text-rose-400 text-xs font-mono">
          {error}
        </div>
      )}

      {/* Main prediction card + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 border-border bg-card border-primary/20">
          <CardHeader className="border-b border-border/50 pb-3 pt-4 px-5">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <CardTitle className="font-mono text-sm uppercase">
                Prediksi Sesi {period} WIB
              </CardTitle>
              {loading && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin ml-auto" />}
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {loading ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="font-mono text-xs text-muted-foreground animate-pulse text-center space-y-1">
                  <p>⚙ Menjalankan engine prediksi...</p>
                  <p className="text-muted-foreground/50">Markov · Frequency · Gap · Trend · Cycle</p>
                </div>
                <Skeleton className="h-20 w-40" />
                <Skeleton className="h-4 w-60" />
              </div>
            ) : pred ? (
              <div className="flex flex-col items-center gap-5">
                <div className="text-center">
                  <div className="font-mono text-[72px] md:text-[96px] font-bold text-primary tracking-[0.2em] drop-shadow-[0_0_30px_rgba(245,158,11,0.5)] leading-none">
                    {pred.prediction}
                  </div>
                  <div className="font-mono text-sm text-muted-foreground mt-3">
                    Sesi: <span className="text-foreground">{pred.period} WIB</span>
                    &nbsp;·&nbsp;
                    Confidence: <span className="text-primary font-bold">{Math.round(pred.confidence * 100)}%</span>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/40 mt-1">
                    Digenerate: {new Date(pred.generatedAt).toLocaleString("id-ID")}
                  </div>
                </div>

                <div className="w-full border border-border/50 rounded-sm overflow-hidden">
                  <div className="grid grid-cols-3 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border/50">
                    {pred.engines?.map(engine => (
                      <div key={engine.name} className="p-3 flex flex-col items-center gap-1 bg-secondary/10">
                        <div className="font-mono text-[10px] text-muted-foreground uppercase">{engine.name}</div>
                        <div className="font-mono text-lg font-bold" style={{ color: ENGINE_COLORS[engine.name] ?? "#f59e0b" }}>
                          {engine.prediction}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">w={engine.weight.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="w-full">
                  <div className="font-mono text-xs text-muted-foreground uppercase mb-2">Top Kandidat</div>
                  <div className="flex flex-wrap gap-2">
                    {pred.topCandidates?.slice(0, 8).map((c, i) => (
                      <div key={c.number} className={cn(
                        "font-mono text-sm px-3 py-1.5 rounded-sm border transition-colors",
                        i === 0
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border bg-secondary/20 text-muted-foreground"
                      )}>
                        {c.number}
                        <span className="text-[10px] ml-1 opacity-60">{c.score.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground font-mono">
                <Cpu className="w-10 h-10 opacity-20" />
                <div className="text-sm">Memuat prediksi...</div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border/50 pb-3 pt-4 px-4">
              <CardTitle className="font-mono text-xs uppercase">Adaptive Engine Weights</CardTitle>
            </CardHeader>
            <CardContent className="p-4 h-[180px]">
              {engineWeightData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={engineWeightData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 100]} stroke="#525252" tick={{ fontFamily: "monospace", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" stroke="#525252" tick={{ fontFamily: "monospace", fontSize: 10 }} width={70} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "Weight"]} />
                    <Bar dataKey="weight" radius={[0, 3, 3, 0]}>
                      {engineWeightData.map((e) => (
                        <Cell key={e.name} fill={ENGINE_COLORS[e.name.toLowerCase()] ?? "#f59e0b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs text-center">
                  Belum ada data akurasi untuk adaptive weights
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border/50 pb-3 pt-4 px-4">
              <CardTitle className="font-mono text-xs uppercase">Akurasi Engine</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {accuracy ? (
                <>
                  {[
                    { label: "Semua Waktu", value: accuracy.avgAccuracy },
                    { label: "7 Hari Terakhir", value: accuracy.avg7d },
                    { label: "30 Hari Terakhir", value: accuracy.avg30d },
                  ].map(stat => (
                    <div key={stat.label} className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">{stat.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-secondary/30 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${(stat.value ?? 0) * 100}%` }} />
                        </div>
                        <span className="font-mono text-xs text-primary">{((stat.value ?? 0) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-border/30">
                    <div className="font-mono text-xs text-muted-foreground">{accuracy.resolved}/{accuracy.total} resolved</div>
                  </div>
                </>
              ) : (
                <div className="font-mono text-xs text-muted-foreground">Memuat data akurasi...</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* History */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50 pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-sm uppercase">Riwayat Prediksi</CardTitle>
            {histLoading && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs text-left whitespace-nowrap">
              <thead className="bg-secondary/40 text-muted-foreground">
                <tr>
                  {["TANGGAL", "SESI", "PREDIKSI", "AKTUAL", "COCOK", "STATUS"].map(h => (
                    <th key={h} className="px-4 py-3 border-b border-border font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {histLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    ))}</tr>
                  ))
                ) : history.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Belum ada riwayat prediksi.
                  </td></tr>
                ) : history.map((record) => (
                  <tr key={record.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{record.date}</td>
                    <td className="px-4 py-3 text-muted-foreground">{record.period}</td>
                    <td className="px-4 py-3 text-primary font-bold tracking-wider">{record.prediction}</td>
                    <td className="px-4 py-3 text-foreground font-bold tracking-wider">
                      {record.actualResult ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {record.matchedDigits !== null && record.matchedDigits !== undefined ? (
                        <div className="flex gap-0.5">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className={cn("w-3 h-3 rounded-sm", i < (record.matchedDigits ?? 0) ? "bg-primary" : "bg-secondary/50")} />
                          ))}
                        </div>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
