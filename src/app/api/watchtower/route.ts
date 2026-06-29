// src/app/api/watchtower/route.ts
// POST endpoint for the Watchtower Agent. Cloud Scheduler (or the admin button)
// calls it with the shared x-watchtower-secret header. Server-only.
import { NextRequest, NextResponse } from "next/server";
import { runWatchtower } from "@/lib/agents/watchtowerAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-watchtower-secret");
  const expected = process.env.WATCHTOWER_SECRET;

  // Fail closed: no secret configured, or mismatch → unauthorized.
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runWatchtower();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[/api/watchtower]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "watchtower failed" },
      { status: 500 },
    );
  }
}
