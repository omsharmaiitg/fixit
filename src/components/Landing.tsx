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
  ArrowRight,
  BarChart3,
  Camera,
  Crosshair,
  Gauge,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

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

// Feature walkthrough — the app's actual capabilities, no numbers or sample
// data (nothing invented before we know the user's city). Rendered as divided
// rows in one surface card, the dashboard's hotspot-list pattern.
const FEATURES: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  body: string;
}[] = [
  {
    icon: Camera,
    title: "Report in seconds",
    body: "Describe an issue in plain language and add a photo. An AI Triage Agent reads it, pinpoints the location on the map, and turns it into a structured civic record.",
  },
  {
    icon: Gauge,
    title: "A public urgency score",
    body: "Every issue carries a Pressure Score reflecting severity, how long it has gone unresolved, community verification, and live conditions. It rises the longer an issue is ignored and falls once it is acted on.",
  },
  {
    icon: Users,
    title: "Community verification",
    body: "Neighbours confirm real issues, so the record stays trustworthy. Reporting and verification are tied to your live location, keeping the signal honest.",
  },
  {
    icon: Crosshair,
    title: "An autonomous Watchtower",
    body: "A second agent continuously reviews the city, groups recurring problems into zones, forecasts where new issues are likely, and writes a weekly civic summary.",
  },
  {
    icon: BarChart3,
    title: "A transparent public record",
    body: "Every report, verification, and resolution is public and permanent. The full Impact Dashboard is open to anyone — no login required — so accountability comes from visibility.",
  },
];

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

          {/* how it works — feature walkthrough */}
          <Reveal>
            <SectionHeading
              icon={Sparkles}
              title="How FixIt works"
              subtitle="From a photo on the street to a public record the whole city can hold accountable."
            />
            <div className="divide-y divide-slate-200/70 overflow-hidden rounded-2xl bg-surface shadow-card">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="flex items-start gap-4 p-5 md:p-6">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon size={20} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-foreground">
                        {f.title}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                        {f.body}
                      </p>
                    </div>
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
