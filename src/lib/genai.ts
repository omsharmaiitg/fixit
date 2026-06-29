// src/lib/genai.ts
// Verified against @google/genai v2.10 (gemini-2.5-flash). Server-only — never import into a client component.
import { GoogleGenAI, type Content, type Part } from '@google/genai';

// Constructed lazily on first use, never at module load — the container build
// runs `next build` with no GEMINI_API_KEY present, and evaluating this module
// during page-data collection must not fail.
let _ai: GoogleGenAI | undefined;
function getAI(): GoogleGenAI {
  if (_ai) return _ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

/** Always read the model from env so the Oct-2026 cutover is a one-line change. Never hardcode. */
export const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * True for transient "model is busy" failures worth retrying / surfacing softly:
 * 503 UNAVAILABLE (overloaded) and 429 RESOURCE_EXHAUSTED (rate limited).
 * The route handler uses this to show a friendly "tap to retry" instead of a raw error.
 */
export function isModelBusyError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; code?: number; message?: string };
  const status = e.status ?? e.code;
  if (status === 503 || status === 429) return true;
  const msg = (e.message ?? String(err)).toUpperCase();
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('OVERLOADED') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

const RETRY_DELAYS_MS = [500, 1000, 2000]; // exponential backoff before each retry

/** generateContent with up to 3 retries (exp. backoff) on transient 503/429 errors. */
async function generateContentWithRetry(
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await getAI().models.generateContent(params);
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length && isModelBusyError(err)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** A tool the agent can call. `run` executes server-side and returns JSON-serializable data. */
export interface AgentTool {
  // Function declaration sent to Gemini (uses parametersJsonSchema per v2.10 SDK).
  declaration: {
    name: string;
    description: string;
    parametersJsonSchema: Record<string, unknown>;
  };
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AgentLoopResult {
  /** Final natural-language message from the model (a question or a wrap-up). */
  text: string;
  /** Every tool call made, in order — render these as visible "reasoning" status lines in the UI. */
  toolCalls: ToolCallRecord[];
  /** Convenience: the args of the last finalize_report / flag_possible_duplicate call, if any. */
  finalAction?: { name: string; args: Record<string, unknown> };
}

/**
 * Run a multi-step function-calling loop. Sends `contents`, executes any tool calls the model
 * requests, feeds results back, and repeats until the model returns plain text or hits maxTurns.
 *
 * IMPORTANT (per @google/genai docs): when sending FunctionCall / FunctionResponse parts you must
 * provide the full Content[] with explicit roles. We append the model's own content (preserving
 * functionCall parts + thought signatures) then a user turn carrying the functionResponse parts.
 */
export async function runAgentLoop(opts: {
  systemInstruction: string;
  contents: Content[];
  tools: AgentTool[];
  maxTurns?: number;
  finalToolNames?: string[]; // tools that end the loop immediately when called
}): Promise<AgentLoopResult> {
  const { systemInstruction, tools, maxTurns = 6 } = opts;
  const finalToolNames = opts.finalToolNames ?? ['finalize_report', 'flag_possible_duplicate'];
  const contents: Content[] = [...opts.contents];
  const toolCalls: ToolCallRecord[] = [];
  const toolByName = new Map(tools.map((t) => [t.declaration.name, t]));

  // Gemini can emit conversational text AND a function call in the same turn.
  // We must not lose that text — otherwise the chat shows tool-call status lines
  // but the assistant's actual reply never appears. Carry the latest text forward.
  let lastText = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await generateContentWithRetry({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: tools.map((t) => t.declaration) }],
        temperature: 0.2,
      },
    });

    if (response.text) lastText = response.text;

    const calls = response.functionCalls ?? [];

    // No tool calls → the model is talking to the user. We're done this turn.
    if (calls.length === 0) {
      return { text: response.text || lastText, toolCalls };
    }

    // Preserve the model's turn verbatim (keeps functionCall parts + thoughtSignatures).
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    // Execute each requested tool and collect functionResponse parts.
    const responseParts: Part[] = [];
    let finalAction: AgentLoopResult['finalAction'] | undefined;

    for (const call of calls) {
      const name = call.name ?? '';
      const args = (call.args ?? {}) as Record<string, unknown>;
      const tool = toolByName.get(name);

      let result: unknown;
      if (!tool) {
        result = { error: `Unknown tool: ${name}` };
      } else {
        try {
          result = await tool.run(args);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : 'tool execution failed' };
        }
      }

      toolCalls.push({ name, args, result });
      responseParts.push({ functionResponse: { name, response: { result } } });

      if (finalToolNames.includes(name)) finalAction = { name, args };
    }

    // A terminal tool was called (finalize / flag) → stop and hand the action
    // back to the caller, along with any wrap-up text the model said with it.
    if (finalAction) {
      return { text: response.text || lastText, toolCalls, finalAction };
    }

    // Feed tool results back to the model and loop.
    contents.push({ role: 'user', parts: responseParts });
  }

  return {
    text:
      lastText ||
      "I have enough to log this, but let's confirm the details on the next screen.",
    toolCalls,
  };
}

/** One-shot structured-output call (used by /api/summary, /api/intel, the Watchtower Agent). */
export async function generateStructured<T>(opts: {
  systemInstruction?: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
}): Promise<T> {
  const response = await generateContentWithRetry({
    model: MODEL,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema: opts.responseSchema,
      temperature: 0.3,
    },
  });
  return JSON.parse(response.text ?? '{}') as T;
}
