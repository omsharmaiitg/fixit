"use client";

// ─── Single source of truth for city / location state ────────────────────────
// Location is FULLY AUTOMATIC. There is no manual city and no stored fallback:
//   • homeCity   — the user's live GPS location, reverse-geocoded to a name.
//     ALWAYS from GPS. Never user-editable, never read from a profile city.
//     Null when GPS is off/denied/unavailable — we deliberately do NOT fall back.
//   • activeCity — the city currently being VIEWED. Defaults to homeCity and is
//     never persisted, so a fresh app load always resets back to homeCity
//     (explore is never sticky).
//   • isExploring = activeCity !== homeCity.
//   • canAct      = live GPS AND not exploring — i.e. you may only report/upvote
//     when you're physically in your home city.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "@/hooks/useLocation";
import { UNRESOLVED_CITY_NAME, type City } from "@/lib/city";

// Location is always live GPS now — the only "source" is GPS (or none).
export type LocationSource = "gps";

interface LocationContextValue {
  // True once we've settled on a homeCity OR determined GPS is unavailable.
  resolved: boolean;
  locationSource: LocationSource | null; // 'gps' when we have a fix, else null
  homeCity: City | null; // live GPS location; null when GPS is unavailable
  activeCity: City | null;
  isExploring: boolean;
  canAct: boolean;
  // Live GPS fix, exposed for feed anchoring. Null until/unless GPS.
  gpsLat: number | null;
  gpsLng: number | null;
  // View another city without changing homeCity ("🔭 explore" mode).
  setActiveCity: (city: City) => void;
  // Stop exploring — snap activeCity back to homeCity.
  resetToHome: () => void;
}

const LocationCtx = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { userLat, userLng, locationError, requestLocation } = useLocation();

  const [homeCity, setHomeCity] = useState<City | null>(null);
  const [resolved, setResolved] = useState(false);
  // Only set when the user actively explores another city. activeCity is derived
  // as exploreCity ?? homeCity, so when not exploring it always tracks home —
  // and because it's never persisted, a fresh load starts back at home.
  const [exploreCity, setExploreCity] = useState<City | null>(null);

  // Ask for GPS once on app load — live GPS is the only signal.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // GPS path — reverse-geocode the fix into a city name. GPS is the ONLY source
  // of homeCity. Keyed on coarse coords so jitter doesn't refetch.
  const latKey = userLat != null ? userLat.toFixed(3) : null;
  const lngKey = userLng != null ? userLng.toFixed(3) : null;
  useEffect(() => {
    if (latKey == null || lngKey == null) return;
    let alive = true;
    fetch(`/api/geocode?lat=${latKey}&lng=${lngKey}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || userLat == null || userLng == null) return;
        // Best available real place token; falls back to the (never-shown)
        // sentinel only when the geocoder returned nothing at all.
        const name = (d.city ?? d.locality ?? d.region ?? UNRESOLVED_CITY_NAME) as string;
        setHomeCity({ cityName: name, cityLat: userLat, cityLng: userLng });
        setResolved(true);
      })
      .catch(() => {
        if (!alive || userLat == null || userLng == null) return;
        // Geocode failed but we still have a real fix — anchor on it unnamed.
        setHomeCity({ cityName: UNRESOLVED_CITY_NAME, cityLat: userLat, cityLng: userLng });
        setResolved(true);
      });
    return () => {
      alive = false;
    };
    // latKey/lngKey capture the coords; userLat/userLng read at fire time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latKey, lngKey]);

  // GPS off/denied/unavailable — NO fallback to any stored city. homeCity stays
  // null; consumers show "turn on GPS to fetch home city" instead.
  useEffect(() => {
    if (userLat != null && userLng != null) return; // GPS path owns this
    if (locationError == null) return; // GPS still pending — wait
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHomeCity(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolved(true);
  }, [userLat, userLng, locationError]);

  const setActiveCity = useCallback((city: City) => setExploreCity(city), []);
  const resetToHome = useCallback(() => setExploreCity(null), []);

  const value = useMemo<LocationContextValue>(() => {
    const activeCity = exploreCity ?? homeCity;
    const isExploring =
      exploreCity != null &&
      homeCity != null &&
      exploreCity.cityName !== homeCity.cityName;
    return {
      resolved,
      locationSource: homeCity ? "gps" : null,
      homeCity,
      activeCity,
      isExploring,
      canAct: homeCity != null && !isExploring,
      gpsLat: userLat,
      gpsLng: userLng,
      setActiveCity,
      resetToHome,
    };
  }, [exploreCity, homeCity, resolved, userLat, userLng, setActiveCity, resetToHome]);

  return <LocationCtx.Provider value={value}>{children}</LocationCtx.Provider>;
}

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationCtx);
  if (!ctx)
    throw new Error("useLocationContext must be used within <LocationProvider>");
  return ctx;
}
