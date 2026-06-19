import { useState } from "react";
import { useGetLotteryStats, getGetLotteryStatsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { BarChart3, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Statistics() {
  const [year, setYear] = useState<2025 | 2026>(2026);

  const { data: stats, isLoading, isError } = useGetLotteryStats(
    { year },
    { query: { queryKey: getGetLotteryStatsQueryKey({ year }) } }
  );

  const digitChartData = stats?.digitFrequency
    ? Object.entries(stats.digitFrequency).map(([digit, count]) => ({ digit, count }))
    : [];

  if (isError) {
    return (
      <div className="space-y-5 pb-6">
        <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight">ANALYSIS & STATS</h1>
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-xl flex items-center gap-3 font-mono text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Gagal memuat statistik. Pastikan server API berjalan.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
            <BarChart3 className="w-3 h-3 text-primary" />
            Analitik Frekuensi
          </div>
          <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight">ANALYSIS & STATS</h1>
          <p className="text-muted-foreground font-mono text-xs mt-0.5">Frekuensi angka dan metrik probabilitas</p>
        </div>
        <Select
          value={year.toString()}
          onValueChange={(val) => setYear(parseInt(val, 10) as 2025 | 2026)}
        >
          <SelectTrigger className="w-[110px] font-mono bg-card border-border text-sm h-9 shrink-0">
            <SelectValue placeholder="Tahun" />
          </SelectTrigger>
          <SelectContent className="font-mono bg-card border-border">
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary stat + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total volume */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
            Total Volume {year}
          </div>
          {isLoading ? (
            <Skeleton className="h-12 w-32" />
          ) : (
            <>
              <div className="font-mono text-4xl sm:text-5xl font-bold text-foreground leading-none">
                {stats?.totalDraws.toLocaleString()}
              </div>
              <div className="font-mono text-xs text-muted-foreground mt-2 uppercase tracking-wide">
                Draw Diproses
              </div>
            </>
          )}
        </div>

        {/* Bar chart */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-secondary/20">
            <span className="font-mono text-sm font-bold uppercase tracking-wide">Distribusi Frekuensi Digit</span>
          </div>
          <div className="p-4 h-[220px] sm:h-[250px]">
            {isLoading ? (
              <Skeleton className="w-full h-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={digitChartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,14%)" vertical={false} />
                  <XAxis
                    dataKey="digit"
                    stroke="hsl(220,10%,45%)"
                    tick={{ fontFamily: 'Space Mono, monospace', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="hsl(220,10%,45%)"
                    tick={{ fontFamily: 'Space Mono, monospace', fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(222,15%,13%)' }}
                    contentStyle={{
                      backgroundColor: 'hsl(222,18%,8%)',
                      borderColor: 'hsl(222,15%,14%)',
                      fontFamily: 'Space Mono, monospace',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                    itemStyle={{ color: 'hsl(43,96%,56%)' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {digitChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "hsl(43,96%,56%)" : "hsl(43,90%,46%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Hot & Cold numbers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Hot numbers */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-secondary/20 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-mono text-sm font-bold uppercase tracking-wide text-primary">
              Hot Numbers (Top 20)
            </span>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-5 sm:grid-cols-5 gap-1.5">
              {isLoading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))
              ) : (
                stats?.mostFrequent?.slice(0, 20).map((stat, i) => (
                  <div key={stat.number} className={cn(
                    "flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all",
                    i === 0
                      ? "bg-primary/15 border-primary/30"
                      : i < 5
                      ? "bg-primary/5 border-primary/15"
                      : "bg-secondary/40 border-border/50"
                  )}>
                    <span className={cn(
                      "font-mono font-bold leading-none",
                      i === 0 ? "text-primary text-xl number-glow" : i < 5 ? "text-primary/80 text-lg" : "text-foreground text-base"
                    )}>
                      {stat.number}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground mt-1">{stat.count}x</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Cold numbers */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-secondary/20 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Cold Numbers (Bottom 20)
            </span>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-5 gap-1.5">
              {isLoading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))
              ) : (
                stats?.leastFrequent?.slice(0, 20).map((stat) => (
                  <div key={stat.number} className="flex flex-col items-center justify-center py-2.5 rounded-xl border bg-secondary/30 border-border/40">
                    <span className="font-mono text-base font-medium leading-none text-muted-foreground/60">
                      {stat.number}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/40 mt-1">{stat.count}x</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
