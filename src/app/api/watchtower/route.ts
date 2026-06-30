// src/app/api/watchtower/route.ts
// POST endpoint for the Watchtower Agent. Cloud Scheduler (or the admin button)
// calls it with the shared x-watchtower-secret header. Server-only.
import { NextRequest, NextResponse } from "next/server";
import { runWatchtower, type WatchtowerCity } from "@/lib/agents/watchtowerAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-watchtower-secret");
  const expected = process.env.WATCHTOWER_SECRET;

  // Fail closed: no secret configured, or mismatch → unauthorized.
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Optional active-city scope from the body. No/invalid body → global run
  // (one report + hotspot set per distinct city in the corpus).
  let activeCity: WatchtowerCity | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.cityName === "string" && body.cityName.trim()) {
      activeCity = {
        cityName: body.cityName.trim(),
        cityLat: typeof body.cityLat === "number" ? body.cityLat : undefined,
        cityLng: typeof body.cityLng === "number" ? body.cityLng : undefined,
      };
    }
  } catch {
    /* no JSON body — run globally */
  }

  try {
    const summary = await runWatchtower(activeCity);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[/api/watchtower]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "watchtower failed" },
      { status: 500 },
    );
  }
}
