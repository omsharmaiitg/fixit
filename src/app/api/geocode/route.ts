import { NextResponse } from "next/server";

// Reverse-geocode lat/lng → a human locality/ward, server-side so the
// GOOGLE_GEOCODING_KEY never reaches the browser (server-only).
// Phase 3's LocationPicker reverse-geocodes through this same route.
export const dynamic = "force-dynamic";

type AddressComponent = { long_name: string; short_name: string; types: string[] };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const key = process.env.GOOGLE_GEOCODING_KEY;
  // No key configured yet (e.g. local dev) — degrade gracefully, don't 500.
  if (!key) {
    return NextResponse.json({ locality: null, address: null });
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) {
      return NextResponse.json({ locality: null, address: null });
    }

    const comps: AddressComponent[] = result.address_components ?? [];
    const pick = (...types: string[]) =>
      comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? null;

    // Prefer the most neighbourhood-level name available (Indian addresses
    // usually carry the ward under sublocality_level_1), widening outward.
    const locality =
      pick("neighborhood", "sublocality_level_1", "sublocality") ??
      pick("locality") ??
      pick("administrative_area_level_2") ??
      null;

    // City-level name (one rung up from the ward) for the city model.
    const city =
      pick("locality") ??
      pick("postal_town") ??
      pick("administrative_area_level_2") ??
      pick("administrative_area_level_1") ??
      null;

    // State/region — used to build a confident "City, State" greeting label.
    const region = pick("administrative_area_level_1");

    return NextResponse.json({
      locality,
      city,
      region,
      address: result.formatted_address ?? null,
    });
  } catch {
    return NextResponse.json({ locality: null, city: null, region: null, address: null });
  }
}
