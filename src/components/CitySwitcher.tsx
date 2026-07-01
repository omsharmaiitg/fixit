"use client";

// Two-mode city control for the profile/edit section.
//   📍 Your current location — shows the resolved homeCity (the default).
//   🔭 See how other cities are doing — pick another city to *explore*. This
//      mode is logged-in only; a guest tapping it gets a sign-in prompt instead
//      of the picker. Exploring sets activeCity and never touches homeCity.

import { useState } from "react";
import Link from "next/link";
import { MapPin, Globe, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationContext } from "@/contexts/LocationContext";
import { CityPicker } from "@/components/CityPicker";
import { haversineDistance } from "@/lib/firebaseHelpers";
import { isNamedCity, type City } from "@/lib/city";

type Mode = "current" | "explore";

const SOURCE_NOTE: Record<string, string> = {
  gps: "Set from your live location.",
  "profile-fallback": "Saved to your profile — used when GPS is unavailable.",
  "guest-picked": "Chosen by you for browsing.",
};

// A picked city this close to home is treated as the home city itself — a city's
// own centre is well within this of any point inside it, but distinct cities sit
// further apart.
const SAME_CITY_M = 20_000;

// First comma-separated token, normalised (e.g. "Shamli, Uttar Pradesh" → "shamli").
const cityToken = (s?: string | null) => (s ?? "").split(",")[0].trim().toLowerCase();

// Is the picked city really the user's home city? Match on a real name, else on
// proximity — so it works even when the home city is an unnamed GPS fix.
function isHomeCity(picked: City, home: City | null): boolean {
  if (!home) return false;
  if (
    isNamedCity(picked.cityName) &&
    isNamedCity(home.cityName) &&
    cityToken(picked.cityName) === cityToken(home.cityName)
  ) {
    return true;
  }
  return (
    haversineDistance(home.cityLat, home.cityLng, picked.cityLat, picked.cityLng) <=
    SAME_CITY_M
  );
}

export function CitySwitcher() {
  const { user } = useAuth();
  const { homeCity, activeCity, isExploring, locationSource, setActiveCity } =
    useLocationContext();
  const [mode, setMode] = useState<Mode>("current");
  // Set when the user tried to "explore" their own home city.
  const [homeHint, setHomeHint] = useState(false);

  function switchMode(next: Mode) {
    setHomeHint(false);
    setMode(next);
  }

  // Picking your own home city isn't exploring — route back to the current-
  // location view with a subtle hint instead of entering explore mode.
  function handlePick(city: City) {
    if (isHomeCity(city, homeCity)) {
      setHomeHint(true);
      setMode("current");
      return;
    }
    setHomeHint(false);
    setActiveCity(city);
  }

  return (
    <div>
      {/* mode tabs */}
      <div className="flex gap-1 rounded-full bg-background p-1">
        <TabButton active={mode === "current"} onClick={() => switchMode("current")}>
          📍 Your current location
        </TabButton>
        <TabButton active={mode === "explore"} onClick={() => switchMode("explore")}>
          🔭 See how other cities are doing
        </TabButton>
      </div>

      {mode === "current" ? (
        <div className="mt-3">
          {homeCity ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <MapPin size={15} className="shrink-0 text-primary" strokeWidth={2.2} />
                {isNamedCity(homeCity.cityName)
                  ? homeCity.cityName
                  : "Your current location"}
              </p>
              {locationSource && SOURCE_NOTE[locationSource] && (
                <p className="mt-1 text-xs text-muted">{SOURCE_NOTE[locationSource]}</p>
              )}
              {homeHint && (
                <p className="mt-2 rounded-lg bg-primary/5 px-2.5 py-1.5 text-xs text-foreground">
                  That&apos;s your home city — already shown here under Your current
                  location.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Pinpointing your location…</p>
          )}
        </div>
      ) : !user ? (
        // Guest path — explore is a member feature.
        <div className="mt-3 rounded-xl border border-slate-200 bg-background p-3.5">
          <p className="text-sm font-semibold text-foreground">
            Sign in to explore other cities
          </p>
          <p className="mt-1 text-xs text-muted">
            Browsing how other cities are doing is available to members. Create a
            free account to look around.
          </p>
          <Link
            href="/auth"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
          >
            <LogIn size={15} strokeWidth={2.2} /> Sign in / Register
          </Link>
        </div>
      ) : (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
            <Globe size={14} className="shrink-0 text-primary" strokeWidth={2.2} />
            Pick a city to look around. This doesn&apos;t change your home city.
          </p>
          <CityPicker
            onPick={handlePick}
            initialName={
              isExploring && isNamedCity(activeCity?.cityName)
                ? activeCity!.cityName
                : undefined
            }
          />
          {isExploring && activeCity && (
            <p className="mt-2 text-xs font-medium text-foreground">
              Now exploring <span className="font-bold">{activeCity.cityName}</span>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full px-2 py-2 text-[11px] font-semibold leading-tight transition active:scale-[0.98] ${
        active ? "bg-primary text-white shadow-card" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
