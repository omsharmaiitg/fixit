import type { AgingStatus, Issue, PressureBreakdown } from "@/types";

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / 86_400_000;
}

// Aging buckets — CLAUDE.md §6. Single source of truth; firebaseHelpers
// re-exports this so callers don't import it twice.
export function getAgingStatus(reportedAt: Date): AgingStatus {
  const d = daysSince(reportedAt);
  if (d < 4) return "fresh";
  if (d < 8) return "aging";
  if (d < 15) return "neglected";
  if (d < 30) return "critical_neglect";
  return "civic_failure";
}

// Pressure Score (0–100) — CLAUDE.md §6. Deterministic; keep in sync with the
// copy referenced by the Watchtower recompute.
export function calculatePressureScore(issue: Issue): {
  score: number;
  breakdown: PressureBreakdown;
} {
  // Nearby (≤50m) upvotes count 1.5× — i.e. an extra 0.5× on top of the base.
  const effectiveUpvotes = issue.upvoteCount + 0.5 * (issue.nearbyUpvoteCount ?? 0);
  const verification = Math.min(effectiveUpvotes * 2, 30);

  const age = Math.min(daysSince(issue.reportedAt) * 1.5, 25);

  const severity = issue.severity * 2.5;

  let weather = 0;
  if (issue.weatherAtReport?.rainfall48h) {
    if (issue.category === "road_damage" || issue.category === "drainage_flooding") {
      weather += 10;
    } else if (issue.category === "water_supply") {
      weather += 7;
    } else if (issue.category === "street_lighting") {
      weather += 15; // exposed wiring + rain
    }
  }
  if (issue.timeOfDayAtReport === "night" && issue.category === "street_lighting") {
    weather += 8;
  }
  weather = Math.min(weather, 20);

  let total = Math.round(verification + age + severity + weather);
  if (issue.status === "acknowledged") total -= 5;
  if (issue.status === "in_progress") total -= 10;
  total = clamp(total, 0, 100);

  return {
    score: total,
    breakdown: {
      verification: Math.round(verification),
      age: Math.round(age),
      severity: Math.round(severity),
      weather: Math.round(weather),
    },
  };
}

// Card / ring fill — Appendix D thresholds (green<30, yellow<60, orange<80, red≥80).
export function getPressureColor(score: number): string {
  if (score < 30) return "#16a34a";
  if (score < 60) return "#ca8a04";
  if (score < 80) return "#ea580c";
  return "#dc2626";
}

// Readable text color over a pressure-colored fill.
export function getPressureTextColor(score: number): string {
  return score < 30 ? "#14532d" : "#ffffff";
}
