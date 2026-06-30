// Resolve the proximity weight for a single upvote, client-side (Part 3c).
// Order: (1) reuse a lat/lng the app already has → no prompt; (2) else ask the
// browser once at tap time; (3) else fall back to BASELINE_WEIGHT. Location is
// NEVER required — denial or failure just means no proximity bonus, the vote
// still counts at full baseline weight.

import { haversineDistance } from "@/lib/firebaseHelpers";
import { upvoteWeight, BASELINE_WEIGHT } from "@/lib/pressureScore";

function getCurrentPositionSafe(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null), // denied / timeout / unavailable → fall back, don't block
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    );
  });
}

export async function resolveUpvoteWeight(
  issueLat: number,
  issueLng: number,
  knownLat?: number | null,
  knownLng?: number | null,
): Promise<number> {
  let lat = knownLat ?? null;
  let lng = knownLng ?? null;
  if (lat == null || lng == null) {
    const pos = await getCurrentPositionSafe();
    if (pos) {
      lat = pos.lat;
      lng = pos.lng;
    }
  }
  if (lat == null || lng == null) return BASELINE_WEIGHT;
  const km = haversineDistance(lat, lng, issueLat, issueLng) / 1000;
  return upvoteWeight(km);
}
