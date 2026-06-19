import { useGetLatestResults, getGetLatestResultsQueryKey } from "@workspace/api-client-react";
import { useGetLotteryStats, getGetLotteryStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SESSIONS = [
  { id: "s0001", label: "00:01 WIB" },
  { id: "s1300", label: "13:00 WIB" },
  { id: "s1600", label: "16:00 WIB" },
  { id: "s1900", label: "19:00 WIB" },
  { id: "s2200", label: "22:00 WIB" },
  { id: "s2300", label: "23:00 WIB" },
];

export default function Dashboard() {
  const { data: latest, isLoading: latestLoading, isError: latestError } = useGetLatestResults({
    query: { queryKey: getGetLatestResultsQueryKey() }
  });

  const { data: stats, isLoading: statsLoading } = useGetLotteryStats(
    { year: 2026 },
    { query: { queryKey: getGetLotteryStatsQueryKey({ year: 2026 }) } }
  );

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight">TERMINAL OVERVIEW</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Live market data for Toto Macau 4D</p>
        </div>
        <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-sm border border-border">
          <Clock className="w-4 h-4 text-primary" />
          <span className="font-mono text-xs text-muted-foreground uppercase">
            STATUS: <span className="text-primary font-bold">ONLINE</span>
          </span>
        </div>
      </div>

      {latestError ? (
        <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-md flex items-center gap-3 font-mono">
          <AlertCircle className="w-5 h-5" />
          <span>Failed to load terminal data. Connection error.</span>
        </div>
      ) : (
        <>
          {/* Today's Results */}
          <Card className="border-border bg-card shadow-lg">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  LATEST DRAW
                </CardTitle>
                <div className="font-mono text-sm text-muted-foreground bg-secondary px-2 py-1 rounded-sm">
                  {latestLoading ? <Skeleton className="h-4 w-24" /> : `${latest?.date} [${latest?.day}]`}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-border">
                {SESSIONS.map((session, index) => {
                  const resultObj = latest?.results.find(r => r.session === session.label);
                  const number = resultObj?.number;
                  const isPending = !number;
                  
                  return (
                    <div key={session.id} className="p-6 flex flex-col items-center justify-center gap-2 relative group hover:bg-secondary/20 transition-colors">
                      <div className="absolute top-2 left-2 text-[10px] font-mono text-muted-foreground">
                        [{String(index + 1).padStart(2, '0')}]
                      </div>
                      <span className="text-xs font-mono text-muted-foreground uppercase">{session.label}</span>
                      {latestLoading ? (
                        <Skeleton className="h-10 w-24 my-2" />
                      ) : (
                        <div className={cn(
                          "font-mono text-3xl md:text-4xl tracking-widest font-bold",
                          isPending ? "text-muted-foreground/30" : "text-primary drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                        )}>
                          {number || "----"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent 7 Days Table */}
            <Card className="lg:col-span-2 border-border bg-card">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="font-mono text-base uppercase">Market History (7D)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-sm text-left whitespace-nowrap">
                    <thead className="bg-secondary/50 text-muted-foreground text-xs">
                      <tr>
                        <th className="px-4 py-3 font-medium border-b border-border">DATE</th>
                        <th className="px-4 py-3 font-medium border-b border-border">00:01</th>
                        <th className="px-4 py-3 font-medium border-b border-border">13:00</th>
                        <th className="px-4 py-3 font-medium border-b border-border">16:00</th>
                        <th className="px-4 py-3 font-medium border-b border-border">19:00</th>
                        <th className="px-4 py-3 font-medium border-b border-border">22:00</th>
                        <th className="px-4 py-3 font-medium border-b border-border">23:00</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {latestLoading ? (
                        Array.from({ length: 7 }).map((_, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                          </tr>
                        ))
                      ) : (
                        latest?.recentDays?.map((day, i) => (
                          <tr key={i} className="hover:bg-secondary/30 transition-colors">
                            <td className="px-4 py-3 text-muted-foreground border-r border-border/50">{day.date.split(' ').slice(0, 2).join(' ')}</td>
                            <td className={cn("px-4 py-3", !day.s0001 && "text-muted-foreground/30")}>{day.s0001 || "-"}</td>
                            <td className={cn("px-4 py-3", !day.s1300 && "text-muted-foreground/30")}>{day.s1300 || "-"}</td>
                            <td className={cn("px-4 py-3", !day.s1600 && "text-muted-foreground/30")}>{day.s1600 || "-"}</td>
                            <td className={cn("px-4 py-3", !day.s1900 && "text-muted-foreground/30")}>{day.s1900 || "-"}</td>
                            <td className={cn("px-4 py-3", !day.s2200 && "text-muted-foreground/30")}>{day.s2200 || "-"}</td>
                            <td className={cn("px-4 py-3", !day.s2300 && "text-muted-foreground/30")}>{day.s2300 || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Market Indicators */}
            <Card className="border-border bg-card flex flex-col">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="font-mono text-base uppercase">Hot Indicators (2026)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col gap-4">
                <div>
                  <div className="text-xs font-mono text-muted-foreground mb-2">MOST FREQUENT DIGITS</div>
                  <div className="grid grid-cols-5 gap-2">
                    {statsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
                    ) : (
                      stats?.mostFrequent?.slice(0, 5).map((stat) => (
                        <div key={stat.number} className="bg-secondary border border-border flex flex-col items-center justify-center p-2 rounded-sm">
                          <span className="font-mono text-lg text-primary font-bold">{stat.number}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{stat.count}x</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-auto">
                  <div className="text-xs font-mono text-muted-foreground mb-2">TOTAL VOLUME</div>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <div className="font-mono text-3xl text-foreground">
                      {stats?.totalDraws.toLocaleString()} <span className="text-sm text-muted-foreground">DRAWS</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
