"use client";

// Public, login-free Impact Dashboard — the transparency showcase (CLAUDE.md
// §2: "radical public transparency"). Reads the live corpus + the Watchtower's
// server-written intelligence collections. Build-safe: no Gemini/SDK import.
// Light-theme locked to match the rest of the app (globals.css).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  Activity,
  CircleCheck,
  CircleDot,
  TrendingUp,
  Layers,
  Users,
  MapPin,
  Crosshair,
  ScrollText,
  ShieldCheck,
  RotateCw,
} from "lucide-react";
import {
  getAllIssues,
  getProblemZones,
  getPredictedHotspots,
  getLatestReport,
  haversineDistance,
  type WeeklyCivicReport,
} from "@/lib/firebaseHelpers";
import { useLocationContext } from "@/contexts/LocationContext";
import { CityPicker } from "@/components/CityPicker";
import { CATEGORY_EMOJIS, CATEGORY_LABELS } from "@/lib/constants";
import type { City } from "@/lib/city";
import type { Issue, IssueCategory, ProblemZone, PredictedHotspot } from "@/types";

// Match the home feed: everything is scoped to within this radius of the city center.
const CITY_RADIUS_M = 65_000;

// ─── helpers ─────────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeAgo(d?: Date): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const RISK_COLORS: Record<string, string> = {
  low: "#16a34a",
  medium: "#f59e0b",
  high: "#dc2626",
};

// ─── motion ──────────────────────────────────────────────────────────────────

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}

// ─── data hook ───────────────────────────────────────────────────────────────

interface DashboardData {
  issues: Issue[];
  zones: ProblemZone[];
  hotspots: PredictedHotspot[];
  report: WeeklyCivicReport | null;
}

function useDashboardData(cityName?: string) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!cityName) return; // wait until we know which city we're showing
    let alive = true;
    Promise.all([
      getAllIssues(),
      getProblemZones(),
      getPredictedHotspots(),
      getLatestReport(cityName), // report scoped to this city only
    ])
      .then(([issues, zones, hotspots, report]) => {
        if (alive) setData({ issues, zones, hotspots, report });
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [nonce, cityName]);

  // Reset to the loading state here (event handler), not in the effect, so the
  // effect never calls setState synchronously.
  function refresh() {
    setData(null);
    setError(null);
    setNonce((n) => n + 1);
  }

  return { data, error, refresh };
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Phase 1 location model: the dashboard reflects the city currently being
  // viewed (home, or another city while exploring).
  const { activeCity, needsCityPrompt, pickHomeCity } = useLocationContext();
  const { data, error, refresh } = useDashboardData(activeCity?.cityName);

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-24 pt-6 md:px-8">
        <TopBar />

        {error && <ErrorBlock message={error} onRetry={refresh} />}
        {!error && needsCityPrompt && <CityGate onPick={pickHomeCity} />}
        {!error && !needsCityPrompt && !activeCity && <LoadingState />}
        {!error && activeCity && !data && <LoadingState />}
        {!error && activeCity && data && <Dashboard data={data} city={activeCity} />}
      </div>
    </div>
  );
}

// Public dashboard with no city chosen yet → ask for one (same source the feed
// uses; persists to the user doc when logged in, else the fixit_city cookie).
function CityGate({ onPick }: { onPick: (city: City) => void }) {
  return (
    <div className="mx-auto mt-16 max-w-lg">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        FixIt · Impact
      </p>
      <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground">
        Which city&apos;s record do you want to see?
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The Impact Dashboard is scoped to one city. Pick yours to see what was
        reported there, and what got fixed.
      </p>
      <div className="mt-5">
        <CityPicker onPick={onPick} />
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="flex items-center justify-between">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm font-semibold text-foreground shadow-card transition active:scale-95"
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        Feed
      </Link>
      <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-xs font-semibold text-muted shadow-card">
        <ShieldCheck size={14} strokeWidth={2.2} className="text-primary" />
        Public record
      </span>
    </header>
  );
}

