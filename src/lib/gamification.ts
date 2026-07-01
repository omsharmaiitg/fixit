// Gamification — points, badges, and (optional) Neighbourhood Squads.
//
// Everything is DERIVED from a user's activity and recomputed idempotently, so
// re-running can never double-count (no fragile per-action increments). The pure
// functions (deriveActivity / computeGamification) drive the live /profile UI;
// recomputeUserGamification persists the snapshot + assigns a squad.
//
// Build-safe: no Gemini/SDK import. All Firebase access goes through
// firebaseHelpers; this module never imports gamification back.

import {
  getAllIssues,
  getSquads,
  addUserToSquad,
  createSquad,
  saveUserGamification,
  haversineDistance,
} from "@/lib/firebaseHelpers";
import type { Badge, Issue, Squad } from "@/types";

// ─── Points ──────────────────────────────────────────────────────────────────
export const POINTS = {
  report: 10, // filing a report
  upvote: 5, // upvoting / verifying an issue
  firstResponder: 15, // your report got corroborated (advanced past "reported")
  adoptedResolution: 25, // an issue you adopted reached "resolved"
} as const;

// Statuses that mean a report was corroborated by the community / authority.
const ADVANCED = new Set([
  "verified",
  "acknowledged",
  "in_progress",
  "pending_confirmation",
  "resolved",
  "reopened",
]);

export interface Activity {
  reportsMade: number;
  resolvedOwnReports: number;
  firstResponderCount: number; // own reports that advanced past "reported"
  upvotesCast: number;
  adoptedResolved: number; // adopted issues now resolved
  inProblemZone: boolean; // any own report sits in a detected problem zone
  distinctReportDays: number; // reporting-streak proxy
}

export function deriveActivity(uid: string, issues: Issue[]): Activity {
  const mine = issues.filter((i) => i.reporterId === uid);
  const days = new Set(mine.map((i) => i.reportedAt.toISOString().slice(0, 10)));
  return {
    reportsMade: mine.length,
    resolvedOwnReports: mine.filter((i) => i.status === "resolved").length,
    firstResponderCount: mine.filter((i) => ADVANCED.has(i.status)).length,
    upvotesCast: issues.filter((i) => (i.upvotedBy ?? []).includes(uid)).length,
    adoptedResolved: issues.filter(
      (i) => (i.adoptedBy ?? []).includes(uid) && i.status === "resolved",
    ).length,
    inProblemZone: mine.some((i) => !!i.problemZoneId),
    distinctReportDays: days.size,
  };
}

export function pointsFor(a: Activity): number {
  return (
    a.reportsMade * POINTS.report +
    a.upvotesCast * POINTS.upvote +
    a.firstResponderCount * POINTS.firstResponder +
    a.adoptedResolved * POINTS.adoptedResolution
  );
}

export function levelFor(points: number): string {
  if (points >= 150) return "Guardian";
  if (points >= 50) return "Contributor";
  return "Newcomer";
}

// ─── Badges (the 7) ──────────────────────────────────────────────────────────
interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  hint: string; // unlock hint shown while locked
  earned: (a: Activity, points: number) => boolean;
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: "first_responder",
    name: "First Responder",
    emoji: "🚑",
    hint: "File your first report",
    earned: (a) => a.reportsMade >= 1,
  },
  {
    id: "neighbourhood_watch",
    name: "Neighbourhood Watch",
    emoji: "👀",
    hint: "File 5 reports",
    earned: (a) => a.reportsMade >= 5,
  },
  {
    id: "issue_slayer",
    name: "Issue Slayer",
    emoji: "🛠️",
    hint: "Get one of your reports resolved",
    earned: (a) => a.resolvedOwnReports >= 1,
  },
  {
    id: "top_verifier",
    name: "Top Verifier",
    emoji: "✅",
    hint: "Verify 10 issues",
    earned: (a) => a.upvotesCast >= 10,
  },
  {
    id: "guardian",
    name: "Guardian",
    emoji: "🛡️",
    hint: "Earn 150 civic points",
    earned: (_a, points) => points >= 150,
  },
  {
    id: "root_cause_finder",
    name: "Root Cause Finder",
    emoji: "🔍",
    hint: "Report inside a detected problem zone",
    earned: (a) => a.inProblemZone,
  },
  {
    id: "streak_keeper",
    name: "Streak Keeper",
    emoji: "🔥",
    hint: "Report on 3 different days",
    earned: (a) => a.distinctReportDays >= 3,
  },
];

