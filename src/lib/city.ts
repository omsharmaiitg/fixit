// A city: a name + center coordinate used to scope the feed (65km radius) and
// label the greeting. Home city is always the user's live GPS location (see
// LocationContext) — it is never stored or user-editable.

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
