// The user's chosen city: a name + center coordinate used to scope the feed
// (65km radius) and label the greeting. Stored on the user's Firestore doc when
// logged in, and in a `fixit_city` cookie for guests (and as a fast local cache
// for logged-in users). See useCity for the read/write orchestration.

export interface City {
  cityName: string;
  cityLat: number;
  cityLng: number;
}

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
