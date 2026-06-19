import { useState } from "react";
import {
  useGetAdvancedAnalytics, getGetAdvancedAnalyticsQueryKey,
  useGetHeatmap, getGetHeatmapQueryKey,
  useGetMarkovChain, getGetMarkovChainQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { Activity, TrendingUp, TrendingDown, Hash } from "lucide-react";

const AMBER = "#f59e0b";
const AMBER_DIM = "#d97706";
const BLUE = "#3b82f6";
const RED = "#ef4444";
const GREEN = "#22c55e";
const MUTED = "#525252";

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="w-1 h-5 bg-primary rounded-full" />
      <div>
        <h2 className="font-mono text-sm font-bold uppercase tracking-wider">{title}</h2>
        {subtitle && <p className="font-mono text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { backgroundColor: "#0a0a0a", borderColor: "#262626", fontFamily: "monospace", fontSize: 12 },
  itemStyle: { color: AMBER },
  cursor: { fill: "#1a1a1a" },
};

type DigitEntry = { digit: string; count: number; percentage: number };

export default function Analytics() {
  const [year, setYear] = useState<2025 | 2026>(2026);

  const { data: adv, isLoading: advLoading, isError: advError } = useGetAdvancedAnalytics(
    { year },
    { query: { queryKey: getGetAdvancedAnalyticsQueryKey({ year }) } }
  );

  const { data: heatmap, isLoading: heatLoading, isError: heatError } = useGetHeatmap(
    { year },
    { query: { queryKey: getGetHeatmapQueryKey({ year }) } }
  );

  const { data: markov, isLoading: markovLoading, isError: markovError } = useGetMarkovChain(
    { year },
    { query: { queryKey: getGetMarkovChainQueryKey({ year }) } }
  );

  const hasError = advError || heatError || markovError;

  const digitChartData: DigitEntry[] = adv?.digitFrequency ?? [];
  const oddEvenData = adv?.oddEven
    ? [
        { name: "Odd (Ganjil)", value: adv.oddEven.odd, pct: adv.oddEven.oddPct },
        { name: "Even (Genap)", value: adv.oddEven.even, pct: adv.oddEven.evenPct },
      ]
    : [];
  const bigSmallData = adv?.bigSmall
    ? [
        { name: "Big (≥5000)", value: adv.bigSmall.big, pct: adv.bigSmall.bigPct },
        { name: "Small (<5000)", value: adv.bigSmall.small, pct: adv.bigSmall.smallPct },
      ]
    : [];

  const markovDigits = ["0","1","2","3","4","5","6","7","8","9"];

  if (hasError) {
    return (
      <div className="space-y-6 pb-20 md:pb-0">
        <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight">DATA ANALYTICS ENGINE</h1>
        <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-md flex items-center gap-3 font-mono">
          <span className="text-lg">⚠</span>
          <span>Gagal memuat data analytics. Pastikan server API berjalan dan coba refresh halaman.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight">DATA ANALYTICS ENGINE</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Advanced statistical analysis · Markov chain · Distribution metrics</p>
        </div>
        <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v, 10) as 2025 | 2026)}>
          <SelectTrigger className="w-[120px] font-mono bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="font-mono bg-card border-border">
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Draws", value: adv?.totalDraws?.toLocaleString() },
          { label: "Missing 4D Nums", value: adv?.totalMissingCount?.toLocaleString() },
          { label: "Odd Distribution", value: adv?.oddEven ? `${adv.oddEven.oddPct}%` : undefined },
          { label: "Big Distribution", value: adv?.bigSmall ? `${adv.bigSmall.bigPct}%` : undefined },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="font-mono text-xs text-muted-foreground uppercase mb-1">{kpi.label}</div>
              {advLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="font-mono text-2xl font-bold text-primary">{kpi.value ?? "—"}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Digit Frequency + Odd/Even + Big/Small */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader className="border-b border-border/50 pb-3">
            <SectionHeader title="Digit Frequency (0–9)" subtitle="Across all 4 positions" />
          </CardHeader>
          <CardContent className="p-4 h-[220px]">
            {advLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={digitChartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                  <XAxis dataKey="digit" stroke={MUTED} tick={{ fontFamily: "monospace", fontSize: 12 }} />
                  <YAxis stroke={MUTED} tick={{ fontFamily: "monospace", fontSize: 11 }} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: number, _name: string, props: { payload: DigitEntry }) =>
                      [`${value} (${props.payload.percentage}%)`, "Count"]
                    }
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {digitChartData.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? AMBER : AMBER_DIM} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-rows-2 gap-6">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border/50 pb-2 pt-3">
              <SectionHeader title="Odd / Even" />
            </CardHeader>
            <CardContent className="p-3 h-[130px]">
              {advLoading ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={oddEvenData} dataKey="value" cx="50%" cy="50%" outerRadius={50}
                      label={({ pct }: { pct: number }) => `${pct}%`} labelLine={false}>
                      <Cell fill={AMBER} />
                      <Cell fill={BLUE} />
                    </Pie>
                    <Legend formatter={(v) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{v}</span>} />
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border/50 pb-2 pt-3">
              <SectionHeader title="Big / Small" />
            </CardHeader>
            <CardContent className="p-3 h-[130px]">
              {advLoading ? <Skeleton className="w-full h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bigSmallData} dataKey="value" cx="50%" cy="50%" outerRadius={50}
                      label={({ pct }: { pct: number }) => `${pct}%`} labelLine={false}>
                      <Cell fill={RED} />
                      <Cell fill={GREEN} />
                    </Pie>
                    <Legend formatter={(v) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{v}</span>} />
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Position Heatmap */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50">
          <SectionHeader title="Position Heatmap" subtitle="Frequency of each digit (0-9) per position in the 4D number" />
        </CardHeader>
        <CardContent className="p-4 overflow-x-auto">
          {heatLoading ? (
            <Skeleton className="w-full h-48" />
          ) : heatmap ? (
            <table className="w-full font-mono text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 text-muted-foreground font-medium border-b border-border">DIGIT</th>
                  {heatmap.positions.map(p => (
                    <th key={p.position} className="text-center p-2 text-muted-foreground font-medium border-b border-border">
                      P{p.position}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }, (_, d) => {
                  const digit = String(d);
                  return (
                    <tr key={digit} className="border-b border-border/30">
                      <td className="p-2 text-primary font-bold">{digit}</td>
                      {heatmap.positions.map(pos => {
                        const entry = pos.digits.find(x => x.digit === digit);
                        const pctVal = entry?.pct ?? 0;
                        const intensity = Math.min(pctVal / 20, 1);
                        return (
                          <td key={pos.position} className="text-center p-2 relative">
                            <div
                              className="absolute inset-0 m-0.5 rounded-sm"
                              style={{ backgroundColor: `rgba(245,158,11,${intensity * 0.7})` }}
                            />
                            <span className="relative z-10 font-bold" style={{ color: intensity > 0.4 ? "#000" : "#f59e0b" }}>
                              {pctVal}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-muted-foreground font-mono text-sm p-4">No heatmap data available</div>
          )}
        </CardContent>
      </Card>

      {/* Hot, Cold, Gap, Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Hot Numbers */}
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-mono text-sm font-bold uppercase">Hot Numbers</span>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {advLoading ? <Skeleton className="w-full h-40" /> : (
              <div className="space-y-1">
                {adv?.hotNumbers?.slice(0, 10).map((n, i) => (
                  <div key={n.number} className="flex items-center gap-2 py-1 border-b border-border/20">
                    <span className="font-mono text-[10px] text-muted-foreground w-4">{i + 1}</span>
                    <span className="font-mono font-bold text-primary">{n.number}</span>
                    <div className="flex-1 bg-secondary/30 rounded-full h-1 overflow-hidden">
                      <div className="bg-primary h-1 rounded-full"
                        style={{ width: `${Math.min((n.count / (adv.hotNumbers[0]?.count ?? 1)) * 100, 100)}%` }} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{n.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cold Numbers */}
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-blue-400" />
              <span className="font-mono text-sm font-bold uppercase">Cold Numbers</span>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {advLoading ? <Skeleton className="w-full h-40" /> : (
              <div className="space-y-1">
                {adv?.coldNumbers?.slice(0, 10).map((n, i) => (
                  <div key={n.number} className="flex items-center gap-2 py-1 border-b border-border/20">
                    <span className="font-mono text-[10px] text-muted-foreground w-4">{i + 1}</span>
                    <span className="font-mono font-bold text-blue-400">{n.number}</span>
                    <div className="flex-1 bg-secondary/30 rounded-full h-1 overflow-hidden">
                      <div className="bg-blue-400 h-1 rounded-full"
                        style={{ width: `${Math.max((n.count / Math.max(adv.hotNumbers[0]?.count ?? 1, 1)) * 100, 2)}%` }} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{n.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gap Distribution */}
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-400" />
              <span className="font-mono text-sm font-bold uppercase">Gap (Overdue)</span>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {advLoading ? <Skeleton className="w-full h-40" /> : (
              <div className="space-y-1">
                {adv?.gapDistribution?.slice(0, 10).map((g, i) => (
                  <div key={g.number} className="flex items-center gap-2 py-1 border-b border-border/20">
                    <span className="font-mono text-[10px] text-muted-foreground w-4">{i + 1}</span>
                    <span className="font-mono font-bold text-orange-400">{g.number}</span>
                    <div className="flex-1 bg-secondary/30 rounded-full h-1 overflow-hidden">
                      <div className="bg-orange-400 h-1 rounded-full"
                        style={{ width: `${Math.min((g.gapDraws / Math.max(adv.gapDistribution[0]?.gapDraws ?? 1, 1)) * 100, 100)}%` }} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{g.gapDraws}d</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trend Numbers */}
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-green-400" />
              <span className="font-mono text-sm font-bold uppercase">Trending (30D)</span>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {advLoading ? <Skeleton className="w-full h-40" /> : (
              <div className="space-y-1">
                {adv?.trendNumbers?.slice(0, 10).map((n, i) => (
                  <div key={n.number} className="flex items-center gap-2 py-1 border-b border-border/20">
                    <span className="font-mono text-[10px] text-muted-foreground w-4">{i + 1}</span>
                    <span className="font-mono font-bold text-green-400">{n.number}</span>
                    <div className="flex-1 bg-secondary/30 rounded-full h-1 overflow-hidden">
                      <div className="bg-green-400 h-1 rounded-full"
                        style={{ width: `${Math.min((n.count / Math.max(adv.trendNumbers[0]?.count ?? 1, 1)) * 100, 100)}%` }} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{n.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pair Frequency + Markov Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50">
            <SectionHeader title="Top Pair Frequencies" subtitle="Most common consecutive digit pairs" />
          </CardHeader>
          <CardContent className="p-4 h-[220px]">
            {advLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adv?.pairFrequency?.slice(0, 20) ?? []} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                  <XAxis dataKey="pair" stroke={MUTED} tick={{ fontFamily: "monospace", fontSize: 10 }} />
                  <YAxis stroke={MUTED} tick={{ fontFamily: "monospace", fontSize: 10 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill={AMBER} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50">
            <SectionHeader title="Markov Transition Matrix" subtitle="Probability: last digit → first digit of next draw" />
          </CardHeader>
          <CardContent className="p-3 overflow-x-auto">
            {markovLoading ? <Skeleton className="w-full h-48" /> : markov ? (
              <table className="font-mono text-[10px] border-collapse w-full">
                <thead>
                  <tr>
                    <th className="p-1 text-muted-foreground border-b border-r border-border">→</th>
                    {markovDigits.map(d => (
                      <th key={d} className="p-1 text-center text-primary border-b border-border">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {markovDigits.map(from => (
                    <tr key={from} className="border-b border-border/20">
                      <td className="p-1 text-primary font-bold border-r border-border">{from}</td>
                      {markovDigits.map(to => {
                        const prob = markov.matrix?.[from]?.[to] ?? 0;
                        const intensity = Math.min(prob * 5, 1);
                        return (
                          <td key={to} className="p-1 text-center relative">
                            <div
                              className="absolute inset-0 m-0.5 rounded-sm"
                              style={{ backgroundColor: `rgba(245,158,11,${intensity * 0.8})` }}
                            />
                            <span className="relative z-10" style={{ color: intensity > 0.5 ? "#000" : "#737373" }}>
                              {(prob * 100).toFixed(0)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-muted-foreground font-mono text-sm p-4">No Markov data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Missing Numbers */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50">
          <SectionHeader
            title="Missing Numbers (Never Appeared)"
            subtitle={`${adv?.totalMissingCount?.toLocaleString() ?? "?"} 4D numbers that have never been drawn — showing first 200`}
          />
        </CardHeader>
        <CardContent className="p-4">
          {advLoading ? <Skeleton className="w-full h-24" /> : (
            <div className="flex flex-wrap gap-2">
              {adv?.missingNumbers?.map(n => (
                <span key={n} className="font-mono text-xs text-muted-foreground/50 bg-secondary/30 px-2 py-0.5 rounded-sm border border-border/30">{n}</span>
              ))}
              {(adv?.totalMissingCount ?? 0) > (adv?.missingNumbers?.length ?? 0) && (
                <span className="font-mono text-xs text-muted-foreground px-2 py-0.5">
                  +{((adv?.totalMissingCount ?? 0) - (adv?.missingNumbers?.length ?? 0)).toLocaleString()} more…
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
