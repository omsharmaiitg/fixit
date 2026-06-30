import {
  collection,
  doc,
  getCountFromServer,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import {
  calculatePressureScore,
  getAgingStatus,
  VERIFICATION_THRESHOLD_NAMED,
} from "@/lib/pressureScore";
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
  const upvoterIds = Array.from({ length: s.upvotes }, () => crypto.randomUUID());
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
    isAnonymous: false,
    requiredUpvotesForVerification: VERIFICATION_THRESHOLD_NAMED,
    reportedAt,
    updatedAt: new Date(now),
    upvoteCount: s.upvotes,
    // Synthetic voters so seeded counts stay consistent with the upvotedBy model
    // (upvoteCount === upvotedBy.length). Real votes add/remove the device id.
    upvotedBy: upvoterIds,
    // Proximity weights (Part 3): the first `nearbyUpvotes` voters sit close
    // (1.5×), the rest at baseline (1.0×) — so the weighted sum reproduces the
    // old `upvotes + 0.5*nearby` effective count and seeded pressure holds.
    upvoteWeights: Object.fromEntries(
      upvoterIds.map((uid, i) => [uid, i < s.nearbyUpvotes ? 1.5 : 1.0]),
    ),
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

// Sample "intelligence" the Watchtower normally writes (hotspots + weekly
// report), so the dashboard demos well without a live run. Doc shapes mirror
// watchtowerAgent.ts exactly: hotspot id = `hotspot_<lat>_<lng>`, report id =
// `report-<date>` with generatedAt=now so it's the latest. setDoc(merge) keeps
// it idempotent and a real "Run Watchtower Now" later overwrites it.
const DEMO_HOTSPOTS = [
  {
    lat: 28.632,
    lng: 77.219,
    category: "road_damage" as IssueCategory,
    riskLevel: "high" as const,
    reasoning:
      "Three road-damage and exposed-wiring reports cluster around Connaught Place; recent rain accelerates surface breakup, so a fresh pothole here next week is likely.",
    radiusM: 250,
  },
  {
    lat: 28.701,
    lng: 77.268,
    category: "drainage_flooding" as IssueCategory,
    riskLevel: "medium" as const,
    reasoning:
      "Bhajanpura already logged severe waterlogging and the area has weak storm drainage; another monsoon downpour would likely flood the same low-lying stretch.",
    radiusM: 300,
  },
];

const DEMO_REPORT = {
  glance:
    "15 issues on the public record this week — most still open, with road damage and public-safety hazards leading the board.",
  highlight:
    "A leaning tree blocking a DLF Phase 3 road was reported, fixed, and community-confirmed — the loop closed end to end.",
  theShame:
    "Exposed electrical wiring near Connaught Place has sat acknowledged-but-untouched for 19 days, in a rain-prone, high-footfall block.",
  topContributor:
    "Anil P. filed the most reports this week, including the CP wiring hazard — the kind of vigilance this ward runs on.",
  nextWeekWatch:
    "The Connaught Place road-damage cluster and Bhajanpura drainage are the two areas most likely to throw up a new issue.",
  verdict: "The neighbourhood is watching. Now it needs the authority to move.",
};

export async function seedDemoIntelligence(): Promise<{ hotspots: number; report: boolean }> {
  const batch = writeBatch(getDb());

  for (const h of DEMO_HOTSPOTS) {
    const id = `hotspot_${h.lat.toFixed(3)}_${h.lng.toFixed(3)}`;
    batch.set(
      doc(getDb(), "hotspots", id),
      stripUndefined({ ...h, predictedAt: new Date(now) }),
      { merge: true },
    );
  }

  const reportId = `report-${new Date(now).toISOString().slice(0, 10)}`;
  batch.set(
    doc(getDb(), "reports", reportId),
    stripUndefined({ ...DEMO_REPORT, generatedAt: new Date(now) }),
    { merge: true },
  );

  await batch.commit();
  return { hotspots: DEMO_HOTSPOTS.length, report: true };
}

// ─── Shamli demo data ────────────────────────────────────────────────────────
// 10 mock civic issues scattered across Shamli, Uttar Pradesh so the feed and
// dashboard demo well for a Shamli-based account. Each issue:
//   • carries cityName "Shamli" + realistic coords within ~5km of town center
//     (so the 1/2/5km distance filters all have something to show),
//   • is reported by one of 8 synthetic community members (never the real
//     logged-in device id — seeded issues stay out of "My Reports"),
//   • has a LoremFlickr mock photo (locked id → stable image) in photoUrls,
//     the SAME field real uploads use, so it renders through the same path,
//   • gets a live pressureScore / agingStatus from calculatePressureScore.

const SHAMLI_CENTER = { lat: 29.45, lng: 77.31 };

// 8 synthetic reporters. Realistic Indian display names; ids are clearly
// synthetic ("seed-user-NN") so they never collide with a real device id.
const SHAMLI_REPORTERS = {
  u1: { id: "seed-user-01", name: "Rahul Verma" },
  u2: { id: "seed-user-02", name: "Priya Sharma" },
  u3: { id: "seed-user-03", name: "Imran Khan" },
  u4: { id: "seed-user-04", name: "Anjali Gupta" },
  u5: { id: "seed-user-05", name: "Vikas Yadav" },
  u6: { id: "seed-user-06", name: "Sneha Singh" },
  u7: { id: "seed-user-07", name: "Mohammed Arif" },
  u8: { id: "seed-user-08", name: "Pooja Rani" },
} as const;

// Build a LoremFlickr locked URL: category-relevant keywords + stable lock id.
const flickr = (keywords: string, lock: number) =>
  `https://loremflickr.com/800/600/${keywords}/${lock}`;

type ShamliSeed = {
  title: string;
  description: string;
  category: IssueCategory;
  severity: number;
  status: IssueStatus;
  address: string;
  lat: number;
  lng: number;
  daysAgo: number;
  timeOfDay: TimeOfDay;
  rain?: boolean;
  language: "en" | "hi";
  reporter: { id: string; name: string };
  // Explicit upvoter ids (community members + a few extra "seed-voter-NN"
  // anonymous citizens). Verified issues carry more. A reporter never appears
  // in its own list (no self-upvote double-count).
  upvoters: string[];
  nearbyUpvotes: number; // how many of `upvoters` sit close (1.5× weight)
  photo: string;
  // Resolved issues only — after-photo + community confirmation so the
  // Resolved tab and dashboard "resolved" count populate.
  resolutionPhotoUrl?: string;
  resolutionGeminiVerdict?: string;
  resolveConfirmBy?: string[];
};

const R = SHAMLI_REPORTERS;

const SHAMLI_SEEDS: ShamliSeed[] = [
  {
    title: "Deep potholes on Jhinjhana Road",
    description:
      "A stretch of Jhinjhana Road has several deep potholes that fill with water and have already caused two-wheeler riders to skid. Needs urgent patching before the next rain.",
    category: "road_damage",
    severity: 7,
    status: "verified",
    address: "Jhinjhana Road, Shamli",
    lat: 29.472,
    lng: 77.285,
    daysAgo: 8,
    timeOfDay: "morning",
    rain: true,
    language: "en",
    reporter: R.u1,
    upvoters: [R.u2.id, R.u3.id, R.u4.id, R.u5.id, "seed-voter-11", "seed-voter-12", "seed-voter-13"],
    nearbyUpvotes: 3,
    photo: flickr("pothole,road", 101),
  },
  {
    title: "Open drain overflowing near Anaj Mandi",
    description:
      "The open drain beside Anaj Mandi is overflowing onto the road, spreading filthy water and a foul smell across the market entrance. Shopkeepers are wading through it daily.",
    category: "drainage_flooding",
    severity: 6,
    status: "reported",
    address: "Anaj Mandi, Shamli",
    lat: 29.446,
    lng: 77.315,
    daysAgo: 2,
    timeOfDay: "afternoon",
    rain: true,
    language: "hi",
    reporter: R.u2,
    upvoters: [R.u3.id, "seed-voter-21"],
    nearbyUpvotes: 1,
    photo: flickr("drain,sewage", 102),
  },
  {
    title: "Streetlights dead near Railway Station",
    description:
      "The whole approach road to Shamli Railway Station goes pitch dark after sunset — every streetlight on the stretch is dead. Commuters returning on late trains feel unsafe walking out.",
    category: "street_lighting",
    severity: 5,
    status: "acknowledged",
    address: "Railway Station Road, Shamli",
    lat: 29.44,
    lng: 77.322,
    daysAgo: 14,
    timeOfDay: "night",
    rain: true,
    language: "en",
    reporter: R.u3,
    upvoters: [R.u1.id, R.u4.id, R.u5.id, "seed-voter-31"],
    nearbyUpvotes: 2,
    photo: flickr("streetlight,night", 103),
  },
  {
    title: "Garbage pile-up near Bus Stand",
    description:
      "A large heap of uncollected garbage has built up right outside the Shamli Bus Stand. Stray cattle scatter it across the road and the stench reaches the waiting passengers.",
    category: "waste_garbage",
    severity: 6,
    status: "verified",
    address: "Bus Stand, Shamli",
    lat: 29.453,
    lng: 77.305,
    daysAgo: 5,
    timeOfDay: "morning",
    language: "en",
    reporter: R.u4,
    upvoters: [R.u1.id, R.u2.id, R.u5.id, R.u6.id, "seed-voter-41", "seed-voter-42"],
    nearbyUpvotes: 3,
    photo: flickr("garbage,trash", 104),
  },
  {
    title: "Exposed electrical wiring near Government Hospital",
    description:
      "Live electrical wires hang low and exposed near the District Hospital gate, within easy reach of children. With patients and families crowding here all day this is an accident waiting to happen.",
    category: "public_safety",
    severity: 8,
    status: "reported",
    address: "District Hospital, Shamli",
    lat: 29.458,
    lng: 77.298,
    daysAgo: 1,
    timeOfDay: "evening",
    language: "en",
    reporter: R.u5,
    upvoters: [R.u6.id, "seed-voter-51", "seed-voter-52"],
    nearbyUpvotes: 1,
    photo: flickr("electrical,wires", 105),
  },
  {
    title: "Burst water pipeline on Kairana Road",
    description:
      "A burst main on Kairana Road has been gushing drinking water onto the street for days. Nearby homes have lost pressure while thousands of litres run to waste.",
    category: "water_supply",
    severity: 7,
    status: "in_progress",
    address: "Kairana Road, Shamli",
    lat: 29.485,
    lng: 77.305,
    daysAgo: 11,
    timeOfDay: "afternoon",
    rain: true,
    language: "en",
    reporter: R.u6,
    upvoters: [R.u1.id, R.u3.id, R.u7.id, R.u8.id, "seed-voter-61", "seed-voter-62", "seed-voter-63", "seed-voter-64"],
    nearbyUpvotes: 4,
    photo: flickr("water,pipe,leak", 106),
  },
  {
    title: "Broken road near Tehsil office",
    description:
      "The road right in front of the Tehsil office has crumbled into a rough, uneven surface. Vehicles crawl over it and it kicks up dust all day in front of a busy government building.",
    category: "road_damage",
    severity: 6,
    status: "verified",
    address: "Tehsil Office, Shamli",
    lat: 29.449,
    lng: 77.308,
    daysAgo: 18,
    timeOfDay: "morning",
    language: "en",
    reporter: R.u7,
    upvoters: [R.u1.id, R.u2.id, R.u8.id, "seed-voter-71", "seed-voter-72"],
    nearbyUpvotes: 2,
    photo: flickr("broken,road", 107),
  },
  {
    title: "Fallen tree blocking lane in Adarsh Colony",
    description:
      "A large tree has fallen across the inner lane of Adarsh Colony, completely blocking vehicle access. Residents are squeezing past on foot and worry an ambulance couldn't get through.",
    category: "tree_hazard",
    severity: 5,
    status: "reported",
    address: "Adarsh Colony, Shamli",
    lat: 29.462,
    lng: 77.325,
    daysAgo: 4,
    timeOfDay: "evening",
    language: "hi",
    reporter: R.u8,
    upvoters: ["seed-voter-81"],
    nearbyUpvotes: 0,
    photo: flickr("fallen,tree", 108),
  },
  {
    title: "Waterlogging near Subhash Chowk",
    description:
      "Even after light rain, Subhash Chowk turns into a pond because the drains are choked. Water stands for hours, splashing into shops and making the crossing impossible to walk through.",
    category: "drainage_flooding",
    severity: 7,
    status: "verified",
    address: "Subhash Chowk, Shamli",
    lat: 29.4475,
    lng: 77.312,
    daysAgo: 9,
    timeOfDay: "morning",
    rain: true,
    language: "en",
    reporter: R.u1,
    upvoters: [R.u2.id, R.u3.id, R.u6.id, R.u7.id, "seed-voter-91", "seed-voter-92", "seed-voter-93", "seed-voter-94", "seed-voter-95"],
    nearbyUpvotes: 4,
    photo: flickr("flood,water", 109),
  },
  {
    title: "Overflowing dustbins in main market",
    description:
      "The public dustbins in Shamli's main market were overflowing for weeks before the cleanup. Reported here, the municipal team finally cleared and replaced them.",
    category: "waste_garbage",
    severity: 5,
    status: "resolved",
    address: "Main Market, Shamli",
    lat: 29.451,
    lng: 77.309,
    daysAgo: 25,
    timeOfDay: "afternoon",
    language: "en",
    reporter: R.u2,
    upvoters: [R.u1.id, R.u4.id, R.u7.id, "seed-voter-101", "seed-voter-102"],
    nearbyUpvotes: 2,
    photo: flickr("dustbin,trash", 110),
    resolutionPhotoUrl: flickr("clean,street", 210),
    resolutionGeminiVerdict:
      "The after-photo shows the bins emptied and the surrounding area cleared — consistent with the reported issue being resolved.",
    resolveConfirmBy: [R.u4.id, R.u7.id, "seed-voter-101"],
  },
];

function buildShamliIssue(s: ShamliSeed): Issue {
  const reportedAt = new Date(now - s.daysAgo * DAY);
  const weatherAtReport = s.rain ? RAIN : undefined;
  const upvoteWeights = Object.fromEntries(
    s.upvoters.map((uid, i) => [uid, i < s.nearbyUpvotes ? 1.5 : 1.0]),
  );

  const base: Issue = {
    id: crypto.randomUUID(),
    title: s.title,
    description: s.description,
    descriptionEnglish: s.description,
    category: s.category,
    severity: s.severity,
    status: s.status,
    agingStatus: getAgingStatus(reportedAt),
    location: { lat: s.lat, lng: s.lng, address: s.address },
    cityName: "Shamli",
    photoUrls: [s.photo],
    reporterId: s.reporter.id,
    reporterName: s.reporter.name,
    coReporters: [],
    isAnonymous: false,
    requiredUpvotesForVerification: VERIFICATION_THRESHOLD_NAMED,
    reportedAt,
    updatedAt: new Date(now),
    upvoteCount: s.upvoters.length,
    upvotedBy: s.upvoters,
    upvoteWeights,
    cantFindCount: 0,
    cantFindBy: [],
    pressureScore: 0,
    pressureBreakdown: { verification: 0, age: 0, severity: 0, weather: 0 },
    dna: buildDna(s.status, reportedAt),
    discussion: [],
    adoptedBy: [],
    weatherAtReport,
    timeOfDayAtReport: s.timeOfDay,
    language: s.language,
    isOfflineQueued: false,
    ...(s.resolutionPhotoUrl
      ? {
          resolutionPhotoUrl: s.resolutionPhotoUrl,
          resolutionGeminiVerdict: s.resolutionGeminiVerdict,
          resolveConfirmBy: s.resolveConfirmBy,
          resolveConfirmCount: s.resolveConfirmBy?.length ?? 0,
        }
      : {}),
  };

  const { score, breakdown } = calculatePressureScore(base);
  base.pressureScore = score;
  base.pressureBreakdown = breakdown;
  return base;
}

// Idempotent: skips if any Shamli issues already exist, so repeated taps don't
// duplicate the demo set. stripUndefined drops any optional fields left unset
// before writing (Firestore rejects `undefined`).
export async function seedShamliData(): Promise<{ seeded: boolean; count: number }> {
  const existing = await getCountFromServer(
    query(collection(getDb(), "issues"), where("cityName", "==", "Shamli")),
  );
  if (existing.data().count > 0) {
    return { seeded: false, count: existing.data().count };
  }

  const issues = SHAMLI_SEEDS.map(buildShamliIssue);

  const batch = writeBatch(getDb());
  for (const issue of issues) {
    const { id, ...rest } = issue;
    batch.set(doc(getDb(), "issues", id), stripUndefined(rest));
  }
  await batch.commit();

  return { seeded: true, count: issues.length };
}
