// The user's chosen city: a name + center coordinate used to scope the feed
// (65km radius) and label the greeting. Stored on the user's Firestore doc when
// logged in, and in a `fixit_city` cookie for guests (and as a fast local cache
// for logged-in users). See useCity for the read/write orchestration.

export interface City {
  cityName: string;
  cityLat: number;
  cityLng: number;
}

// Internal sentinel for a GPS fix we couldn't reverse-geocode into a real place
// name (e.g. the geocoder was unavailable). It is NEVER shown to users — every
// render site substitutes a real value (the detailed geocoded area, the active
// city name, or a plain description) via isNamedCity below.
export const UNRESOLVED_CITY_NAME = "Nearby";

// True only for a genuine, showable place name (not empty, not the sentinel).
export function isNamedCity(name?: string | null): name is string {
  return !!name && name.trim() !== "" && name !== UNRESOLVED_CITY_NAME;
}

// Stable, filesystem-safe key for a city name. The single source of truth for
// city identity used by BOTH the Watchtower report writer (doc id) and the
// dashboard reader (filter) — keep it here so they can never drift and a report
// stays findable across casing/suffix variations ("Shamli" vs "shamli").
export const citySlug = (name?: string | null) =>
  (name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
  "unknown";

const COOKIE = "fixit_city";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readCityCookie(): City | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )fixit_city=([^;]*)/);
  if (!m) return null;
  try {
    const c = JSON.parse(decodeURIComponent(m[1]));
    if (
      typeof c?.cityName === "string" &&
      typeof c?.cityLat === "number" &&
      typeof c?.cityLng === "number"
    ) {
      return c as City;
    }
  } catch {
    /* malformed cookie — treat as no city */
  }
  return null;
}

export function writeCityCookie(city: City): void {
  if (typeof document === "undefined") return;
  const v = encodeURIComponent(JSON.stringify(city));
  document.cookie = `${COOKIE}=${v}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