export interface BadgeStatus {
  id: string;
  name: string;
  emoji: string;
  hint: string;
  earned: boolean;
}

export interface GamificationSummary {
  points: number;
  level: string;
  badges: BadgeStatus[];
}

// Pure: turn activity into the full points + per-badge earned/locked picture.
export function computeGamification(a: Activity): GamificationSummary {
  const points = pointsFor(a);
  return {
    points,
    level: levelFor(points),
    badges: BADGE_DEFS.map((b) => ({
      id: b.id,
      name: b.name,
      emoji: b.emoji,
      hint: b.hint,
      earned: b.earned(a, points),
    })),
  };
}

// ─── Neighbourhood Squads (optional) ─────────────────────────────────────────
const SQUAD_RADIUS_M = 500;

function reportCenter(mine: Issue[]): { lat: number; lng: number } | null {
  if (mine.length === 0) return null;
  return {
    lat: mine.reduce((s, i) => s + i.location.lat, 0) / mine.length,
    lng: mine.reduce((s, i) => s + i.location.lng, 0) / mine.length,
  };
}

// Auto-group a user with their nearest squad within ~500m of where they report;
// if none exists, seed a new squad centred on them. Idempotent on membership.
// Returns the squad name, or null when the user has no reports yet.
export async function autoAssignSquad(
  uid: string,
  issues: Issue[],
  squads: Squad[],
): Promise<string | null> {
  const mine = issues.filter((i) => i.reporterId === uid);
  const center = reportCenter(mine);
  if (!center) return null;

  let best: Squad | null = null;
  let bestD = Infinity;
  for (const s of squads) {
    const d = haversineDistance(center.lat, center.lng, s.centerLat, s.centerLng);
    if (d <= SQUAD_RADIUS_M && d < bestD) {
      best = s;
      bestD = d;
    }
  }

  if (best) {
    if (!best.memberIds.includes(uid)) await addUserToSquad(best.id, uid);
    return best.name;
  }

  // No nearby squad — start one named after the area the user reports from.
  const area = mine[0].location.address.split(",")[0].trim() || "Local";
  const name = `${area} Watch`;
  await createSquad({
    name,
    centerLat: center.lat,
    centerLng: center.lng,
    radiusM: SQUAD_RADIUS_M,
    memberIds: [uid],
    totalPoints: 0,
  });
  return name;
}

// ─── Recompute (the "relevant action" hook) ──────────────────────────────────
// Loads the corpus (unless preloaded), recomputes points + earned badges, and
// persists them. `withSquad` also runs squad assignment (skipped on hot paths
// like upvote to avoid extra writes). Best-effort: callers fire-and-forget.
export async function recomputeUserGamification(
  uid: string,
  opts: { issues?: Issue[]; withSquad?: boolean } = {},
): Promise<GamificationSummary & { squadName: string | null }> {
  const issues = opts.issues ?? (await getAllIssues());
  const summary = computeGamification(deriveActivity(uid, issues));

  const earnedBadges: Badge[] = summary.badges
    .filter((b) => b.earned)
    .map((b) => ({
      id: b.id,
      name: b.name,
      emoji: b.emoji,
      description: b.hint,
      earnedAt: new Date(),
    }));

  let squadName: string | null = null;
  if (opts.withSquad) {
    try {
      squadName = await autoAssignSquad(uid, issues, await getSquads());
    } catch {
      /* squads are optional — never block points/badges on them */
    }
  }

  await saveUserGamification(uid, { points: summary.points, badges: earnedBadges });
  return { ...summary, squadName };
}
