// FixIt — shared types (single source of truth: @/types)
// Dates are always JS `Date` at this boundary; firebaseHelpers converts
// Firestore `Timestamp` ↔ `Date` so nothing else has to think about it.

export type IssueCategory =
  | "road_damage"
  | "drainage_flooding"
  | "water_supply"
  | "street_lighting"
  | "waste_garbage"
  | "sewage"
  | "public_safety"
  | "footpath"
  | "tree_hazard"
  | "other";

// Human label derived from the 1–10 numeric severity (see getSeverityLabel).
export type IssueSeverity = "low" | "moderate" | "high" | "critical";

export type IssueStatus =
  | "reported"
  | "verified"
  | "acknowledged"
  | "in_progress"
  | "pending_confirmation"
  | "resolved"
  | "reopened";

export type AgingStatus =
  | "fresh"
  | "aging"
  | "neglected"
  | "critical_neglect"
  | "civic_failure";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export type Language = "en" | "hi" | "ta" | "bn" | "te" | "mr";

export interface Location {
  lat: number;
  lng: number;
  address: string;
  landmark?: string;
}

// Append-only biography entry. Never edited or deleted.
export type DNAEntryType =
  | "reported"
  | "verified"
  | "acknowledged"
  | "in_progress"
  | "pending_confirmation"
  | "resolved"
  | "reopened"
  | "discussion"
  | "escalation"
  | "merged";

export interface DNAEntry {
  id: string;
  type: DNAEntryType;
  emoji: string;
  label: string;
  timestamp: Date;
  photoUrl?: string;
  actor?: string; // display name or "system"/"authority"
}

export type DiscussionType =
  | "📍 confirm"
  | "📸 update_photo"
  | "💡 possible_cause"
  | "🔧 possible_fix"
  | "⚠️ getting_worse"
  | "✅ looks_fixed";

export interface DiscussionEntry {
  id: string;
  userId: string;
  userName: string;
  userBadges?: string[];
  type: DiscussionType;
  content: string;
  timestamp: Date;
  photoUrl?: string;
  lat?: number;
  lng?: number;
}

export interface WeatherContext {
  condition: "rainy" | "dry" | "humid" | "unknown";
  rainfall48h: boolean;
  description: string;
}

export interface PressureBreakdown {
  verification: number;
  age: number;
  severity: number;
  weather: number;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  descriptionEnglish?: string;
  category: IssueCategory;
  severity: number; // 1–10
  status: IssueStatus;
  agingStatus: AgingStatus;

  location: Location;
  cityName?: string; // city/locality derived from the geocoded location at report time
  photoUrls: string[];
  videoUrl?: string; // optional attached video — stored/displayed, NOT AI-analyzed

  // Generic reporter identity. Holds the anonymous per-device id today (see
  // @/lib/reporter) and can hold a Firebase auth.uid later with no schema change.
  reporterId: string;
  reporterName: string;
  coReporters: string[];

  // Display-only anonymity: reporterId/reporterName still hold the REAL reporter
  // (so My Reports + moderation work) — this flag only hides the name from other
  // viewers. Missing on legacy docs ⇒ treat as false. (Part 2)
  isAnonymous: boolean;
  // Weighted-upvote sum needed to auto-verify this report. Set at creation:
  // named reports need fewer than anonymous ones. Missing ⇒ named default. (Part 3)
  requiredUpvotesForVerification: number;

  reportedAt: Date;
  updatedAt: Date;

  upvoteCount: number; // headcount of voters — kept in sync with upvotedBy.length (citizen-facing)
  upvotedBy: string[]; // reporter ids (auth uid) who upvoted — toggle source of truth
  // Per-voter proximity weight at the time of voting (uid → weight). Frozen on
  // cast so a later move doesn't retroactively change it. Its SUM feeds the
  // pressure score's verification term + the verification threshold. (Part 3)
  upvoteWeights: Record<string, number>;
  cantFindCount: number; // kept in sync with cantFindBy.length
  cantFindBy?: string[]; // reporter ids who flagged "can't find"

  pressureScore: number;
  pressureBreakdown: PressureBreakdown;

  dna: DNAEntry[];
  discussion: DiscussionEntry[];
  discussionSummary?: string;

  adoptedBy: string[];

  weatherAtReport?: WeatherContext;
  timeOfDayAtReport: TimeOfDay;
  language: Language;

  // Resolution
  resolutionPhotoUrl?: string;
  resolutionGeminiVerdict?: string;
  resolveConfirmCount?: number; // kept in sync with resolveConfirmBy.length
  resolveContradictCount?: number; // kept in sync with resolveContradictBy.length
  resolveConfirmBy?: string[]; // reporter ids who confirmed the fix (one stance each)
  resolveContradictBy?: string[]; // reporter ids who say it's not fixed

  // Agent / intelligence layer
  problemZoneId?: string;
  predictedHotspot?: boolean;
  escalation?: EscalationMemo;

  isOfflineQueued: boolean;
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  earnedAt?: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  points: number;
  level: number;
  badges: Badge[];
  squadId?: string;
  adoptedIssues: string[];
  preferredLanguage: Language;
  // Chosen city center — scopes the home feed (65km radius). Mirrored to a cookie.
  cityName?: string;
  cityLat?: number;
  cityLng?: number;
  createdAt: Date;
}

export interface Squad {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusM: number;
  memberIds: string[];
  totalPoints: number;
  weeklyRank?: number;
  createdAt: Date;
}

export interface ProblemZone {
  id: string;
  centerLat: number;
  centerLng: number;
  issueIds: string[];
  primaryCategory: IssueCategory;
  secondaryCategory?: IssueCategory;
  combinedPressure: number; // capped 100
  aiAnalysis?: string;
  detectedAt: Date;
}

// ─── Agent types ────────────────────────────────────────────────────────────

export interface TriageToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface EscalationMemo {
  issueId: string;
  draftedAt: Date;
  body: string;
  pressureAtDraft: number;
}

export interface PredictedHotspot {
  id: string;
  lat: number;
  lng: number;
  category: IssueCategory;
  riskLevel: "low" | "medium" | "high";
  reasoning: string;
  radiusM: number;
  predictedAt: Date;
  cityName?: string; // city this forecast belongs to — scopes the dashboard
}
