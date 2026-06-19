import { useGetLatestResults, getGetLatestResultsQueryKey } from "@workspace/api-client-react";
import { useGetLotteryStats, getGetLotteryStatsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, TrendingUp, AlertCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const SESSIONS = [
  { id: "s0001", label: "00:01" },
  { id: "s1300", label: "13:00" },
  { id: "s1600", label: "16:00" },
  { id: "s1900", label: "19:00" },
  { id: "s2200", label: "22:00" },
  { id: "s2300", label: "23:00" },
];

function SessionCard({
  label,
  number,
  index,
  loading,
}: {
  label: string;
  number?: string | null;
  index: number;
  loading: boolean;
}) {
  const isPending = !number;
  return (
    <div className={cn(
      "relative flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-xl border transition-all",
      isPending
        ? "bg-secondary/30 border-border/40"
        : "bg-card border-border hover:border-primary/30"
    )}>
      <div className="absolute top-2 left-2.5 text-[9px] font-mono text-muted-foreground/40">
        [{String(index + 1).padStart(2, "0")}]
      </div>
      <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider mt-1">
        {label} <span className="opacity-60">WIB</span>
      </span>
      {loading ? (
        <Skeleton className="h-8 w-16 my-1" />
      ) : (
        <div className={cn(
          "font-mono text-2xl sm:text-3xl tracking-[0.12em] font-bold leading-none",
          isPending
            ? "text-muted-foreground/20"
            : "text-primary number-glow"
        )}>
          {number ?? "----"}
        </div>
      )}
      {!isPending && !loading && (
        <div className="flex gap-0.5 mt-0.5">
          {number!.split("").map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/30" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: latest, isLoading: latestLoading, isError: latestError } = useGetLatestResults({
    query: { queryKey: getGetLatestResultsQueryKey() },
  });

  const { data: stats, isLoading: statsLoading } = useGetLotteryStats(
    { year: 2026 },
    { query: { queryKey: getGetLotteryStatsQueryKey({ year: 2026 }) } }
  );

  return (
    <div className="space-y-5 pb-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
            <Activity className="w-3 h-3 text-primary" />
            Live Terminal
          </div>
          <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight leading-tight">
            TERMINAL OVERVIEW
          </h1>
          <p className="text-muted-foreground font-mono text-xs mt-0.5">
            Live market data · Toto Macau 4D
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[10px] text-emerald-400 font-bold uppercase tracking-wide">
            ONLINE
          </span>
        </div>
      </div>

      {latestError && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-3.5 rounded-xl flex items-center gap-2.5 font-mono text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Gagal memuat data. Cek koneksi.</span>
        </div>
      )}

      {/* ── Latest Draw Card ────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-secondary/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-mono text-sm font-bold uppercase tracking-wide">Latest Draw</span>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary/60 px-2.5 py-1 rounded-lg border border-border/60">
            <Clock className="w-3 h-3 text-muted-foreground" />
            {latestLoading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                {latest?.date} [{latest?.day}]
              </span>
            )}
          </div>
        </div>

        {/* 3-col grid — readable on any phone */}
        <div className="p-3">
          <div className="grid grid-cols-3 gap-2">
            {SESSIONS.map((session, index) => {
              const resultObj = latest?.results.find(
                (r) => r.session === `${session.label} WIB`
              );
              return (
                <SessionCard
                  key={session.id}
                  label={session.label}
                  number={resultObj?.number}
                  index={index}
                  loading={latestLoading}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/prediksi-hari-ini">
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/25 rounded-xl p-3.5 cursor-pointer hover:bg-primary/15 transition-colors active:scale-[0.98]">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Clock className="w-[18px] h-[18px] text-primary" />
            </div>
            <div>
              <div className="font-mono text-xs font-bold text-primary">Prediksi Hari Ini</div>
              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">6 sesi draw</div>
            </div>
          </div>
        </Link>
        <Link href="/prediksi-v4">
          <div className="flex items-center gap-3 bg-secondary/60 border border-border rounded-xl p-3.5 cursor-pointer hover:bg-secondary/80 transition-colors active:scale-[0.98]">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-[18px] h-[18px] text-primary" />
            </div>
            <div>
              <div className="font-mono text-xs font-bold text-foreground">Prediksi V4</div>
              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">40 engines</div>
            </div>
          </div>
        </Link>
      </div>

      {/* ── Bottom: History + Indicators ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Market History — card list on mobile, table on desktop */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-secondary/20">
            <span className="font-mono text-sm font-bold uppercase tracking-wide">Market History (7D)</span>
          </div>

          {/* Mobile: horizontal swipe cards */}
          <div className="block md:hidden">
            <div className="flex gap-3 p-3 overflow-x-auto scroll-snap-x pb-4">
              {latestLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="scroll-snap-item shrink-0 w-44 bg-secondary/30 rounded-xl p-3 space-y-2">
                      <Skeleton className="h-3 w-20" />
                      {Array.from({ length: 6 }).map((_, j) => (
                        <Skeleton key={j} className="h-3.5 w-full" />
                      ))}
                    </div>
                  ))
                : latest?.recentDays?.map((day, i) => {
                    const rows = [
                      { label: "00:01", val: day.s0001 },
                      { label: "13:00", val: day.s1300 },
                      { label: "16:00", val: day.s1600 },
                      { label: "19:00", val: day.s1900 },
                      { label: "22:00", val: day.s2200 },
                      { label: "23:00", val: day.s2300 },
                    ];
                    return (
                      <div key={i} className="scroll-snap-item shrink-0 w-44 bg-secondary/30 border border-border/50 rounded-xl p-3">
                        <div className="font-mono text-[11px] text-primary font-bold mb-2.5 pb-2 border-b border-border/50">
                          {day.date.split(" ").slice(0, 2).join(" ")}
                        </div>
                        <div className="space-y-1.5">
                          {rows.map((s) => (
                            <div key={s.label} className="flex items-center justify-between">
                              <span className="font-mono text-[10px] text-muted-foreground">{s.label}</span>
                              <span className={cn(
                                "font-mono text-xs font-bold tracking-wider",
                                s.val ? "text-foreground" : "text-muted-foreground/30"
                              )}>
                                {s.val || "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full font-mono text-sm text-left">
              <thead className="bg-secondary/30 text-muted-foreground text-xs">
                <tr>
                  {["Date", "00:01", "13:00", "16:00", "19:00", "22:00", "23:00"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium border-b border-border/60">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {latestLoading
                  ? Array.from({ length: 7 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-12" /></td>
                        ))}
                      </tr>
                    ))
                  : latest?.recentDays?.map((day, i) => (
                      <tr key={i} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground font-medium border-r border-border/40 whitespace-nowrap">
                          {day.date.split(" ").slice(0, 2).join(" ")}
                        </td>
                        {[day.s0001, day.s1300, day.s1600, day.s1900, day.s2200, day.s2300].map((v, j) => (
                          <td key={j} className={cn(
                            "px-4 py-2.5 font-bold tracking-widest",
                            v ? "text-foreground" : "text-muted-foreground/25"
                          )}>
                            {v || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hot Indicators */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-secondary/20">
            <span className="font-mono text-sm font-bold uppercase tracking-wide">Hot Indicators (2026)</span>
          </div>
          <div className="p-4 space-y-5">
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2.5">
                Most Frequent
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {statsLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))
                  : stats?.mostFrequent?.slice(0, 5).map((stat, i) => (
                      <div key={stat.number} className={cn(
                        "flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border",
                        i === 0
                          ? "bg-primary/15 border-primary/30"
                          : "bg-secondary/50 border-border/60"
                      )}>
                        <span className={cn(
                          "font-mono text-xl font-bold leading-none",
                          i === 0 ? "text-primary number-glow" : "text-foreground"
                        )}>
                          {stat.number}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground mt-1">
                          {stat.count}x
                        </span>
                      </div>
                    ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2.5">
                Cold Numbers
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {statsLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))
                  : stats?.leastFrequent?.slice(0, 5).map((stat) => (
                      <div key={stat.number} className="flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border bg-secondary/30 border-border/40">
                        <span className="font-mono text-xl font-bold leading-none text-muted-foreground/60">
                          {stat.number}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground/50 mt-1">
                          {stat.count}x
                        </span>
                      </div>
                    ))}
              </div>
            </div>

            <div className="pt-3 border-t border-border/50">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
                Total Volume 2026
              </div>
              {statsLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-bold text-foreground">
                    {stats?.totalDraws?.toLocaleString()}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">DRAWS</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
