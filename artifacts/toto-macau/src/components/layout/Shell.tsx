import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, BarChart3, Brain, Database, LayoutDashboard,
  FlaskConical, Sparkles, ClipboardList, X, Home,
  Zap, TrendingUp, AlignJustify, History, ChevronRight, CalendarDays, Bot, Cpu,
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
    shortName: "AI",
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
    shortName: "Riwayat",
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

// Primary 4 tabs shown in mobile bottom bar
const BOTTOM_TABS: NavItem[] = [
  navigation[0]!,
  navigation[1]!,
  navigation[7]!,
  navigation[3]!,
];

// "More" drawer items = everything not in bottom tabs
const DRAWER_ITEMS: NavItem[] = navigation.filter(
  (item) => !BOTTOM_TABS.includes(item)
);

// ─── Badge component ──────────────────────────────────────────────────────────

function NavBadge({ badge }: { badge: Badge }) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border leading-none",
      badge.className
    )}>
      {badge.label}
    </span>
  );
}

// ─── Section label in sidebar ─────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5 text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest first:pt-0">
      {label}
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

interface LayoutProps {
  children: React.ReactNode;
}

export function Shell({ children }: LayoutProps) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const currentPage = navigation.find((n) => n.href === location);

  // Group navigation by section for sidebar
  const sections = ["Overview", "Data", "Analitik", "Prediksi"] as const;
  const grouped = sections.map((section) => ({
    section,
    items: navigation.filter((n) => n.section === section),
  }));

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground dark">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-mono font-bold text-base leading-none text-foreground">DATA.TOTO</div>
            <div className="font-mono text-[10px] text-muted-foreground/50 mt-0.5">Macau 4D Analytics</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {grouped.map(({ section, items }) => (
            <div key={section}>
              <SectionLabel label={section} />
              {items.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md font-mono text-sm transition-all cursor-pointer group",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}>
                      <item.icon className={cn("w-4 h-4 shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                      <span className="flex-1 truncate">{item.name}</span>
                      {item.badge && <NavBadge badge={item.badge} />}
                      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/40 shrink-0">
          <div className="font-mono text-[10px] text-muted-foreground/30 uppercase tracking-wider">
            Data Engine v4.0 · 40 Engines
          </div>
        </div>
      </aside>

      {/* ── Mobile Top Header ───────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 h-14 border-b border-border bg-card flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-mono font-bold text-base text-foreground">DATA.TOTO</span>
        </div>
        {currentPage?.badge && (
          <NavBadge badge={currentPage.badge} />
        )}
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className="flex-1 md:pl-64 pt-14 md:pt-0 pb-20 md:pb-0">
        <main className="p-4 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Nav ───────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border safe-area-pb">
        <div className="flex items-stretch h-16">
          {BOTTOM_TABS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={cn(
                  "flex flex-col items-center justify-center h-full gap-1 transition-colors relative",
                  isActive ? "text-primary" : "text-muted-foreground/60"
                )}>
                  {isActive && (
                    <div className="absolute top-0 inset-x-4 h-0.5 bg-primary rounded-b-full" />
                  )}
                  <div className="relative">
                    <item.icon className="w-5 h-5" />
                    {item.badge && !isActive && (
                      <span className={cn(
                        "absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5 rounded text-[8px] font-bold font-mono flex items-center justify-center border",
                        item.badge.className
                      )}>
                        {item.badge.label.replace(" ★", "")}
                      </span>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-mono font-medium leading-none", isActive && "text-primary")}>
                    {item.shortName}
                  </span>
                </div>
              </Link>
            );
          })}

          {/* More button */}
          <button
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative",
              drawerOpen ? "text-primary" : "text-muted-foreground/60"
            )}
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            {drawerOpen && <div className="absolute top-0 inset-x-4 h-0.5 bg-primary rounded-b-full" />}
            <AlignJustify className="w-5 h-5" />
            <span className="text-[10px] font-mono font-medium leading-none">Menu</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile Drawer Overlay ────────────────────────────────────────── */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ── Mobile Drawer Panel ──────────────────────────────────────────── */}
      <div className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-[60] bg-card border-t border-border rounded-t-2xl transition-transform duration-300 ease-in-out",
        drawerOpen ? "translate-y-0" : "translate-y-full"
      )}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="font-mono text-sm font-bold text-foreground">Semua Menu</div>
          <button onClick={() => setDrawerOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer nav items */}
        <div className="px-3 py-3 pb-20 grid grid-cols-1 gap-1 max-h-[60vh] overflow-y-auto">
          {DRAWER_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-sm transition-all cursor-pointer",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    isActive ? "bg-primary/20" : "bg-secondary/60"
                  )}>
                    <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <span className="flex-1">{item.name}</span>
                  {item.badge && <NavBadge badge={item.badge} />}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-border/30">
          <div className="font-mono text-[10px] text-muted-foreground/30 text-center uppercase tracking-widest">
            Data Engine v4.0 · 40 Engines · Self-Learning
          </div>
        </div>
      </div>
    </div>
  );
}
