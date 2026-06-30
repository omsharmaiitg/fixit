import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  increment,
  arrayUnion,
  writeBatch,
  runTransaction,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  calculatePressureScore,
  weightedUpvoteSum,
  getAgingStatus,
  BASELINE_WEIGHT,
  VERIFICATION_THRESHOLD_NAMED,
} from "@/lib/pressureScore";
import { getDb, getFirebaseStorage } from "@/lib/firebase";
import type {
  Badge,
  DiscussionEntry,
  DNAEntry,
  Issue,
  IssueSeverity,
  IssueStatus,
  PredictedHotspot,
  ProblemZone,
  Squad,
  User,
} from "@/types";

export { getAgingStatus };

// ─── Timestamp ↔ Date boundary ───────────────────────────────────────────────
// Deep-walk a plain object converting every Firestore Timestamp to a JS Date.
// Firestore never nests beyond a couple of levels here, so a recursive walk is
// fine. ponytail: naive deep walk; revisit only if a hot path shows up.
function tsToDate<T>(value: T): T {
  if (value instanceof Timestamp) return value.toDate() as unknown as T;
  if (Array.isArray(value)) return value.map(tsToDate) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = tsToDate(v);
    return out as T;
  }
  return value;
}

// Convert a Firestore issue doc into a typed Issue (Timestamps → Dates).
// Exported so batch tools (e.g. the admin recalculate) can reuse the boundary.
export function issueFromSnapshot(id: string, data: DocumentData): Issue {
  return tsToDate({ ...data, id }) as Issue;
}

// Firestore stores JS Dates as Timestamps automatically on write, so we only
// strip the client-side `id` before persisting.
function stripId<T extends { id: string }>(obj: T): Omit<T, "id"> {
  const { id: _id, ...rest } = obj;
  void _id;
  return rest;
}

