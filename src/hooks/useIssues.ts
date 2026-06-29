"use client";

import { useEffect, useState } from "react";
import { subscribeToIssues, haversineDistance } from "@/lib/firebaseHelpers";
import type { Issue } from "@/types";

export type SortKey = "pressure" | "newest" | "nearest";

// Realtime feed. Re-subscribes when the distance filter or user position
// changes; `refresh` forces a re-subscribe after a transient error.
export function useIssues(
  distanceFilter: number | null,
  userLat: number | null,
  userLng: number | null,
) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // `loading` starts true via useState; the first snapshot flips it false.
    // We intentionally don't re-set it synchronously here (re-subscribes on
    // filter change just swap data in place — no skeleton flash).
    const unsub = subscribeToIssues(
      (list) => {
        setIssues(list);
        setError(null);
        setLoading(false);
      },
      distanceFilter,
      userLat ?? undefined,
      userLng ?? undefined,
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [distanceFilter, userLat, userLng, nonce]);

  return { issues, loading, error, refresh: () => setNonce((n) => n + 1) };
}

export function sortIssues(
  issues: Issue[],
  by: SortKey,
  lat?: number | null,
  lng?: number | null,
): Issue[] {
  const copy = [...issues];
  if (by === "newest") {
    return copy.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
  }
  if (by === "nearest" && lat != null && lng != null) {
    return copy.sort(
      (a, b) =>
        haversineDistance(lat, lng, a.location.lat, a.location.lng) -
        haversineDistance(lat, lng, b.location.lat, b.location.lng),
    );
  }
  // default: pressure, highest first
  return copy.sort((a, b) => b.pressureScore - a.pressureScore);
}