function Dashboard({ data, city }: { data: DashboardData; city: City }) {
  // Scope strictly to this city. Issues and forecasts match cityName exactly
  // (so we never borrow another city's data); zones carry only coordinates, so
  // they fall back to a 65km geo-fence around the city center.
  const inCity = (lat: number, lng: number) =>
    haversineDistance(city.cityLat, city.cityLng, lat, lng) <= CITY_RADIUS_M;

  const issues = useMemo(
    () => data.issues.filter((i) => i.cityName === city.cityName),
    [data.issues, city],
  );
  const zones = useMemo(
    () => data.zones.filter((z) => inCity(z.centerLat, z.centerLng)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.zones, city],
  );
  const hotspots = useMemo(
    () => data.hotspots.filter((h) => h.cityName === city.cityName),
    [data.hotspots, city],
  );
  const report = data.report;

  const stats = useMemo(() => {
    const total = issues.length;
    const resolved = issues.filter((i) => i.status === "resolved").length;
    const open = total - resolved;
    const verified = issues.filter(
      (i) => i.status !== "reported" && i.status !== "resolved",
    ).length;
    const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const catCounts = new Map<IssueCategory, number>();
    for (const i of issues) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1);
    const categories = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);
    const catMax = categories[0]?.[1] ?? 1;

    // Public leaderboard: anonymous reports are counted toward the totals above
    // but NEVER credited by name here (Part 2 anonymity is a public-display rule).
    const contribTally = new Map<string, number>();
    for (const i of issues) {
      if (i.isAnonymous) continue;
      const name = i.reporterName?.trim();
      if (!name || name === "You") continue;
      contribTally.set(name, (contribTally.get(name) ?? 0) + 1);
    }
    const contributors = [...contribTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return { total, resolved, open, verified, rate, categories, catMax, contributors };
  }, [issues]);

  return (
    <div className="space-y-12">
      {/* title band */}
      <Reveal className="pt-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          FixIt · Impact · {city.cityName}
        </p>
        <h1 className="mt-2 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground md:text-6xl">
          What {city.cityName} reported, and what got fixed.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Every report, verification and resolution in {city.cityName} is a public
          record. No login, no edits, nothing hidden. This is the accountability layer.
        </p>
      </Reveal>

      <KpiRow stats={stats} />

      <ResolutionRace
        resolved={stats.resolved}
        open={stats.open}
        rate={stats.rate}
        total={stats.total}
      />

      <CategoryBreakdown categories={stats.categories} max={stats.catMax} />

      <Contributors contributors={stats.contributors} />

      <ProblemZonesSection zones={zones} />

      <HotspotsSection hotspots={hotspots} />

      <WeeklyReportSection report={report} cityName={city.cityName} />
    </div>
  );
}

// ─── KPI row ─────────────────────────────────────────────────────────────────

function KpiRow({
  stats,
}: {
  stats: { total: number; resolved: number; open: number; verified: number };
}) {
  const items = [
    { label: "Total reported", value: stats.total, icon: Activity, tone: "text-primary" },
    { label: "Resolved", value: stats.resolved, icon: CircleCheck, tone: "text-[#16a34a]" },
    { label: "Still open", value: stats.open, icon: CircleDot, tone: "text-[#ea580c]" },
    { label: "In the pipeline", value: stats.verified, icon: TrendingUp, tone: "text-primary" },
  ];
  return (
    <Reveal>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200/70 overflow-hidden rounded-2xl bg-surface shadow-card md:grid-cols-4 md:divide-y-0">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} className="p-6 md:p-7">
              <Icon size={20} strokeWidth={2.2} className={it.tone} />
              <p className="mt-4 font-display text-4xl font-extrabold tabular-nums text-foreground md:text-5xl">
                {it.value}
              </p>
              <p className="mt-1 text-sm font-medium text-muted">{it.label}</p>
            </div>
          );
        })}
      </div>
    </Reveal>
  );
}

// ─── resolution race ─────────────────────────────────────────────────────────

