import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, BarChart3, Brain, Database, LayoutDashboard,
  FlaskConical, Sparkles, X,
  Zap, Bot, Cpu, History, CalendarDays, AlignJustify, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Badge {
  label: string;
  className: string;
}

interface NavItem {
  name: string;
  shortName: string;
  href: string;
  icon: React.ElementType;
  badge: Badge | null;
  section: string;
}

// ─── Navigation config ────────────────────────────────────────────────────────

const navigation: NavItem[] = [
  {
    name: "Dashboard",
    shortName: "Home",
    href: "/",
    icon: LayoutDashboard,
    badge: { label: "LIVE", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse-slow" },
    section: "Overview",
  },
  {
    name: "Data 2026",
    shortName: "2026",
    href: "/data/2026",
    icon: Database,
    badge: { label: "2026", className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
    section: "Data",
  },
  {
    name: "Data 2025",
    shortName: "2025",
    href: "/data/2025",
    icon: Database,
    badge: { label: "2025", className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
    section: "Data",
  },
  {
    name: "Statistik",
    shortName: "Statistik",
    href: "/statistik",
    icon: BarChart3,
    badge: { label: "FREQ", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    section: "Analitik",
  },
  {
    name: "Analytics",
    shortName: "Analitik",
    href: "/analytics",
    icon: FlaskConical,
    badge: { label: "ADV", className: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
    section: "Analitik",
  },
  {
    name: "Prediksi AI",
    shortName: "AI V1",
    href: "/prediksi",
    icon: Brain,
    badge: { label: "V1", className: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
    section: "Prediksi",
  },
  {
    name: "Prediksi V3",
    shortName: "V3",
    href: "/prediksi-v3",
    icon: Sparkles,
    badge: { label: "V3", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    section: "Prediksi",
  },
  {
    name: "Prediksi V4",
    shortName: "V4",
    href: "/prediksi-v4",
    icon: Zap,
    badge: { label: "V4 ★", className: "bg-primary/20 text-primary border-primary/30" },
    section: "Prediksi",
  },
  {
    name: "Riwayat V4",
    shortName: "Log V4",
    href: "/riwayat-v4",
    icon: History,
    badge: { label: "LOG", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    section: "Prediksi",
  },
  {
    name: "Prediksi Hari Ini",
    shortName: "Hari Ini",
    href: "/prediksi-hari-ini",
    icon: CalendarDays,
    badge: { label: "TODAY", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse-slow" },
    section: "Prediksi",
  },
  {
    name: "Prediksi V5",
    shortName: "V5",
    href: "/prediksi-v5",
    icon: Bot,
    badge: { label: "V5 ✦", className: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
    section: "Prediksi",
  },
  {
    name: "Riwayat V5",
    shortName: "Log V5",
    href: "/riwayat-v5",
    icon: History,
    badge: { label: "LOG", className: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
    section: "Prediksi",
  },
  {
    name: "Prediksi V6",
    shortName: "V6",
    href: "/prediksi-v6",
    icon: Cpu,
    badge: { label: "V6 ✦✦", className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
    section: "Prediksi",
  },
  {
    name: "Riwayat V6",
    shortName: "Log V6",
    href: "/riwayat-v6",
    icon: History,
    badge: { label: "LOG", className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
    section: "Prediksi",
  },
];

// Bottom tab bar — 4 key pages
const BOTTOM_TABS: NavItem[] = [
  navigation[0]!,  // Dashboard
  navigation[9]!,  // Hari Ini
  navigation[7]!,  // V4
  navigation[1]!,  // Data 2026
];

const DRAWER_ITEMS = navigation.filter((item) => !BOTTOM_TABS.includes(item));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NavBadge({ badge, small }: { badge: Badge; small?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border leading-none shrink-0",
      small && "px-1 text-[8px]",
      badge.className
    )}>
      {badge.label}
    </span>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5 text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest first:pt-2">
      {label}
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [location]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const currentPage = navigation.find((n) => n.href === location);

  const sections = ["Overview", "Data", "Analitik", "Prediksi"] as const;
  const grouped = sections.map((section) => ({
    section,
    items: navigation.filter((n) => n.section === section),
  }));

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground dark">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 z-50 w-60 border-r border-border/60 bg-sidebar">
        {/* Logo */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-border/60 shrink-0">
          <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <div className="font-mono font-bold text-sm leading-none text-foreground tracking-wide">DATA.TOTO</div>
            <div className="font-mono text-[9px] text-muted-foreground/50 mt-0.5 tracking-wider">MACAU 4D ANALYTICS</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {grouped.map(({ section, items }) => (
            <div key={section}>
              <SectionLabel label={section} />
              {items.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-md font-mono text-sm transition-all cursor-pointer group",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                    )}>
                      <item.icon className={cn("w-4 h-4 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground/50 group-hover:text-foreground")} />
                      <span className="flex-1 truncate text-[13px]">{item.name}</span>
                      {item.badge && <NavBadge badge={item.badge} />}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/40 shrink-0">
          <div className="font-mono text-[9px] text-muted-foreground/25 uppercase tracking-wider">
            Data Engine v4.0 · 40 Engines
          </div>
        </div>
      </aside>

      {/* ── Mobile Top Header ───────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 h-14 border-b border-border/60 bg-sidebar/95 backdrop-blur-md flex items-center justify-between px-4 safe-area-pt">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Activity className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            {currentPage && location !== "/" ? (
              <>
                <div className="font-mono font-bold text-sm leading-tight text-foreground truncate">
                  {currentPage.name}
                </div>
                <div className="font-mono text-[9px] text-muted-foreground/50 tracking-wider">DATA.TOTO</div>
              </>
            ) : (
              <>
                <div className="font-mono font-bold text-sm leading-none text-foreground tracking-wide">DATA.TOTO</div>
                <div className="font-mono text-[9px] text-muted-foreground/50 mt-0.5 tracking-wider">MACAU 4D ANALYTICS</div>
              </>
            )}
          </div>
        </div>
        {currentPage?.badge && <NavBadge badge={currentPage.badge} />}
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className="flex-1 md:pl-60 pt-14 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <main className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Nav ───────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-sidebar/95 backdrop-blur-md border-t border-border/60 safe-area-pb">
        <div className="flex items-stretch h-[58px]">
          {BOTTOM_TABS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={cn(
                  "flex flex-col items-center justify-center h-full gap-1 transition-colors relative px-1",
                  isActive ? "text-primary" : "text-muted-foreground/50"
                )}>
                  {isActive && (
                    <div className="absolute top-0 inset-x-3 h-[2px] bg-primary rounded-b-full" />
                  )}
                  <item.icon className={cn("w-[22px] h-[22px] transition-transform", isActive && "scale-110")} />
                  <span className={cn("text-[10px] font-mono font-medium leading-none",
                    isActive ? "text-primary" : "text-muted-foreground/50"
                  )}>
                    {item.shortName}
                  </span>
                </div>
              </Link>
            );
          })}

          {/* More button */}
          <button
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative px-1",
              drawerOpen ? "text-primary" : "text-muted-foreground/50"
            )}
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            {drawerOpen && <div className="absolute top-0 inset-x-3 h-[2px] bg-primary rounded-b-full" />}
            <AlignJustify className={cn("w-[22px] h-[22px] transition-transform", drawerOpen && "scale-110")} />
            <span className={cn("text-[10px] font-mono font-medium leading-none",
              drawerOpen ? "text-primary" : "text-muted-foreground/50"
            )}>Menu</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile Drawer Overlay ────────────────────────────────────────── */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm transition-opacity duration-200",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ── Mobile Drawer Panel ──────────────────────────────────────────── */}
      <div className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-[60] bg-sidebar border-t border-border/60 rounded-t-2xl transition-transform duration-300 ease-out",
        drawerOpen ? "translate-y-0" : "translate-y-full"
      )}>
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/50">
          <div className="font-mono text-sm font-bold text-foreground">Semua Menu</div>
          <button onClick={() => setDrawerOpen(false)}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Items in a 2-column grid */}
        <div className="px-4 py-3 pb-8 max-h-[70vh] overflow-y-auto">
          {(["Data", "Analitik", "Prediksi"] as const).map((section) => {
            const items = DRAWER_ITEMS.filter((i) => i.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="mb-4">
                <div className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest px-1 mb-2">
                  {section}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <Link key={item.href} href={item.href}>
                        <div className={cn(
                          "flex items-center gap-2.5 px-3 py-3 rounded-xl font-mono text-sm transition-all cursor-pointer",
                          isActive
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"
                        )}>
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            isActive ? "bg-primary/20" : "bg-secondary/80"
                          )}>
                            <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground/70")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium leading-tight truncate">{item.name}</div>
                            {item.badge && (
                              <div className="mt-0.5">
                                <NavBadge badge={item.badge} small />
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
