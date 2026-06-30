"use client";

// ─── Single source of truth for city / location state ────────────────────────
// Everything that needs to know "where is the user" and "which city are we
// looking at" reads from here — no component reaches for GPS or the profile city
// directly anymore.
//
// Model:
//   • locationSource — how we learned the user's real city:
//       'gps'              live GPS, reverse-geocoded            (actions allowed)
//       'profile-fallback' GPS denied/unavailable, logged in     (read-only)
//       'guest-picked'     guest with no GPS picked a city once   (read-only)
//   • homeCity   — the user's REAL city (resolved in the order above).
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
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/hooks/useLocation";
import { readCityCookie, writeCityCookie, type City } from "@/lib/city";

export type LocationSource = "gps" | "profile-fallback" | "guest-picked";

interface LocationContextValue {
  // True once we've settled on a homeCity OR determined we must prompt for one.
  resolved: boolean;
  locationSource: LocationSource | null;
  homeCity: City | null;
  activeCity: City | null;
  isExploring: boolean;
  canAct: boolean;
  // Guest (or first-run logged-in user) with no GPS and no stored city: the UI
  // should prompt them to pick a city once. Cleared by pickHomeCity.
  needsCityPrompt: boolean;
  // Live GPS fix, exposed for feed anchoring (Phase 2). Null until/unless GPS.
  gpsLat: number | null;
  gpsLng: number | null;
  // View another city without changing homeCity ("🔭 explore" mode).
  setActiveCity: (city: City) => void;
  // Stop exploring — snap activeCity back to homeCity.
  resetToHome: () => void;
  // Answer the first-run prompt: set the user's real city (persisted).
  pickHomeCity: (city: City) => Promise<void>;
}

const LocationCtx = createContext<LocationContextValue | null>(null);

async function readProfileCity(uid: string): Promise<City | null> {
  try {
    const snap = await getDoc(doc(getDb(), "users", uid));
    const d = snap.data();
    if (
      d &&
      typeof d.cityName === "string" &&
      typeof d.cityLat === "number" &&
      typeof d.cityLng === "number"
    ) {
      return { cityName: d.cityName, cityLat: d.cityLat, cityLng: d.cityLng };
    }
  } catch {
    /* fall through — caller handles the null */
  }
  return null;
}

// Persist a resolved home city: cookie always (fast cache + guest store), and
// the user doc when logged in (so it survives as the GPS-denied fallback).
async function persistCity(city: City, uid: string | null): Promise<void> {
  writeCityCookie(city);
  if (uid) {
    try {
      await setDoc(
        doc(getDb(), "users", uid),
        { cityName: city.cityName, cityLat: city.cityLat, cityLng: city.cityLng },
        { merge: true },
      );
    } catch {
      /* cookie still holds it; non-fatal */
    }
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { userLat, userLng, locationError, requestLocation } = useLocation();

  const [homeCity, setHomeCity] = useState<City | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [resolved, setResolved] = useState(false);
  const [needsCityPrompt, setNeedsCityPrompt] = useState(false);
  // Only set when the user actively explores another city. activeCity is derived
  // as exploreCity ?? homeCity, so when not exploring it always tracks home —
  // and because it's never persisted, a fresh load starts back at home.
  const [exploreCity, setExploreCity] = useState<City | null>(null);

  // Ask for GPS once on app load — live GPS is the primary signal.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // (1) GPS path — reverse-geocode the fix into a city. GPS always wins, and we
  // persist it so it doubles as the profile fallback later. Keyed on coarse
  // coords so jitter doesn't refetch.
  const latKey = userLat != null ? userLat.toFixed(3) : null;
  const lngKey = userLng != null ? userLng.toFixed(3) : null;
  useEffect(() => {
    if (latKey == null || lngKey == null) return;
    let alive = true;
    fetch(`/api/geocode?lat=${latKey}&lng=${lngKey}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || userLat == null || userLng == null) return;
        const name = (d.city ?? d.locality ?? "Your area") as string;
        const c: City = { cityName: name, cityLat: userLat, cityLng: userLng };
        setHomeCity(c);
        setLocationSource("gps");
        setNeedsCityPrompt(false);
        setResolved(true);
        void persistCity(c, user?.uid ?? null);
      })
      .catch(() => {
        if (!alive || userLat == null || userLng == null) return;
        // Geocode failed but we still have a real fix — anchor on it unnamed.
        const c: City = { cityName: "Your area", cityLat: userLat, cityLng: userLng };
        setHomeCity(c);
        setLocationSource("gps");
        setNeedsCityPrompt(false);
        setResolved(true);
      });
    return () => {
      alive = false;
    };
    // latKey/lngKey capture the coords; user is read at fire time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latKey, lngKey]);

  // (2) Fallback path — GPS has definitively failed and produced no coords.
  // Logged in → profile city; guest → previously-picked city; neither → prompt.
  useEffect(() => {
    if (authLoading) return;
    if (userLat != null && userLng != null) return; // GPS path owns this
    if (locationError == null) return; // GPS still pending — wait
    if (locationSource === "gps") return; // already anchored on a real fix
    let alive = true;
    (async () => {
      if (user) {
        const c = (await readProfileCity(user.uid)) ?? readCityCookie();
        if (!alive) return;
        if (c) {
          setHomeCity(c);
          setLocationSource("profile-fallback");
          setNeedsCityPrompt(false);
        } else {
          setNeedsCityPrompt(true);
        }
      } else {
        const c = readCityCookie();
        if (!alive) return;
        if (c) {
          setHomeCity(c);
          setLocationSource("guest-picked");
          setNeedsCityPrompt(false);
        } else {
          setNeedsCityPrompt(true);
        }
      }
      if (alive) setResolved(true);
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, user, userLat, userLng, locationError, locationSource]);

  const pickHomeCity = useCallback(
    async (city: City) => {
      setHomeCity(city);
      setExploreCity(null);
      // A manual pick is the guest path; a logged-in user picking one seeds
      // their profile fallback.
      setLocationSource(user ? "profile-fallback" : "guest-picked");
      setNeedsCityPrompt(false);
      setResolved(true);
      await persistCity(city, user?.uid ?? null);
    },
    [user],
  );

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
      locationSource,
      homeCity,
      activeCity,
      isExploring,
      canAct: locationSource === "gps" && !isExploring,
      needsCityPrompt,
      gpsLat: userLat,
      gpsLng: userLng,
      setActiveCity,
      resetToHome,
      pickHomeCity,
    };
  }, [
    exploreCity,
    homeCity,
    resolved,
    locationSource,
    needsCityPrompt,
    userLat,
    userLng,
    setActiveCity,
    resetToHome,
    pickHomeCity,
  ]);

  return <LocationCtx.Provider value={value}>{children}</LocationCtx.Provider>;
}

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationCtx);
  if (!ctx)
    throw new Error("useLocationContext must be used within <LocationProvider>");
  return ctx;
}
