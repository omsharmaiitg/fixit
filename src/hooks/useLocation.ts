"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// watchPosition-based geolocation. Lazily started via requestLocation() so we
// never prompt on mount; clears the watch on unmount.
export function useLocation() {
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const watchId = useRef<number | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Location isn't available on this device.");
      return;
    }
    setIsLocating(true);
    setLocationError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setIsLocating(false);
      },
      (err) => {
        setLocationError(err.message || "Couldn't get your location.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return { userLat, userLng, locationError, isLocating, requestLocation };
}
