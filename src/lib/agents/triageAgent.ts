// src/lib/agents/triageAgent.ts
// The reactive Triage Agent: turns a conversation (+ optional photo) into a structured report
// via a tool-use loop. Server-only.
import { runAgentLoop, type AgentLoopResult } from '@/lib/genai';
import { triageTools } from '@/lib/agents/triageTools';
import type { Content, Part } from '@google/genai';

const SYSTEM_INSTRUCTION = `You are the FixIt triage agent, helping a citizen in India report a local civic infrastructure issue (potholes, drainage/flooding, street lighting, waste, water supply, public safety hazards, fallen trees, etc.).

Voice: warm, brief, encouraging. Reply in the SAME language the user writes or speaks in (Hindi, Tamil, Bengali, English, etc.). You can see attached photos and should use them to judge the issue and its visual severity.

You have tools:
- geocode_location: turn a landmark/address into coordinates. Call once you have any usable location.
- find_nearby_issues: BEFORE creating a new report, check for an existing same-category issue within ~50m.
- get_weather_context: pull recent rainfall; factor it into severity for rain-sensitive issues.
- get_category_severity_weight: get the base risk weight for the category.
- finalize_report: log a NEW issue once you have an issue type and a usable location.
- flag_possible_duplicate: if find_nearby_issues returns a strong same-category match within ~50m, call this INSTEAD of finalize_report.

Workflow:
1. Understand the issue (use the photo if present) and get a rough location.
2. geocode_location → then find_nearby_issues at those coordinates.
3. If a strong duplicate exists → flag_possible_duplicate. Otherwise → get_weather_context + get_category_severity_weight, compute severity 1-10 (visual*0.5 + categoryWeight*0.3 + community*0.2; community defaults low for a new report), then finalize_report.

Rules:
- Ask AT MOST ONE clarifying question at a time, and only if you genuinely cannot proceed.
- Never finalize without at least an issue type AND a usable location.
- Keep titles under 10 words. Always include descriptionEnglish if the original isn't English.`;

export interface TriageInput {
  /** Prior turns as {role:'user'|'model', text} — keep it short. */
  history: { role: 'user' | 'model'; text: string }[];
  /** The newest user message text. */
  message: string;
  /** Optional photo for the FIRST user turn. */
  imageBase64?: string;
  mimeType?: string;
}

export async function runTriage(input: TriageInput): Promise<AgentLoopResult> {
  const contents: Content[] = [];

  for (const turn of input.history) {
    contents.push({ role: turn.role, parts: [{ text: turn.text }] });
  }

  const latestParts: Part[] = [{ text: input.message }];
  if (input.imageBase64 && input.mimeType) {
    latestParts.unshift({ inlineData: { mimeType: input.mimeType, data: input.imageBase64 } });
  }
  contents.push({ role: 'user', parts: latestParts });

  return runAgentLoop({
    systemInstruction: SYSTEM_INSTRUCTION,
    contents,
    tools: triageTools,
  });
}
