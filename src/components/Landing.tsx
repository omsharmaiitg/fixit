"use client";

// SaaS-style front door shown to first-time, logged-out visitors. Pure
// presentation — the entry gate lives in app/page.tsx, "Get started" goes to
// the existing /auth flow, and "Continue as guest" just marks the session as
// entered (guests keep their read-only + GPS home-city behaviour untouched).
// Built strictly from the Impact Dashboard's design language: same tokens
// (background/surface/foreground/muted/primary), same rounded-2xl bg-surface
// shadow-card card, same font-display/font-mono type scale, same Reveal motion.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Camera,
  CircleCheck,
  CircleDot,
  Gauge,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { CATEGORY_EMOJIS, CATEGORY_LABELS } from "@/lib/constants";
import type { IssueCategory } from "@/types";

// Same reveal-on-scroll wrapper the dashboard uses. Local copy — the original
// lives inside a page module, which Next.js pages can't export extras from.
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

// Dashboard's section heading, verbatim.
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
      {subtitle && (
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>
      )}
    </div>
  );
}

// The two entry choices — primary button matches the dashboard's bg-primary
// rounded-full button; the guest button is the low-emphasis surface chip.
function Ctas({ onGuest }: { onGuest: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link
        href="/auth?next=/"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition active:scale-95"
      >
        Get started
        <ArrowRight size={16} strokeWidth={2.2} />
      </Link>
      <button
        onClick={onGuest}
        className="inline-flex items-center justify-center rounded-full bg-surface px-6 py-3 text-sm font-semibold text-muted shadow-card transition active:scale-95"
      >
        Continue as guest
      </button>
    </div>
  );
}

const STEPS: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  line: string;
}[] = [
  {
    icon: Camera,
    title: "Report in seconds",
    line: "An AI Triage Agent turns a photo and a sentence into a structured civic report.",
  },
  {
    icon: Gauge,
    title: "Urgency you can see",
    line: "Every issue gets a public 0–100 Pressure Score that rises with neglect.",
  },
  {
    icon: ShieldCheck,
    title: "Kept honest",
    line: "The community verifies issues and an autonomous Watchtower Agent governs the city.",
  },
];

// ─── product glimpse (static, dashboard-styled preview) ──────────────────────

const GLIMPSE_KPIS = [
  { label: "Total reported", value: 128, icon: Activity, tone: "text-primary" },
  { label: "Resolved", value: 43, icon: CircleCheck, tone: "text-[#16a34a]" },
  { label: "Still open", value: 85, icon: CircleDot, tone: "text-[#ea580c]" },
  { label: "In the pipeline", value: 27, icon: TrendingUp, tone: "text-primary" },
];

// Same thresholds/colors as the dashboard's PressurePill.
const GLIMPSE_ROWS: { cat: IssueCategory; title: string; pressure: number; color: string }[] = [
  { cat: "road_damage", title: "Deep pothole near the school gate", pressure: 82, color: "#dc2626" },
  { cat: "street_lighting", title: "Dark stretch along the market road", pressure: 64, color: "#ea580c" },
  { cat: "waste_garbage", title: "Overflowing bins at the bus stand", pressure: 38, color: "#ca8a04" },
];

function Glimpse() {
  return (
    <div
      className="pointer-events-none select-none overflow-hidden rounded-2xl bg-surface shadow-card-lg"
      aria-hidden
    >
      <div className="border-b border-slate-200/70 px-5 py-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          FixIt · Impact · Your city
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200/70 md:grid-cols-4 md:divide-y-0">
        {GLIMPSE_KPIS.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} className="p-4 md:p-5">
              <Icon size={17} strokeWidth={2.2} className={it.tone} />
              <p className="mt-3 font-display text-3xl font-extrabold tabular-nums text-foreground">
                {it.value}
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted">{it.label}</p>
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-200/70 px-5 py-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-[34%] rounded-l-full bg-[#16a34a]" />
        </div>
        <div className="mt-2.5 flex items-center gap-5 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <span className="h-2 w-2 rounded-full bg-[#16a34a]" /> 43 resolved
          </span>
          <span className="flex items-center gap-1.5 font-medium text-muted">
            <span className="h-2 w-2 rounded-full bg-slate-300" /> 85 still open
          </span>
        </div>
      </div>
      <div className="divide-y divide-slate-200/70 border-t border-slate-200/70">
        {GLIMPSE_ROWS.map((r) => (
          <div key={r.cat} className="flex items-center gap-3 p-4">
            <span className="text-lg" aria-hidden>
              {CATEGORY_EMOJIS[r.cat]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
              <p className="font-mono text-xs text-muted">{CATEGORY_LABELS[r.cat]}</p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-bold tabular-nums"
              style={{ backgroundColor: `${r.color}1a`, color: r.color }}
            >
              {r.pressure} pressure
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export function Landing({ onGuest }: { onGuest: () => void }) {
  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-24 pt-6 md:px-8">
        {/* top bar — wordmark + the dashboard's public-record chip */}
        <header className="flex items-center justify-between">
          <span className="font-display text-xl font-extrabold tracking-tight text-primary-dark">
            FixIt
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-xs font-semibold text-muted shadow-card">
            <ShieldCheck size={14} strokeWidth={2.2} className="text-primary" />
            Public record
          </span>
        </header>

        <div className="space-y-14 md:space-y-20">
          {/* hero */}
          <Reveal className="pt-12 md:pt-20">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              FixIt · Report. Verify. Resolve.
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground md:text-6xl">
              Your city&apos;s problems, finally on the record.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
              FixIt turns everyday civic issues into a public, prioritized,
              verifiable record — powered by two AI agents.
            </p>
            <div className="mt-8">
              <Ctas onGuest={onGuest} />
            </div>
          </Reveal>

          {/* how it works */}
          <Reveal>
            <SectionHeading icon={Sparkles} title="How FixIt works" />
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className="rounded-2xl bg-surface p-6 shadow-card">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon size={22} strokeWidth={2.2} />
                    </div>
                    <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                      {s.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.line}</p>
                  </div>
                );
              })}
            </div>
          </Reveal>

          {/* credibility row */}
          <Reveal>
            <p className="text-center font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Built on Google Gemini · Firebase · Google Maps · Cloud Run
            </p>
          </Reveal>

          {/* product glimpse */}
          <Reveal>
            <SectionHeading
              icon={BarChart3}
              title="The public record, live"
              subtitle="Every city gets an Impact Dashboard like this — every report, verification and resolution, open to anyone, no login."
            />
            <Glimpse />
          </Reveal>

          {/* final CTA */}
          <Reveal>
            <div className="rounded-2xl bg-surface p-6 shadow-card-lg md:p-10">
              <h2 className="max-w-2xl font-display text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
                Put your city on the record.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                Report your first issue in under a minute, or look around as a
                guest first.
              </p>
              <div className="mt-6">
                <Ctas onGuest={onGuest} />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
