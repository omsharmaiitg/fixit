"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { isNamedCity, type City } from "@/lib/city";

// Public, HTTP-referrer-restricted browser key — same one LocationPicker uses.
const BROWSER_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
  "AIzaSyDkg660heloGDUcAvrJ4-qwVXZ1SmTambo";

// City picker built on PlaceAutocompleteElement (Places API "New"). The legacy
// google.maps.places.Autocomplete is unavailable to projects created after
// Mar 2025 (LegacyApiNotActivatedMapError), so we mount the web component and
// resolve the chosen prediction to a Place for its name + coordinates.
export function CityPicker({
  onPick,
  initialName,
}: {
  onPick: (city: City) => void;
  initialName?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!BROWSER_KEY);

  useEffect(() => {
    if (!BROWSER_KEY || !hostRef.current) return;
    let cancelled = false;
    let el: google.maps.places.PlaceAutocompleteElement | null = null;

    (async () => {
      try {
        setOptions({ key: BROWSER_KEY });
        const { PlaceAutocompleteElement } = await importLibrary("places");
        if (cancelled || !hostRef.current) return;

        el = new PlaceAutocompleteElement({ includedPrimaryTypes: ["(cities)"] });
        el.style.width = "100%";
        // Real, empty-friendly placeholder — never inherit a location sentinel.
        try {
          (el as unknown as { placeholder?: string }).placeholder = "Search a city…";
        } catch {
          /* older element versions may not expose placeholder — non-fatal */
        }
        if (initialName && isNamedCity(initialName)) el.value = initialName;
        hostRef.current.appendChild(el);

        el.addEventListener("gmp-select", async (event) => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({ fields: ["displayName", "location", "formattedAddress"] });
          const loc = place.location;
          if (!loc) return;
          onPick({
            cityName: place.displayName ?? place.formattedAddress ?? "",
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
      el?.remove();
    };
    // onPick/initialName are init-time only; matches LocationPicker's one-shot setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div className="w-full rounded-xl border border-slate-200 bg-surface px-3.5 py-2.5 text-sm text-muted">
        City search unavailable
      </div>
    );
  }

  // Solid black rounded border so the search field is clearly visible against
  // the page; comfortable padding, otherwise consistent with app inputs.
  return (
    <div
      ref={hostRef}
      className="w-full rounded-xl border border-black bg-surface px-3.5 py-2.5 focus-within:border-primary"
    />
  );
}