// Firestore rejects `undefined` at any depth ("Unsupported field value:
// undefined"). Drop undefined-valued keys recursively before any write so an
// optional field that was never set simply doesn't exist in the doc.
// Dates and Timestamps are passed through untouched (not walked as objects).
export function stripUndefined<T>(value: T): T {
  if (value instanceof Date || value instanceof Timestamp) return value;
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

// ─── Issues ──────────────────────────────────────────────────────────────────

export function subscribeToIssues(
  onChange: (issues: Issue[]) => void,
  distanceFilter?: number | null,
  userLat?: number,
  userLng?: number,
  onError?: (e: Error) => void,
): () => void {
  const q = query(collection(getDb(), "issues"), orderBy("reportedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      let issues = snap.docs.map((d) => issueFromSnapshot(d.id, d.data()));
      if (distanceFilter && userLat != null && userLng != null) {
        issues = issues.filter(
          (i) =>
            haversineDistance(userLat, userLng, i.location.lat, i.location.lng) <=
            distanceFilter,
        );
      }
      onChange(issues);
    },
    (err) => onError?.(err),
  );
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const snap = await getDoc(doc(getDb(), "issues", id));
  return snap.exists() ? issueFromSnapshot(snap.id, snap.data()) : null;
}

// One-shot fetch of the whole corpus (public read). Used by the Impact
// Dashboard, which wants a snapshot, not a live subscription.
export async function getAllIssues(): Promise<Issue[]> {
  const snap = await getDocs(collection(getDb(), "issues"));
  return snap.docs.map((d) => issueFromSnapshot(d.id, d.data()));
}

// ─── Server-written intelligence collections (read-only here) ─────────────────
// These are produced by the Watchtower agent; the dashboard just reads them.
// tsToDate keeps the Timestamp→Date boundary in this one module (CLAUDE.md §8.4).

export async function getProblemZones(): Promise<ProblemZone[]> {
  const snap = await getDocs(collection(getDb(), "problemZones"));
  return snap.docs
    .map((d) => tsToDate({ ...d.data(), id: d.id }) as ProblemZone)
    .sort((a, b) => b.combinedPressure - a.combinedPressure);
}

export async function getPredictedHotspots(): Promise<PredictedHotspot[]> {
  const snap = await getDocs(collection(getDb(), "hotspots"));
  return snap.docs.map((d) => tsToDate({ ...d.data(), id: d.id }) as PredictedHotspot);
}

// The Watchtower's weekly civic report (one doc per ISO date). The dashboard
// shows only the newest. Shape mirrors watchtowerAgent's WeeklyReport + meta.
export interface WeeklyCivicReport {
  id: string;
  cityName?: string; // the city this report covers (scopes the dashboard)
  glance: string;
  highlight: string;
  theShame: string;
  topContributor: string;
  nextWeekWatch: string;
  verdict: string;
  generatedAt: Date;
}

// Newest report, optionally scoped to one city. When cityName is given, reports
// from other cities are ignored entirely (no borrowing another city's record).
export async function getLatestReport(
  cityName?: string,
): Promise<WeeklyCivicReport | null> {
  const snap = await getDocs(collection(getDb(), "reports"));
  if (snap.empty) return null;
  let reports = snap.docs.map(
    (d) => tsToDate({ ...d.data(), id: d.id }) as WeeklyCivicReport,
  );
  if (cityName) reports = reports.filter((r) => r.cityName === cityName);
  if (reports.length === 0) return null;
  reports.sort(
    (a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0),
  );
  return reports[0];
}

// All issues reported from a given identity (anonymous device id or, later,
// auth.uid), newest first. Equality-only query → no composite index needed;
// we sort in memory.
export async function getIssuesByReporter(reporterId: string): Promise<Issue[]> {
  if (!reporterId) return [];
  const q = query(collection(getDb(), "issues"), where("reporterId", "==", reporterId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => issueFromSnapshot(d.id, d.data()))
    .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
}

// On first sign-in, move a device's anonymous reports onto the user's account
// by re-stamping reporterId from the device id to the auth uid. Returns how
// many issues were migrated. No-op when there's nothing to move.
export async function backfillDeviceReports(
  deviceId: string,
  uid: string,
): Promise<number> {
  if (!deviceId || !uid || deviceId === uid) return 0;
  const q = query(collection(getDb(), "issues"), where("reporterId", "==", deviceId));
  const snap = await getDocs(q);
  if (snap.empty) return 0;
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => batch.update(d.ref, { reporterId: uid }));
  await batch.commit();
  return snap.size;
}

// Caller builds the full Issue (Appendix I). We persist it under its own id.
export async function createIssue(issue: Issue): Promise<string> {
  await setDoc(doc(getDb(), "issues", issue.id), stripUndefined(stripId(issue)));
  return issue.id;
}

export async function updateIssueStatus(
  issueId: string,
  status: IssueStatus,
  extra: Partial<Issue> = {},
): Promise<void> {
  await updateDoc(doc(getDb(), "issues", issueId), {
    status,
    updatedAt: new Date(),
    ...extra,
  });
}

// ─── Resolution lifecycle ─────────────────────────────────────────────────────
// Community thresholds for confirming a submitted resolution (CLAUDE.md §10).
export const RESOLVE_CONFIRM_THRESHOLD = 3; // confirmations → resolved
export const RESOLVE_CONTRADICT_THRESHOLD = 2; // contradictions → reopened

// Shared authority transition: set status, recompute pressure (acknowledged/
// in_progress carry score penalties in calculatePressureScore), and append ONE
// immutable DNA milestone — all in a transaction so the append-only rule holds.
// Returns the pre-transition issue so callers can notify its followers.
async function transitionIssue(
  issueId: string,
  status: IssueStatus,
  dnaSeed: Omit<DNAEntry, "id" | "timestamp">,
  extra: Record<string, unknown> = {},
): Promise<Issue | null> {
  const db = getDb();
  const ref = doc(db, "issues", issueId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const issue = issueFromSnapshot(snap.id, snap.data());
    const { score, breakdown } = calculatePressureScore({ ...issue, status });
    tx.update(ref, {
      status,
      pressureScore: score,
      pressureBreakdown: breakdown,
      updatedAt: new Date(),
      dna: arrayUnion({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        ...dnaSeed,
      } satisfies DNAEntry),
      ...extra,
    });
    return issue;
  });
}

