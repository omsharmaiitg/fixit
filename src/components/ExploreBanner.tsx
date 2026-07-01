"use client";

// Slim banner shown while the user is viewing a city that isn't their own.
// Renders nothing unless isExploring. Not mounted anywhere yet — Phase 2 places
// it above the feed.

import { ArrowLeftRight } from "lucide-react";
import { useLocationContext } from "@/contexts/LocationContext";
import { isNamedCity } from "@/lib/city";

export function ExploreBanner() {
  const { isExploring, activeCity, homeCity, resetToHome } = useLocationContext();
  if (!isExploring || !activeCity) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
      <span className="flex-1 leading-snug">
        🔭 Exploring <span className="font-semibold">{activeCity.cityName}</span> —
        switch to your city to report or upvote.
      </span>
      <button
        onClick={resetToHome}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white transition active:scale-95"
      >
        <ArrowLeftRight size={12} strokeWidth={2.4} />
        {isNamedCity(homeCity?.cityName) ? homeCity!.cityName : "Your city"}
      </button>
    </div>
  );
}