function ResolutionRace({
  resolved,
  open,
  rate,
  total,
}: {
  resolved: number;
  open: number;
  rate: number;
  total: number;
}) {
  const reduce = useReducedMotion();
  return (
    <Reveal>
      <div className="rounded-2xl bg-surface p-6 shadow-card md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              The resolution race
            </h2>
            <p className="mt-1 text-sm text-muted">
              How much of everything reported has actually been fixed.
            </p>
          </div>
          <p className="font-display text-5xl font-extrabold tabular-nums text-foreground">
            {rate}
            <span className="text-2xl text-muted">%</span>
          </p>
        </div>

        <div className="mt-6 flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className="h-full rounded-l-full bg-[#16a34a]"
            initial={reduce ? false : { width: 0 }}
            whileInView={{ width: `${total > 0 ? (resolved / total) * 100 : 0}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="mt-3 flex items-center gap-5 text-sm">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
            {resolved} resolved
          </span>
          <span className="flex items-center gap-2 font-medium text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            {open} still open
          </span>
        </div>
      </div>
    </Reveal>
  );
}

// ─── category breakdown ──────────────────────────────────────────────────────

function CategoryBreakdown({
  categories,
  max,
}: {
  categories: [IssueCategory, number][];
  max: number;
}) {
  const reduce = useReducedMotion();
  return (
    <Reveal>
      <SectionHeading icon={Layers} title="Where the problems are" />
      {categories.length === 0 ? (
        <EmptyNote>No issues reported yet.</EmptyNote>
      ) : (
        <div className="space-y-3.5">
          {categories.map(([cat, count], i) => (
            <div key={cat} className="flex items-center gap-3">
              <div className="flex w-44 shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
                <span className="text-base" aria-hidden>
                  {CATEGORY_EMOJIS[cat]}
                </span>
                <span className="truncate">{CATEGORY_LABELS[cat]}</span>
              </div>
              <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                <motion.div
                  className="flex h-full items-center justify-end rounded-lg bg-primary/85 pr-2.5"
                  initial={reduce ? false : { width: 0 }}
                  whileInView={{ width: `${Math.max((count / max) * 100, 8)}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="font-mono text-xs font-bold text-white tabular-nums">
                    {count}
                  </span>
                </motion.div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Reveal>
  );
}

// ─── contributors ────────────────────────────────────────────────────────────

function Contributors({ contributors }: { contributors: [string, number][] }) {
  return (
    <Reveal>
      <SectionHeading
        icon={Users}
        title="The people doing the watching"
        subtitle="Ranked by reports filed. Anonymous reports stay anonymous."
      />
      {contributors.length === 0 ? (
        <EmptyNote>No named contributors yet.</EmptyNote>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {contributors.map(([name, count], i) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card"
            >
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {initialsOf(name)}
                {i === 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-attention text-[10px] font-extrabold text-white ring-2 ring-surface">
                    1
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                <p className="font-mono text-xs text-muted tabular-nums">
                  {count} {count === 1 ? "report" : "reports"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Reveal>
  );
}

// ─── problem zones ───────────────────────────────────────────────────────────

function ProblemZonesSection({ zones }: { zones: ProblemZone[] }) {
  return (
    <Reveal>
      <SectionHeading
        icon={MapPin}
        title="Problem zones"
        subtitle="Clusters the Watchtower agent flagged, with its read on the shared root cause."
      />
      {zones.length === 0 ? (
        <EmptyNote>
          No zones detected yet. The Watchtower forms these when several open issues
          pile up within ~200m.
        </EmptyNote>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {zones.map((z) => (
            <div key={z.id} className="rounded-2xl bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <span className="text-lg" aria-hidden>
                    {CATEGORY_EMOJIS[z.primaryCategory]}
                  </span>
                  {CATEGORY_LABELS[z.primaryCategory]}
                  {z.secondaryCategory && (
                    <span className="font-medium text-muted">
                      + {CATEGORY_LABELS[z.secondaryCategory]}
                    </span>
                  )}
                </span>
                <PressurePill value={z.combinedPressure} />
              </div>
              {z.aiAnalysis && (
                <p className="mt-3 border-l-2 border-primary/30 pl-3 text-sm leading-relaxed text-foreground/80">
                  {z.aiAnalysis}
                </p>
              )}
              <p className="mt-3 font-mono text-xs text-muted tabular-nums">
                {z.issueIds.length} issues · {z.centerLat.toFixed(3)}, {z.centerLng.toFixed(3)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Reveal>
  );
}

function PressurePill({ value }: { value: number }) {
  const color = value >= 80 ? "#dc2626" : value >= 60 ? "#ea580c" : value >= 30 ? "#ca8a04" : "#16a34a";
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-bold tabular-nums"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {value} pressure
    </span>
  );
}

// ─── predicted hotspots ──────────────────────────────────────────────────────

function HotspotsSection({ hotspots }: { hotspots: PredictedHotspot[] }) {
  return (
    <Reveal>
      <SectionHeading
        icon={Crosshair}
        title="Where trouble is heading next"
        subtitle="The agent's forecast of areas likely to see a new issue, from 30-day patterns."
      />
      {hotspots.length === 0 ? (
        <EmptyNote>No predictions yet. These appear after a Watchtower run.</EmptyNote>
      ) : (
        <div className="divide-y divide-slate-200/70 overflow-hidden rounded-2xl bg-surface shadow-card">
          {hotspots.map((h) => {
            const color = RISK_COLORS[h.riskLevel] ?? "#f59e0b";
            return (
              <div key={h.id} className="flex items-start gap-4 p-5">
                <span className="text-xl" aria-hidden>
                  {CATEGORY_EMOJIS[h.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {CATEGORY_LABELS[h.category]}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      {h.riskLevel} risk
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
                    {h.reasoning}
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-muted tabular-nums">
                    {h.lat.toFixed(3)}, {h.lng.toFixed(3)} · ~{Math.round(h.radiusM)}m
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Reveal>
  );
}

// ─── weekly report ───────────────────────────────────────────────────────────

function WeeklyReportSection({
  report,
  cityName,
}: {
  report: WeeklyCivicReport | null;
  cityName: string;
}) {
  if (!report) {
    return (
      <Reveal>
        <SectionHeading icon={ScrollText} title="This week's civic report" />
        <EmptyNote>
          No civic report yet for {cityName}. The Watchtower writes one on its
          weekly run — trigger it from Admin → Developer Tools to generate one now.
        </EmptyNote>
      </Reveal>
    );
  }

  const lines: { label: string; text: string }[] = [
    { label: "At a glance", text: report.glance },
    { label: "The highlight", text: report.highlight },
    { label: "The shame", text: report.theShame },
    { label: "Top contributor", text: report.topContributor },
    { label: "Next week, watch", text: report.nextWeekWatch },
  ];

  return (
    <Reveal>
      <SectionHeading
        icon={ScrollText}
        title="This week's civic report"
        subtitle={`Drafted by the Watchtower agent · ${timeAgo(report.generatedAt)}`}
      />
      <div className="overflow-hidden rounded-2xl bg-primary-dark text-white shadow-card-lg">
        <div className="grid gap-px bg-white/10 md:grid-cols-2">
          {lines.map((l) => (
            <div key={l.label} className="bg-primary-dark p-6">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                {l.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{l.text}</p>
            </div>
          ))}
          <div className="flex items-center bg-primary p-6">
            <p className="font-display text-lg font-bold leading-snug">
              {report.verdict}
            </p>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

// ─── shared bits ─────────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="flex items-center gap-2.5 font-display text-2xl font-bold text-foreground">
        <Icon size={22} strokeWidth={2.2} className="text-primary" />
        {title}
      </h2>
      {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-surface/50 p-6 text-sm text-muted">
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-12 space-y-6">
      <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-32 w-full animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-12 flex items-center gap-4 rounded-2xl bg-red-50 p-5 text-red-700">
      <div className="flex-1">
        <p className="font-display font-bold">Couldn&apos;t load the dashboard</p>
        <p className="mt-0.5 text-sm text-red-600/80">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
      >
        <RotateCw size={14} /> Retry
      </button>
    </div>
  );
}
