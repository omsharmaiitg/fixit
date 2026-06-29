// src/app/api/triage/route.ts
// POST endpoint for the Triage Agent. Runs server-side so GEMINI_API_KEY never reaches the browser.
import { NextRequest, NextResponse } from 'next/server';
import { runTriage } from '@/lib/agents/triageAgent';
import { isModelBusyError } from '@/lib/genai';

export const runtime = 'nodejs'; // needs Node (Firestore SDK, fetch to Google APIs)
// Never evaluate this route during static page-data collection at build time
// (it would init Gemini/Firestore with no env vars present).
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const history = Array.isArray(body.history) ? body.history : [];
    const message = String(body.message ?? '');
    const imageBase64 = body.imageBase64 ? String(body.imageBase64) : undefined;
    const mimeType = body.mimeType ? String(body.mimeType) : undefined;

    if (!message && !imageBase64) {
      return NextResponse.json({ error: 'Provide a message or an image.' }, { status: 400 });
    }

    const result = await runTriage({ history, message, imageBase64, mimeType });

    // Shape for the UI:
    // - text: assistant's reply (a question, or empty if it took a final action)
    // - toolCalls: render as visible "reasoning" status lines (the Agentic Depth demo)
    // - finalAction: { name:'finalize_report'|'flag_possible_duplicate', args } when the agent acted
    return NextResponse.json({
      text: result.text,
      toolCalls: result.toolCalls.map((c) => ({ name: c.name, args: c.args })),
      finalAction: result.finalAction ?? null,
    });
  } catch (err) {
    console.error('[/api/triage]', err);
    // Still overloaded/rate-limited after retries → soft, retry-able message.
    if (isModelBusyError(err)) {
      return NextResponse.json(
        { error: 'The assistant is briefly busy. Tap to retry.', retriable: true },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'triage failed' },
      { status: 500 },
    );
  }
}
