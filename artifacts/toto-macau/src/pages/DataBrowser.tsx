import { Fragment, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetLotteryData, getGetLotteryDataQueryKey } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

const SESSIONS = [
  { id: "s0001", label: "00:01" },
  { id: "s1300", label: "13:00" },
  { id: "s1600", label: "16:00" },
  { id: "s1900", label: "19:00" },
  { id: "s2200", label: "22:00" },
  { id: "s2300", label: "23:00" },
];

const SESSION_KEYS = ["s0001", "s1300", "s1600", "s1900", "s2200", "s2300"] as const;

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

  const totalRows = filteredMonths.reduce((acc, m) => acc + m.results.length, 0);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
            <Database className="w-3 h-3 text-primary" />
            Arsip Data
          </div>
          <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight">DATA LEDGER</h1>
          <p className="text-muted-foreground font-mono text-xs mt-0.5">
            Riwayat lengkap draw Toto Macau {year}
          </p>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-1.5 bg-secondary/50 px-2.5 py-1.5 rounded-lg border border-border/60 shrink-0">
            <span className="font-mono text-[10px] text-muted-foreground">
              {totalRows.toLocaleString()} rows
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={year.toString()} onValueChange={(val) => setLocation(`/data/${val}`)}>
          <SelectTrigger className="w-[110px] font-mono bg-card border-border text-sm h-9">
            <SelectValue placeholder="Tahun" />
          </SelectTrigger>
          <SelectContent className="font-mono bg-card border-border">
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[150px] font-mono bg-card border-border text-sm h-9">
            <SelectValue placeholder="Semua Bulan" />
          </SelectTrigger>
          <SelectContent className="font-mono bg-card border-border">
            <SelectItem value="all">SEMUA BULAN</SelectItem>
            {months.map(m => (
              <SelectItem key={m.monthNumber} value={m.monthNumber.toString()}>
                {m.month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Data table — horizontally scrollable on mobile */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full font-mono text-sm text-left">
            <thead className="bg-secondary/40 border-b border-border text-muted-foreground text-xs uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-3 sm:px-4 py-3 font-medium border-r border-border/50 whitespace-nowrap">
                  Tanggal
                </th>
                <th className="px-3 sm:px-4 py-3 font-medium border-r border-border/50 hidden sm:table-cell">
                  Hari
                </th>
                {SESSIONS.map(session => (
                  <th key={session.id} className="px-2 sm:px-3 py-3 font-medium text-center whitespace-nowrap">
                    {session.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 sm:px-4 py-2.5 border-r border-border/40">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 border-r border-border/40 hidden sm:table-cell">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    {SESSIONS.map((s) => (
                      <td key={s.id} className="px-2 sm:px-3 py-2.5 text-center">
                        <Skeleton className="h-4 w-10 mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredMonths.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-muted-foreground font-mono text-sm">
                    Tidak ada data untuk filter ini.
                  </td>
                </tr>
              ) : (
                filteredMonths.flatMap(month => [
                  <tr key={`month-${month.monthNumber}`} className="bg-primary/5 border-y border-primary/15">
                    <td colSpan={8} className="px-3 sm:px-4 py-2 font-bold text-primary text-xs tracking-wider">
                      ◈ {month.month.toUpperCase()} {month.year}
                      <span className="ml-2 text-primary/40 font-normal font-mono">
                        [{month.results.length} draws]
                      </span>
                    </td>
                  </tr>,
                  ...month.results.map((result, i) => (
                    <Fragment key={`${month.monthNumber}-${i}`}>
                      <tr className="hover:bg-secondary/30 transition-colors">
                        <td className="px-3 sm:px-4 py-2.5 border-r border-border/40 text-muted-foreground whitespace-nowrap text-xs sm:text-sm">
                          {result.date}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 border-r border-border/40 text-muted-foreground/60 text-xs hidden sm:table-cell">
                          {result.day}
                        </td>
                        {SESSION_KEYS.map((key) => {
                          const val = result[key];
                          return (
                            <td key={key} className={cn(
                              "px-2 sm:px-3 py-2.5 text-center tracking-wider font-bold text-xs sm:text-sm",
                              val ? "text-foreground" : "text-muted-foreground/20"
                            )}>
                              {val || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  )),
                ])
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
