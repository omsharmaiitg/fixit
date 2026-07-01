"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MapPin, Check } from "lucide-react";

// Public, HTTP-referrer-restricted browser key — safe to ship in the bundle.
// Hardcoded fallback because Cloud Build doesn't inject NEXT_PUBLIC_* vars.
const BROWSER_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
  "AIzaSyDkg660heloGDUcAvrJ4-qwVXZ1SmTambo";

// Reverse-geocode through the server route so the geocoding key stays server-side.
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
    const d = await r.json();
    return d.address ?? d.locality ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export function LocationPicker({
  initialLat,
  initialLng,
  initialAddress,
  onConfirm,
}: {
  initialLat: number;
  initialLng: number;
  initialAddress?: string;
  onConfirm: (lat: number, lng: number, address: string) => void;
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  const [coords, setCoords] = useState({ lat: initialLat, lng: initialLng });
  const [address, setAddress] = useState(initialAddress ?? "");
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(!BROWSER_KEY);

  useEffect(() => {
    if (!BROWSER_KEY || !mapDivRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        setOptions({ key: BROWSER_KEY });
        const { Map } = await importLibrary("maps");
        const { Marker } = await importLibrary("marker");
        if (cancelled || !mapDivRef.current) return;

        const center = { lat: initialLat, lng: initialLng };
        const map = new Map(mapDivRef.current, {
          center,
          zoom: 16,
          // Show the +/- zoom buttons; keep the rest of the default chrome off.
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy", // pinch/scroll zoom without ctrl/two-finger
          clickableIcons: false,
        });

        const marker = new Marker({ position: center, map, draggable: true });
        markerRef.current = marker;

        const applyPosition = async (lat: number, lng: number) => {
          setCoords({ lat, lng });
          const addr = await reverseGeocode(lat, lng);
          if (!cancelled) setAddress(addr);
        };

        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (pos) applyPosition(pos.lat(), pos.lng());
        });

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          applyPosition(e.latLng.lat(), e.latLng.lng());
        });

        setMapReady(true);
        // Seed the address if the agent didn't give us one.
        if (!initialAddress) applyPosition(initialLat, initialLng);
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // initial* are the starting point only — we don't re-init on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {/* map or fallback */}
      {mapFailed ? (
        <div className="flex h-[180px] flex-col items-center justify-center rounded-2xl bg-slate-100 px-6 text-center">
          <MapPin size={26} className="text-primary" />
          <p className="mt-2 text-sm font-medium text-foreground">
            Using the AI-detected location
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl">
          <div ref={mapDivRef} className="h-[240px] w-full bg-slate-100" />
          {mapReady && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-foreground/80 px-3 py-1 text-[11px] font-medium text-white">
              Auto-detected — drag the pin to correct
            </div>
          )}
        </div>
      )}

      {/* resolved address */}
      <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm">
        <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
        <span className="text-foreground">
          {address || "Pinpointing address…"}
        </span>
      </div>

      <button
        onClick={() =>
          onConfirm(
            coords.lat,
            coords.lng,
            address || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
          )
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-display font-bold text-white transition active:scale-[0.98]"
      >
        <Check size={18} strokeWidth={2.5} />
        Confirm this location
      </button>
    </div>
  );
}
