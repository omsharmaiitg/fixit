// Anonymous, per-device reporter identity — no login required.
//
// A random id is stored in a 1-year cookie so reports made from this browser
// can be listed under "My Reports". It lives in the generic Issue.reporterId
// field, so when real auth arrives the same field can simply hold auth.uid.
//
// TODO(auth): on first Firebase sign-in, backfill issues where
// reporterId === deviceId to auth.uid, then prefer auth.uid going forward.

const COOKIE = "fixit_reporter_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// SSR-safe: returns "" when there's no DOM (server render). On the client,
// reads the existing id or mints + persists a new one.
export function getReporterId(): string {
  if (typeof document === "undefined") return "";
  const existing = readCookie(COOKIE);
  if (existing) return existing;
  const id = crypto.randomUUID();
  document.cookie = `${COOKIE}=${id}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  return id;
}
