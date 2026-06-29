// Reporter identity. Prefers the signed-in Firebase uid; otherwise falls back
// to an anonymous, per-device id stored in a 1-year cookie so reports made
// before signing in are still attributable (and can be backfilled on sign-in).
//
// Lives in the generic Issue.reporterId field, so the same field holds a device
// id today and a Firebase auth.uid once signed in — no schema change.
//
// TODO(auth): backfill of device → uid happens once per device on first
// sign-in (see backfillDeviceReports + AuthContext).

import { getFirebaseAuth } from "@/lib/firebase";

const COOKIE = "fixit_reporter_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// The anonymous device id (always the cookie value, never the uid). SSR-safe.
export function getDeviceId(): string {
  if (typeof document === "undefined") return "";
  const existing = readCookie(COOKIE);
  if (existing) return existing;
  const id = crypto.randomUUID();
  document.cookie = `${COOKIE}=${id}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  return id;
}

// Current signed-in uid, or null. Guarded so it never throws or runs on SSR.
function currentUid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return getFirebaseAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

// The identity to stamp on / query reports by: uid if signed in, else device id.
export function getReporterId(): string {
  return currentUid() ?? getDeviceId();
}
