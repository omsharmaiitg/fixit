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
import { calculatePressureScore } from "@/lib/pressureScore";
import { getDb, getFirebaseStorage } from "@/lib/firebase";
import { getAgingStatus } from "@/lib/pressureScore";
import type {
  Badge,
  DiscussionEntry,
  DNAEntry,
  Issue,
  IssueSeverity,
  IssueStatus,
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

// Toggle this reporter's upvote. Adds the id if absent (upvote), removes it if
// present (un-upvote), keeps upvoteCount === upvotedBy.length, and recomputes the
// pressure score. Runs in a transaction so concurrent votes don't clobber each
// other. Never touches `dna`, so the append-only Firestore rule passes.
export async function upvoteIssue(issueId: string, reporterId: string): Promise<void> {
  if (!reporterId) return;
  const db = getDb();
  const ref = doc(db, "issues", issueId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const issue = issueFromSnapshot(snap.id, snap.data());
    const upvotedBy = [...(issue.upvotedBy ?? [])];
    const i = upvotedBy.indexOf(reporterId);
    if (i >= 0) upvotedBy.splice(i, 1);
    else upvotedBy.push(reporterId);

    const { score, breakdown } = calculatePressureScore({
      ...issue,
      upvotedBy,
      upvoteCount: upvotedBy.length,
    });
    tx.update(ref, {
      upvotedBy,
      upvoteCount: upvotedBy.length,
      pressureScore: score,
      pressureBreakdown: breakdown,
      updatedAt: new Date(),
    });
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
