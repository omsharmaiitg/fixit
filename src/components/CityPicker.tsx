"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Search } from "lucide-react";
import type { City } from "@/lib/city";

// Public, HTTP-referrer-restricted browser key — same one LocationPicker uses.
const BROWSER_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
  "AIzaSyDkg660heloGDUcAvrJ4-qwVXZ1SmTambo";

// Google Places Autocomplete restricted to cities. Fires onPick with the
// city's name + center coordinate when the user selects a suggestion.
export function CityPicker({
  onPick,
  initialName,
}: {
  onPick: (city: City) => void;
  initialName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(!BROWSER_KEY);

  useEffect(() => {
    if (!BROWSER_KEY || !inputRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setOptions({ key: BROWSER_KEY });
        const { Autocomplete } = await importLibrary("places");
        if (cancelled || !inputRef.current) return;
        const ac = new Autocomplete(inputRef.current, {
          types: ["(cities)"],
          fields: ["geometry", "name", "formatted_address"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          onPick({
            cityName: place.name ?? place.formatted_address ?? "",
            cityLat: loc.lat(),
            cityLng: loc.lng(),
          });
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // onPick is stable enough for this one-shot init; matches LocationPicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        ref={inputRef}
        defaultValue={initialName}
        placeholder={failed ? "City search unavailable" : "Search your city"}
        disabled={failed}
        className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-primary disabled:opacity-50"
      />
    </div>
  );
}
