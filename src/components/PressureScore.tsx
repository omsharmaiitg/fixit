"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PressureBreakdown } from "@/types";
import { getPressureColor } from "@/lib/pressureScore";

const ROWS: { key: keyof PressureBreakdown; emoji: string; label: string; max: number }[] = [
  { key: "verification", emoji: "👥", label: "Verification", max: 30 },
  { key: "age", emoji: "⏳", label: "Age", max: 25 },
  { key: "severity", emoji: "⚠️", label: "Severity", max: 25 },
  { key: "weather", emoji: "🌧️", label: "Weather", max: 20 },
];

export function PressureScore({
  score,
  breakdown,
  size = "lg",
}: {
  score: number;
  breakdown?: PressureBreakdown;
  size?: "lg" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const color = getPressureColor(score);

  if (size === "sm") {
    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: color }}
        aria-label={`Pressure ${score}`}
      >
        {score}
      </span>
    );
  }

  // lg — circular SVG ring
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;

  return (
    <div className="rounded-2xl bg-surface p-5 shadow-card">
      <button
        onClick={() => breakdown && setOpen((v) => !v)}
        className="flex w-full items-center gap-4 text-left"
        disabled={!breakdown}
      >
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-extrabold leading-none" style={{ color }}>
              {score}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Pressure
            </span>
          </div>
        </div>

        <div className="flex-1">
          <p className="font-display text-base font-bold text-foreground">
            Pressure Score
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            One public 0–100 urgency number. It rises with neglect and falls when
            authorities act.
          </p>
          {breakdown && (
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              {open ? "Hide" : "See"} breakdown
              <ChevronDown
                size={14}
                className={`transition ${open ? "rotate-180" : ""}`}
              />
            </span>
          )}
        </div>
      </button>

      {breakdown && open && (
        <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
          {ROWS.map((row) => {
            const val = breakdown[row.key];
            return (
              <div key={row.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-foreground">
                  {row.emoji} {row.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min((val / row.max) * 100, 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold text-muted">
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