export async function acknowledgeIssue(issueId: string): Promise<void> {
  const issue = await transitionIssue(issueId, "acknowledged", {
    type: "acknowledged",
    emoji: "🏛️",
    label: "Acknowledged by authority",
    actor: "authority",
  });
  if (issue) {
    await notifyIssueFollowers(
      { ...issue, status: "acknowledged" },
      "Your issue was acknowledged",
      `“${issue.title}” has been acknowledged by the authority.`,
    ).catch(() => {}); // notification is best-effort, never blocks the transition
  }
}

export async function markIssueInProgress(
  issueId: string,
  progressPhotoUrl?: string,
): Promise<void> {
  await transitionIssue(
    issueId,
    "in_progress",
    {
      type: "in_progress",
      emoji: "🔧",
      label: "Marked in progress",
      actor: "authority",
      ...(progressPhotoUrl ? { photoUrl: progressPhotoUrl } : {}),
    },
    progressPhotoUrl ? { photoUrls: arrayUnion(progressPhotoUrl) } : {},
  );
}

// Mandatory after-photo → status moves to pending_confirmation and the vote
// tallies are reset, opening the community confirm/contradict window.
export async function submitResolution(
  issueId: string,
  resolutionPhotoUrl: string,
): Promise<void> {
  await transitionIssue(
    issueId,
    "pending_confirmation",
    {
      type: "pending_confirmation",
      emoji: "📸",
      label: "Resolution submitted — awaiting confirmation",
      actor: "authority",
      photoUrl: resolutionPhotoUrl,
    },
    {
      resolutionPhotoUrl,
      resolveConfirmBy: [],
      resolveConfirmCount: 0,
      resolveContradictBy: [],
      resolveContradictCount: 0,
    },
  );
}

// Community vote on a submitted resolution. One stance per person (switching
// sides moves them). Crossing CONFIRM threshold → resolved; CONTRADICT → reopened,
// each appending an immutable DNA entry. Only votable while pending_confirmation.
export async function confirmResolution(
  issueId: string,
  reporterId: string,
  agree: boolean,
): Promise<void> {
  if (!reporterId) return;
  const db = getDb();
  const ref = doc(db, "issues", issueId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const issue = issueFromSnapshot(snap.id, snap.data());
    if (issue.status !== "pending_confirmation") return;

    const confirmBy = new Set(issue.resolveConfirmBy ?? []);
    const contradictBy = new Set(issue.resolveContradictBy ?? []);
    if (agree) {
      confirmBy.add(reporterId);
      contradictBy.delete(reporterId);
    } else {
      contradictBy.add(reporterId);
      confirmBy.delete(reporterId);
    }
    const confirmArr = [...confirmBy];
    const contradictArr = [...contradictBy];

    const update: Record<string, unknown> = {
      resolveConfirmBy: confirmArr,
      resolveConfirmCount: confirmArr.length,
      resolveContradictBy: contradictArr,
      resolveContradictCount: contradictArr.length,
      updatedAt: new Date(),
    };

    if (confirmArr.length >= RESOLVE_CONFIRM_THRESHOLD) {
      update.status = "resolved";
      update.dna = arrayUnion({
        id: crypto.randomUUID(),
        type: "resolved",
        emoji: "🎉",
        label: "Confirmed resolved by community",
        timestamp: new Date(),
        actor: "community",
      } satisfies DNAEntry);
    } else if (contradictArr.length >= RESOLVE_CONTRADICT_THRESHOLD) {
      update.status = "reopened";
      update.dna = arrayUnion({
        id: crypto.randomUUID(),
        type: "reopened",
        emoji: "🔁",
        label: "Reopened — community says it persists",
        timestamp: new Date(),
        actor: "community",
      } satisfies DNAEntry);
    }
    tx.update(ref, update);
  });
}

