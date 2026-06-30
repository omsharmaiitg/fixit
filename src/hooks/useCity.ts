"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { readCityCookie, writeCityCookie, type City } from "@/lib/city";

// Resolves the user's chosen city: the Firestore user doc wins when logged in,
// else the cookie. `resolved` lets callers tell "still loading" from "no city
// chosen yet" (which triggers the onboarding picker). setCity persists to both.
export function useCity() {
  const { user, loading: authLoading } = useAuth();
  const [city, setCityState] = useState<City | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    (async () => {
      if (user) {
        try {
          const snap = await getDoc(doc(getDb(), "users", user.uid));
          const d = snap.data();
          if (
            alive &&
            typeof d?.cityName === "string" &&
            typeof d?.cityLat === "number" &&
            typeof d?.cityLng === "number"
          ) {
            const c: City = { cityName: d.cityName, cityLat: d.cityLat, cityLng: d.cityLng };
            writeCityCookie(c); // cache for next load
            setCityState(c);
            setResolved(true);
            return;
          }
        } catch {
          /* fall through to cookie */
        }
      }
      if (alive) {
        setCityState(readCityCookie());
        setResolved(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, authLoading]);

  const setCity = useCallback(
    async (c: City) => {
      writeCityCookie(c);
      setCityState(c);
      if (user) {
        try {
          await setDoc(
            doc(getDb(), "users", user.uid),
            { cityName: c.cityName, cityLat: c.cityLat, cityLng: c.cityLng },
            { merge: true },
          );
        } catch {
          /* cookie still holds it; non-fatal */
        }
      }
    },
    [user],
  );

  return { city, resolved, setCity };
}
