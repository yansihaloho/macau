import { useState } from "react";
import { useGetLotteryStats, getGetLotteryStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function Statistics() {
  const [year, setYear] = useState<2025 | 2026>(2026);

  const { data: stats, isLoading, isError } = useGetLotteryStats(
    { year },
    { query: { queryKey: getGetLotteryStatsQueryKey({ year }) } }
  );

  const digitChartData = stats?.digitFrequency 
    ? Object.entries(stats.digitFrequency).map(([digit, count]) => ({
        digit,
        count
      }))
    : [];

  if (isError) {
    return (
      <div className="space-y-6 pb-20 md:pb-0">
        <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight">ANALYSIS & STATS</h1>
        <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-md flex items-center gap-3 font-mono">
          <span className="text-lg">⚠</span>
          <span>Gagal memuat data statistik. Pastikan server API berjalan dan coba refresh halaman.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight">ANALYSIS & STATS</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Number frequency and probability metrics</p>
        </div>
        
        <Select 
          value={year.toString()} 
          onValueChange={(val) => setYear(parseInt(val, 10) as 2025 | 2026)}
        >
          <SelectTrigger className="w-[120px] font-mono bg-card border-border">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent className="font-mono bg-card border-border">
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="font-mono text-base text-muted-foreground uppercase">Total Volume</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <Skeleton className="h-12 w-32" />
            ) : (
              <div className="font-mono text-5xl font-bold text-foreground">
                {stats?.totalDraws.toLocaleString()}
                <div className="text-sm font-normal text-muted-foreground mt-2 uppercase">Processed Draws</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card md:col-span-2">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="font-mono text-base uppercase">Digit Frequency Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-6 h-[250px]">
            {isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={digitChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis dataKey="digit" stroke="#737373" tick={{ fontFamily: 'monospace', fontSize: 12 }} />
                  <YAxis stroke="#737373" tick={{ fontFamily: 'monospace', fontSize: 12 }} />
                  <Tooltip 
                    cursor={{ fill: '#262626' }}
                    contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', fontFamily: 'monospace' }}
                    itemStyle={{ color: '#f59e0b' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {digitChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#f59e0b" : "#d97706"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="font-mono text-base text-primary uppercase flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              Hot Numbers (Top 20)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-4 sm:grid-cols-5 divide-x divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="p-3 flex flex-col items-center justify-center">
                    <Skeleton className="h-6 w-10 mb-1" />
                    <Skeleton className="h-3 w-6" />
                  </div>
                ))
              ) : (
                stats?.mostFrequent?.slice(0, 20).map((stat) => (
                  <div key={stat.number} className="p-3 flex flex-col items-center justify-center hover:bg-secondary/50 transition-colors">
                    <span className="font-mono text-lg font-bold text-foreground">{stat.number}</span>
                    <span className="font-mono text-xs text-primary">{stat.count}x</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="font-mono text-base text-muted-foreground uppercase flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
              Cold Numbers (Bottom 20)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-4 sm:grid-cols-5 divide-x divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="p-3 flex flex-col items-center justify-center">
                    <Skeleton className="h-6 w-10 mb-1" />
                    <Skeleton className="h-3 w-6" />
                  </div>
                ))
              ) : (
                stats?.leastFrequent?.slice(0, 20).map((stat) => (
                  <div key={stat.number} className="p-3 flex flex-col items-center justify-center hover:bg-secondary/50 transition-colors">
                    <span className="font-mono text-lg font-medium text-muted-foreground">{stat.number}</span>
                    <span className="font-mono text-xs text-muted-foreground/50">{stat.count}x</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
