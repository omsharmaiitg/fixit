import type { AgingStatus, Issue, PressureBreakdown } from "@/types";

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// Weighted upvotes needed to auto-verify (reported → verified). Anonymous
// reports demand more community corroboration than named ones. Tune here. (Part 3d)
export const VERIFICATION_THRESHOLD_NAMED = 3;
export const VERIFICATION_THRESHOLD_ANONYMOUS = 5;

// ─── Distance-weighted upvotes (Part 3a) ─────────────────────────────────────
// A vote's contribution scales linearly with how close the voter is, with a
// floor so distance never makes a vote count for LESS than a normal vote — it
// only adds a proximity bonus that fades to nothing by DECAY_DISTANCE_KM.
// These are the single knobs to tune the whole system.
export const MAX_PROXIMITY_WEIGHT = 2.0; // weight at distance 0
export const BASELINE_WEIGHT = 1.0; // floor; also the weight when location is unknown
export const DECAY_DISTANCE_KM = 10; // distance at which weight reaches BASELINE_WEIGHT

// weight(d): 2.0 at 0km → linear decay → 1.0 at/after 10km.
export function upvoteWeight(distanceKm: number): number {
  if (distanceKm <= 0) return MAX_PROXIMITY_WEIGHT;
  if (distanceKm >= DECAY_DISTANCE_KM) return BASELINE_WEIGHT;
  return (
    MAX_PROXIMITY_WEIGHT -
    (MAX_PROXIMITY_WEIGHT - BASELINE_WEIGHT) * (distanceKm / DECAY_DISTANCE_KM)
  );
}

// Sum of every voter's frozen proximity weight. Legacy docs (no upvoteWeights)
// fall back to counting each existing voter at BASELINE_WEIGHT so their pressure
// doesn't collapse to zero. This SUM — not the headcount — drives verification.
export function weightedUpvoteSum(issue: Issue): number {
  const weights = issue.upvoteWeights ?? {};
  const keys = Object.keys(weights);
  if (keys.length > 0) return keys.reduce((sum, k) => sum + weights[k], 0);
  return (issue.upvoteCount ?? 0) * BASELINE_WEIGHT;
}

export function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / 86_400_000;
}

// Aging buckets. Single source of truth; firebaseHelpers
// re-exports this so callers don't import it twice.
export function getAgingStatus(reportedAt: Date): AgingStatus {
  const d = daysSince(reportedAt);
  if (d < 4) return "fresh";
  if (d < 8) return "aging";
  if (d < 15) return "neglected";
  if (d < 30) return "critical_neglect";
  return "civic_failure";
}

// Pressure Score (0–100). Deterministic; keep in sync with the
// copy referenced by the Watchtower recompute.
export function calculatePressureScore(issue: Issue): {
  score: number;
  breakdown: PressureBreakdown;
} {
  // Distance-weighted verification (Part 3b): the SUM of per-voter proximity
  // weights replaces the old count + 50m/1.5× special case.
  const verification = Math.min(weightedUpvoteSum(issue) * 2, 30);

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