// Followers = the reporter + anyone who adopted the issue. Persists one
// notification doc each. ponytail: write-side only — real push (FCM service
// worker + token registration) and an in-app inbox are the documented TODO.
export async function notifyIssueFollowers(
  issue: Issue,
  title: string,
  body: string,
): Promise<void> {
  const uids = Array.from(
    new Set([issue.reporterId, ...(issue.adoptedBy ?? [])]),
  ).filter(Boolean);
  if (uids.length === 0) return;
  const batch = writeBatch(getDb());
  for (const userId of uids) {
    batch.set(doc(getDb(), "notifications", crypto.randomUUID()), {
      userId,
      issueId: issue.id,
      title,
      body,
      read: false,
      createdAt: new Date(),
    });
  }
  await batch.commit();
}

// Toggle this reporter's upvote. Adds the id if absent (upvote), removes it if
// present (un-upvote), keeps upvoteCount === upvotedBy.length (a true headcount),
// and freezes the voter's proximity `weight` in upvoteWeights on cast (Part 3b).
// The WEIGHTED sum — not the headcount — drives the pressure score and the
// reported→verified transition (Part 3d). Runs in a transaction so concurrent
// votes don't clobber each other. `weight` defaults to baseline (location
// unknown / un-upvote, where it's ignored).
export async function upvoteIssue(
  issueId: string,
  reporterId: string,
  weight: number = BASELINE_WEIGHT,
): Promise<void> {
  if (!reporterId) return;
  const db = getDb();
  const ref = doc(db, "issues", issueId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const issue = issueFromSnapshot(snap.id, snap.data());
    const upvotedBy = [...(issue.upvotedBy ?? [])];
    const weights = { ...(issue.upvoteWeights ?? {}) };
    const i = upvotedBy.indexOf(reporterId);
    const adding = i < 0;
    if (adding) {
      upvotedBy.push(reporterId);
      weights[reporterId] = weight;
    } else {
      upvotedBy.splice(i, 1);
      delete weights[reporterId];
    }

    const next = { ...issue, upvotedBy, upvoteCount: upvotedBy.length, upvoteWeights: weights };
    const { score, breakdown } = calculatePressureScore(next);
    const update: Record<string, unknown> = {
      upvotedBy,
      upvoteCount: upvotedBy.length,
      upvoteWeights: weights,
      pressureScore: score,
      pressureBreakdown: breakdown,
      updatedAt: new Date(),
    };

    // Community verification: when the weighted sum first crosses this report's
    // threshold, promote reported → verified and append a DNA milestone.
    // Append-only (arrayUnion) keeps the Firestore integrity rule satisfied.
    const threshold = issue.requiredUpvotesForVerification ?? VERIFICATION_THRESHOLD_NAMED;
    if (adding && issue.status === "reported" && weightedUpvoteSum(next) >= threshold) {
      update.status = "verified";
      update.dna = arrayUnion({
        id: crypto.randomUUID(),
        type: "verified",
        emoji: "✅",
        label: "Verified by community upvotes",
        timestamp: new Date(),
        actor: "community",
      } satisfies DNAEntry);
    }

    tx.update(ref, update);
  });
}

// Toggle this reporter's "can't find" flag. Keeps cantFindCount === cantFindBy.length.
export async function cantFindIssue(issueId: string, reporterId: string): Promise<void> {
  if (!reporterId) return;
  const db = getDb();
  const ref = doc(db, "issues", issueId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const issue = issueFromSnapshot(snap.id, snap.data());
    const cantFindBy = [...(issue.cantFindBy ?? [])];
    const i = cantFindBy.indexOf(reporterId);
    if (i >= 0) cantFindBy.splice(i, 1);
    else cantFindBy.push(reporterId);

    tx.update(ref, {
      cantFindBy,
      cantFindCount: cantFindBy.length,
      updatedAt: new Date(),
    });
  });
}

