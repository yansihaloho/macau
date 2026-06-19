import { Fragment, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetLotteryData, getGetLotteryDataQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SESSIONS = [
  { id: "s0001", label: "00:01" },
  { id: "s1300", label: "13:00" },
  { id: "s1600", label: "16:00" },
  { id: "s1900", label: "19:00" },
  { id: "s2200", label: "22:00" },
  { id: "s2300", label: "23:00" },
];

export default function DataBrowser() {
  const [match, params] = useRoute("/data/:year");
  const [, setLocation] = useLocation();
  const yearParam = match && params?.year ? parseInt(params.year, 10) : 2026;
  const year = (yearParam === 2025 || yearParam === 2026) ? yearParam : 2026;

  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const { data, isLoading } = useGetLotteryData(
    { year: year as 2025 | 2026 },
    { query: { queryKey: getGetLotteryDataQueryKey({ year: year as 2025 | 2026 }) } }
  );

  const months = data?.months ?? [];
  const filteredMonths = selectedMonth === "all"
    ? months
    : months.filter(m => m.monthNumber.toString() === selectedMonth);

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight">DATA LEDGER</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Full historical draw data for {year}</p>
        </div>

        <div className="flex gap-2">
          <Select value={year.toString()} onValueChange={(val) => setLocation(`/data/${val}`)}>
            <SelectTrigger className="w-[120px] font-mono bg-card border-border">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="font-mono bg-card border-border">
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px] font-mono bg-card border-border">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent className="font-mono bg-card border-border">
              <SelectItem value="all">ALL MONTHS</SelectItem>
              {months.map(m => (
                <SelectItem key={m.monthNumber} value={m.monthNumber.toString()}>
                  {m.month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-border bg-card overflow-hidden rounded-md">
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm text-left whitespace-nowrap">
            <thead className="bg-secondary border-b border-border text-muted-foreground text-xs uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium border-r border-border w-32">Date</th>
                <th className="px-4 py-3 font-medium border-r border-border w-24">Day</th>
                {SESSIONS.map(session => (
                  <th key={session.id} className="px-4 py-3 font-medium text-center">{session.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="hover:bg-secondary/20">
                    <td className="px-4 py-3 border-r border-border"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3 border-r border-border"><Skeleton className="h-4 w-16" /></td>
                    {SESSIONS.map((s) => (
                      <td key={s.id} className="px-4 py-3 text-center"><Skeleton className="h-4 w-12 mx-auto" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredMonths.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground font-mono">
                    No data available for this selection
                  </td>
                </tr>
              ) : (
                filteredMonths.flatMap(month => [
                  <tr key={`month-${month.monthNumber}`} className="bg-primary/5">
                    <td colSpan={8} className="px-4 py-2 font-bold text-primary border-y border-primary/20 text-xs">
                      [ {month.month} {month.year} ]
                    </td>
                  </tr>,
                  ...month.results.map((result, i) => (
                    <tr key={`${month.monthNumber}-${i}`} className="hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-2 border-r border-border text-muted-foreground">{result.date}</td>
                      <td className="px-4 py-2 border-r border-border text-muted-foreground/70">{result.day}</td>
                      <td className={cn("px-4 py-2 text-center tracking-wider", !result.s0001 ? "text-muted-foreground/20" : "text-foreground font-medium")}>{result.s0001 || "-"}</td>
                      <td className={cn("px-4 py-2 text-center tracking-wider", !result.s1300 ? "text-muted-foreground/20" : "text-foreground font-medium")}>{result.s1300 || "-"}</td>
                      <td className={cn("px-4 py-2 text-center tracking-wider", !result.s1600 ? "text-muted-foreground/20" : "text-foreground font-medium")}>{result.s1600 || "-"}</td>
                      <td className={cn("px-4 py-2 text-center tracking-wider", !result.s1900 ? "text-muted-foreground/20" : "text-foreground font-medium")}>{result.s1900 || "-"}</td>
                      <td className={cn("px-4 py-2 text-center tracking-wider", !result.s2200 ? "text-muted-foreground/20" : "text-foreground font-medium")}>{result.s2200 || "-"}</td>
                      <td className={cn("px-4 py-2 text-center tracking-wider", !result.s2300 ? "text-muted-foreground/20" : "text-foreground font-medium")}>{result.s2300 || "-"}</td>
                    </tr>
                  )),
                ])
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
