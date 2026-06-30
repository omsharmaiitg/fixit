import {
  collection,
  doc,
  getCountFromServer,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { calculatePressureScore, getAgingStatus } from "@/lib/pressureScore";
import { stripUndefined } from "@/lib/firebaseHelpers";
import type {
  DNAEntry,
  Issue,
  IssueCategory,
  IssueStatus,
  Squad,
  TimeOfDay,
  WeatherContext,
} from "@/types";

const DAY = 86_400_000;
const now = Date.now();

// Status progression — DNA milestones are emitted for every stage up to and
// including the issue's current status.
const STAGE_ORDER: IssueStatus[] = [
  "reported",
  "verified",
  "acknowledged",
  "in_progress",
  "pending_confirmation",
  "resolved",
];
const STAGE_META: Record<IssueStatus, { emoji: string; label: string; actor: string }> = {
  reported: { emoji: "📝", label: "Issue reported", actor: "reporter" },
  verified: { emoji: "✅", label: "Verified by community upvotes", actor: "community" },
  acknowledged: { emoji: "🏛️", label: "Acknowledged by authority", actor: "authority" },
  in_progress: { emoji: "🔧", label: "Marked in progress", actor: "authority" },
  pending_confirmation: { emoji: "📸", label: "Resolution submitted — awaiting confirmation", actor: "authority" },
  resolved: { emoji: "🎉", label: "Confirmed resolved by community", actor: "community" },
  reopened: { emoji: "🔁", label: "Reopened — issue persists", actor: "community" },
};

function buildDna(status: IssueStatus, reportedAt: Date): DNAEntry[] {
  const reachedIdx = STAGE_ORDER.indexOf(status);
  const stages = reachedIdx >= 0 ? STAGE_ORDER.slice(0, reachedIdx + 1) : ["reported" as IssueStatus];
  return stages.map((stage, i) => {
    const m = STAGE_META[stage];
    return {
      id: crypto.randomUUID(),
      type: stage,
      emoji: m.emoji,
      // Spread milestones across the lifetime of the issue.
      label: m.label,
      timestamp: new Date(reportedAt.getTime() + i * 1.5 * DAY),
      actor: m.actor,
    } satisfies DNAEntry;
  });
}

const RAIN: WeatherContext = {
  condition: "rainy",
  rainfall48h: true,
  description: "Heavy rainfall in last 48h (32mm)",
};

type Seed = {
  title: string;
  category: IssueCategory;
  severity: number;
  status: IssueStatus;
  address: string;
  lat: number;
  lng: number;
  daysAgo: number;
  upvotes: number;
  nearbyUpvotes: number;
  timeOfDay: TimeOfDay;
  rain?: boolean;
  reporter: string;
  zone?: boolean; // part of the seeded Problem Zone (issues 1, 9, 11)
};

// Appendix C — 15 issues across every category & status, timestamps spread over
// ~40 days so aging colors and the Watchtower's 30-day window look genuine.
const SEEDS: Seed[] = [
  { title: "Deep pothole near Connaught Place metro", category: "road_damage", severity: 8, status: "acknowledged", address: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167, daysAgo: 22, upvotes: 14, nearbyUpvotes: 6, timeOfDay: "morning", rain: true, reporter: "Priya K.", zone: true },
  { title: "Burst water main flooding Sector 18", category: "water_supply", severity: 7, status: "in_progress", address: "Sector 18, Noida", lat: 28.5708, lng: 77.3260, daysAgo: 9, upvotes: 21, nearbyUpvotes: 9, timeOfDay: "afternoon", reporter: "Rohan M." },
  { title: "Streetlights dark for weeks in Rohini", category: "street_lighting", severity: 6, status: "verified", address: "Sector 7, Rohini", lat: 28.7045, lng: 77.1025, daysAgo: 16, upvotes: 8, nearbyUpvotes: 3, timeOfDay: "night", rain: true, reporter: "Sunita R." },
  { title: "Garbage pile overflowing at Azadpur", category: "waste_garbage", severity: 5, status: "reported", address: "Azadpur Mandi, Delhi", lat: 28.7077, lng: 77.1759, daysAgo: 3, upvotes: 4, nearbyUpvotes: 1, timeOfDay: "morning", reporter: "Imran S." },
  { title: "Open manhole on Karol Bagh footpath", category: "public_safety", severity: 9, status: "verified", address: "Ajmal Khan Rd, Karol Bagh", lat: 28.6512, lng: 77.1900, daysAgo: 6, upvotes: 17, nearbyUpvotes: 8, timeOfDay: "evening", reporter: "Deepa N." },
  { title: "Broken footpath tiles in Pitampura", category: "footpath", severity: 4, status: "reported", address: "Netaji Subhash Place, Pitampura", lat: 28.6960, lng: 77.1520, daysAgo: 5, upvotes: 3, nearbyUpvotes: 0, timeOfDay: "afternoon", reporter: "Arjun T." },
  { title: "Leaning tree blocking road in Gurugram", category: "tree_hazard", severity: 7, status: "resolved", address: "DLF Phase 3, Gurugram", lat: 28.4940, lng: 77.0910, daysAgo: 31, upvotes: 12, nearbyUpvotes: 4, timeOfDay: "morning", reporter: "Neha B." },
  { title: "Cracked road surface near Dwarka Mor", category: "road_damage", severity: 6, status: "reported", address: "Dwarka Mor, New Delhi", lat: 28.6190, lng: 77.0330, daysAgo: 12, upvotes: 6, nearbyUpvotes: 2, timeOfDay: "evening", reporter: "Vikram J." },
  { title: "Exposed electrical wiring near CP block", category: "public_safety", severity: 9, status: "acknowledged", address: "Barakhamba Rd, Connaught Place", lat: 28.6298, lng: 77.2240, daysAgo: 19, upvotes: 19, nearbyUpvotes: 11, timeOfDay: "night", rain: true, reporter: "Anil P.", zone: true },
  { title: "Sewage overflow on Saket main road", category: "sewage", severity: 8, status: "in_progress", address: "Saket District Centre, Delhi", lat: 28.5245, lng: 77.2066, daysAgo: 14, upvotes: 15, nearbyUpvotes: 5, timeOfDay: "morning", rain: true, reporter: "Kavya L." },
  { title: "Damaged speed breaker near CP outer circle", category: "road_damage", severity: 5, status: "verified", address: "Outer Circle, Connaught Place", lat: 28.6340, lng: 77.2190, daysAgo: 8, upvotes: 9, nearbyUpvotes: 4, timeOfDay: "afternoon", reporter: "Manish G.", zone: true },
  { title: "Severe waterlogging in Bhajanpura", category: "drainage_flooding", severity: 8, status: "reported", address: "Bhajanpura, North East Delhi", lat: 28.7010, lng: 77.2680, daysAgo: 2, upvotes: 11, nearbyUpvotes: 3, timeOfDay: "morning", rain: true, reporter: "Farah Q." },
  { title: "Public toilet broken & unusable in Okhla", category: "public_safety", severity: 5, status: "reported", address: "Okhla Phase 1, Delhi", lat: 28.5360, lng: 77.2730, daysAgo: 27, upvotes: 5, nearbyUpvotes: 1, timeOfDay: "afternoon", reporter: "Sahil V." },
  { title: "Collapsed boundary fence in Shalimar Bagh", category: "public_safety", severity: 6, status: "pending_confirmation", address: "Shalimar Bagh, Delhi", lat: 28.7170, lng: 77.1640, daysAgo: 24, upvotes: 10, nearbyUpvotes: 3, timeOfDay: "evening", reporter: "Ritu A." },
  { title: "Pothole cluster outside AIIMS gate", category: "road_damage", severity: 7, status: "verified", address: "AIIMS, Ansari Nagar, Delhi", lat: 28.5672, lng: 77.2100, daysAgo: 38, upvotes: 13, nearbyUpvotes: 6, timeOfDay: "morning", reporter: "Gaurav D." },
];

function buildIssue(s: Seed, zoneId: string): Issue {
  const reportedAt = new Date(now - s.daysAgo * DAY);
  const weatherAtReport = s.rain ? RAIN : undefined;
  const base: Issue = {
    id: crypto.randomUUID(),
    title: s.title,
    description: s.title,
    descriptionEnglish: s.title,
    category: s.category,
    severity: s.severity,
    status: s.status,
    agingStatus: getAgingStatus(reportedAt),
    location: { lat: s.lat, lng: s.lng, address: s.address },
    photoUrls: [],
    reporterId: `seed-${s.reporter.replace(/\W/g, "").toLowerCase()}`,
    reporterName: s.reporter,
    coReporters: [],
    reportedAt,
    updatedAt: new Date(now),
    upvoteCount: s.upvotes,
    nearbyUpvoteCount: s.nearbyUpvotes,
    // Synthetic voters so seeded counts stay consistent with the upvotedBy model
    // (upvoteCount === upvotedBy.length). Real votes add/remove the device id.
    upvotedBy: Array.from({ length: s.upvotes }, () => crypto.randomUUID()),
    cantFindCount: 0,
    cantFindBy: [],
    pressureScore: 0,
    pressureBreakdown: { verification: 0, age: 0, severity: 0, weather: 0 },
    dna: buildDna(s.status, reportedAt),
    discussion: [],
    adoptedBy: [],
    weatherAtReport,
    timeOfDayAtReport: s.timeOfDay,
    language: "en",
    isOfflineQueued: false,
    ...(s.zone ? { problemZoneId: zoneId } : {}),
  };
  const { score, breakdown } = calculatePressureScore(base);
  base.pressureScore = score;
  base.pressureBreakdown = breakdown;
  return base;
}

const SQUADS: Omit<Squad, "id" | "createdAt">[] = [
  { name: "CP Civic Watch", centerLat: 28.6315, centerLng: 77.2167, radiusM: 500, memberIds: ["seed-priyak", "seed-anilp", "seed-manishg", "seed-deepan"], totalPoints: 420 },
  { name: "Noida Sector Sentinels", centerLat: 28.5708, centerLng: 77.326, radiusM: 500, memberIds: ["seed-rohanm", "seed-kavyal"], totalPoints: 260 },
  { name: "North Delhi Guardians", centerLat: 28.7077, centerLng: 77.1759, radiusM: 500, memberIds: ["seed-imrans", "seed-sunitar", "seed-rituala"], totalPoints: 310 },
];

// Idempotent: skips if Firestore already holds ≥10 issues.
export async function seedDemoData(): Promise<{ seeded: boolean; count: number }> {
  const existing = await getCountFromServer(collection(getDb(), "issues"));
  if (existing.data().count >= 10) {
    return { seeded: false, count: existing.data().count };
  }

  const zoneId = crypto.randomUUID();
  const issues = SEEDS.map((s) => buildIssue(s, zoneId));

  const batch = writeBatch(getDb());
  for (const issue of issues) {
    const { id, ...rest } = issue;
    batch.set(doc(getDb(), "issues", id), stripUndefined(rest));
  }

  // Problem Zone clustering issues 1, 9, 11 (CP-area, road damage primary).
  const zoneIssues = issues.filter((i) => i.problemZoneId === zoneId);
  batch.set(
    doc(getDb(), "problemZones", zoneId),
    stripUndefined({
      centerLat: zoneIssues.reduce((a, i) => a + i.location.lat, 0) / zoneIssues.length,
      centerLng: zoneIssues.reduce((a, i) => a + i.location.lng, 0) / zoneIssues.length,
      issueIds: zoneIssues.map((i) => i.id),
      primaryCategory: "road_damage",
      secondaryCategory: "public_safety",
      combinedPressure: Math.min(
        zoneIssues.reduce((a, i) => a + i.pressureScore, 0),
        100,
      ),
      detectedAt: new Date(now),
    }),
  );

  for (const squad of SQUADS) {
    const id = crypto.randomUUID();
    batch.set(doc(getDb(), "squads", id), stripUndefined({ ...squad, createdAt: new Date(now) }));
  }

  await batch.commit();
  return { seeded: true, count: issues.length };
}