export async function adoptIssue(issueId: string, userId: string): Promise<void> {
  await updateDoc(doc(getDb(), "issues", issueId), {
    adoptedBy: arrayUnion(userId),
    updatedAt: new Date(),
  });
}

export async function addDiscussionEntry(
  issueId: string,
  entry: DiscussionEntry,
): Promise<void> {
  await updateDoc(doc(getDb(), "issues", issueId), {
    discussion: arrayUnion(entry),
    updatedAt: new Date(),
  });
}

// The ONLY way DNA is written — append-only via arrayUnion (CLAUDE.md §8.10).
export async function appendDNAEntry(issueId: string, entry: DNAEntry): Promise<void> {
  await updateDoc(doc(getDb(), "issues", issueId), {
    dna: arrayUnion(entry),
    updatedAt: new Date(),
  });
}

export async function addIssuePhoto(issueId: string, url: string): Promise<void> {
  await updateDoc(doc(getDb(), "issues", issueId), {
    photoUrls: arrayUnion(url),
    updatedAt: new Date(),
  });
}

export async function uploadIssuePhoto(
  file: Blob,
  issueId: string,
): Promise<string> {
  const path = `issues/${issueId}/${Date.now()}.jpg`;
  const r = ref(getFirebaseStorage(), path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

// Stores an attached video (never analyzed by Gemini). Content-type is taken
// from the File; the .mp4 path suffix is cosmetic.
export async function uploadIssueVideo(
  file: Blob,
  issueId: string,
): Promise<string> {
  const path = `issues/${issueId}/video-${Date.now()}.mp4`;
  const r = ref(getFirebaseStorage(), path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function createOrUpdateUser(user: User): Promise<void> {
  await setDoc(doc(getDb(), "users", user.id), stripId(user), { merge: true });
}

export async function getUserById(id: string): Promise<User | null> {
  const snap = await getDoc(doc(getDb(), "users", id));
  return snap.exists() ? (tsToDate({ ...snap.data(), id: snap.id }) as User) : null;
}

export async function awardPoints(userId: string, points: number): Promise<void> {
  await updateDoc(doc(getDb(), "users", userId), { points: increment(points) });
}

export async function awardBadge(userId: string, badge: Badge): Promise<void> {
  await updateDoc(doc(getDb(), "users", userId), { badges: arrayUnion(badge) });
}

// Idempotent gamification write (points + the full earned-badge set), used by
// the recompute path so re-running never double-counts. Owner-only per rules.
export async function saveUserGamification(
  userId: string,
  data: { points: number; badges: Badge[] },
): Promise<void> {
  await setDoc(
    doc(getDb(), "users", userId),
    { points: data.points, badges: data.badges },
    { merge: true },
  );
}

// ─── Squads ──────────────────────────────────────────────────────────────────

export async function getSquads(): Promise<Squad[]> {
  const snap = await getDocs(collection(getDb(), "squads"));
  return snap.docs.map((d) => tsToDate({ ...d.data(), id: d.id }) as Squad);
}

export async function addUserToSquad(squadId: string, userId: string): Promise<void> {
  await updateDoc(doc(getDb(), "squads", squadId), {
    memberIds: arrayUnion(userId),
  });
}

export async function createSquad(
  squad: Omit<Squad, "id" | "createdAt">,
): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(
    doc(getDb(), "squads", id),
    stripUndefined({ ...squad, createdAt: new Date() }),
  );
  return id;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function getSeverityLabel(severity: number): IssueSeverity {
  if (severity <= 3) return "low";
  if (severity <= 6) return "moderate";
  if (severity <= 8) return "high";
  return "critical";
}

// Great-circle distance in metres.
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
