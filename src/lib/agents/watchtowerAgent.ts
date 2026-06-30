// The proactive Watchtower Agent. One run, server-side, triggered by Cloud
// Scheduler (or the admin "Run Watchtower Now" button). Every step is wrapped
// so one failure doesn't kill the rest of the run. Build-safe: no Gemini call
// at import — generateStructured constructs the client lazily.
import { collection, doc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { issueFromSnapshot, stripUndefined } from "@/lib/firebaseHelpers";
import { calculatePressureScore, getAgingStatus, daysSince } from "@/lib/pressureScore";
import { generateStructured } from "@/lib/genai";
import {
  detectProblemZones,
  enrichProblemZoneWithAI,
  saveProblemZones,
} from "@/lib/problemZones";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { EscalationMemo, Issue, IssueCategory, PredictedHotspot } from "@/types";

export interface WatchtowerSummary {
  ranAt: string;
  issuesScored: number;
  zonesDetected: number;
  hotspotsPredicted: number;
  reportGenerated: boolean;
  escalationsDrafted: number;
  errors: string[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as IssueCategory[];
const asCategory = (raw: string): IssueCategory => {
  const k = (raw ?? "").trim().toLowerCase();
  return (VALID_CATEGORIES as string[]).includes(k) ? (k as IssueCategory) : "other";
};

const ESCALATION_PRESSURE = 70;
const ESCALATION_MIN_AGE_DAYS = 7;
const MAX_ESCALATIONS = 5; // cap Gemini work per run

// Stable, filesystem-safe key from a city name (for per-city doc ids).
const citySlug = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
  "unknown";

function distinctCityNames(issues: Issue[]): string[] {
  const set = new Set<string>();
  for (const i of issues) {
    const c = i.cityName?.trim();
    if (c) set.add(c);
  }
  return [...set];
}

// The active city to scope this run to. When omitted (e.g. a global scheduler
// run), the Watchtower produces one report + hotspot set per distinct city.
export interface WatchtowerCity {
  cityName: string;
  cityLat?: number;
  cityLng?: number;
}

export async function runWatchtower(
  activeCity?: WatchtowerCity,
): Promise<WatchtowerSummary> {
  const db = getDb();
  const summary: WatchtowerSummary = {
    ranAt: new Date().toISOString(),
    issuesScored: 0,
    zonesDetected: 0,
    hotspotsPredicted: 0,
    reportGenerated: false,
    escalationsDrafted: 0,
    errors: [],
  };

  // Load the corpus once.
  let issues: Issue[];
  try {
    const snap = await getDocs(collection(db, "issues"));
    issues = snap.docs.map((d) => issueFromSnapshot(d.id, d.data()));
  } catch (e) {
    summary.errors.push(`load issues: ${msg(e)}`);
    return summary; // nothing else is possible without the corpus
  }

  const openIssues = issues.filter((i) => i.status !== "resolved");

  // (a) Recompute pressure + aging for every open issue, batch write.
  try {
    const batch = writeBatch(db);
    for (const issue of openIssues) {
      const { score, breakdown } = calculatePressureScore(issue);
      const agingStatus = getAgingStatus(issue.reportedAt);
      // Mutate the in-memory copy so later steps see fresh scores.
      issue.pressureScore = score;
      issue.pressureBreakdown = breakdown;
      issue.agingStatus = agingStatus;
      batch.update(doc(db, "issues", issue.id), {
        pressureScore: score,
        pressureBreakdown: breakdown,
        agingStatus,
      });
    }
    await batch.commit();
    summary.issuesScored = openIssues.length;
  } catch (e) {
    summary.errors.push(`scoring: ${msg(e)}`);
  }

  // (b) Detect + enrich + save Problem Zones.
  try {
    const zones = detectProblemZones(issues);
    const enriched = await Promise.all(
      zones.map((z) => enrichProblemZoneWithAI(z, issues).catch(() => z)),
    );
    await saveProblemZones(enriched);
    summary.zonesDetected = enriched.length;
  } catch (e) {
    summary.errors.push(`zones: ${msg(e)}`);
  }

  // (c)+(d) Per-city intelligence: hotspot forecasts + the weekly civic report,
  // each scoped to issues whose cityName matches — so a city never shows another
  // city's data. The caller's active city scopes a manual run; a global run
  // produces one set per distinct city. Outputs carry cityName and are keyed per
  // city so cities never overwrite or borrow each other's record.
  const targetCities = activeCity?.cityName
    ? [activeCity.cityName]
    : distinctCityNames(issues);
  const today = new Date().toISOString().slice(0, 10);

  for (const cityName of targetCities) {
    const cityIssues = issues.filter((i) => i.cityName === cityName);
    if (cityIssues.length === 0) continue; // empty city → no borrowed data

    // (c) Predict up to 3 hotspots from this city's 30-day corpus.
    try {
      const hotspots = await predictHotspots(cityIssues, cityName);
      await Promise.all(
        hotspots.map((h) => {
          const { id, ...rest } = h;
          return setDoc(doc(db, "hotspots", id), stripUndefined(rest), { merge: true });
        }),
      );
      summary.hotspotsPredicted += hotspots.length;
    } catch (e) {
      summary.errors.push(`hotspots (${cityName}): ${msg(e)}`);
    }

    // (d) Weekly civic report for this city.
    try {
      const report = await generateWeeklyReport(cityIssues);
      const id = `report-${citySlug(cityName)}-${today}`;
      await setDoc(
        doc(db, "reports", id),
        stripUndefined({ ...report, cityName, generatedAt: new Date() }),
        { merge: true },
      );
      summary.reportGenerated = true;
    } catch (e) {
      summary.errors.push(`report (${cityName}): ${msg(e)}`);
    }
  }

  // (e) Escalation memos for neglected, high-pressure, unacknowledged issues.
  try {
    const candidates = openIssues
      .filter(
        (i) =>
          i.pressureScore >= ESCALATION_PRESSURE &&
          (i.status === "reported" || i.status === "verified") &&
          daysSince(i.reportedAt) >= ESCALATION_MIN_AGE_DAYS,
      )
      .sort((a, b) => b.pressureScore - a.pressureScore)
      .slice(0, MAX_ESCALATIONS);

    for (const issue of candidates) {
      try {
        const escalation = await draftEscalation(issue);
        await updateDoc(doc(db, "issues", issue.id), {
          escalation: stripUndefined(escalation),
        });
        summary.escalationsDrafted += 1;
      } catch (e) {
        summary.errors.push(`escalation ${issue.id}: ${msg(e)}`);
      }
    }
  } catch (e) {
    summary.errors.push(`escalations: ${msg(e)}`);
  }

  return summary;
}

// ─── Gemini-backed steps (structured output) ─────────────────────────────────

async function predictHotspots(
  issues: Issue[],
  cityName?: string,
): Promise<PredictedHotspot[]> {
  const recent = issues.filter((i) => daysSince(i.reportedAt) <= 30);
  if (recent.length < 3) return [];

  const corpus = recent
    .map(
      (i) =>
        `${CATEGORY_LABELS[i.category]} @ (${i.location.lat.toFixed(4)},${i.location.lng.toFixed(4)}) severity ${i.severity} status ${i.status}`,
    )
    .join("\n");

  const result = await generateStructured<{
    hotspots: {
      lat: number;
      lng: number;
      category: string;
      riskLevel: string;
      reasoning: string;
      radiusM?: number;
    }[];
  }>({
    systemInstruction:
      "You are a predictive civic-infrastructure analyst. Use spatial clustering and category patterns to forecast where NEW issues are likely to emerge next week. Be conservative and specific.",
    prompt: `Recent civic issues (last 30 days):\n${corpus}\n\nPredict up to 3 areas most likely to see a new issue next week. For each give a coordinate inside the cluster, the most likely category, a risk level (low/medium/high), a one-sentence reason, and a radius in metres.`,
    responseSchema: {
      type: "object",
      properties: {
        hotspots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              lat: { type: "number" },
              lng: { type: "number" },
              category: { type: "string" },
              riskLevel: { type: "string", enum: ["low", "medium", "high"] },
              reasoning: { type: "string" },
              radiusM: { type: "number" },
            },
            required: ["lat", "lng", "category", "riskLevel", "reasoning"],
          },
        },
      },
      required: ["hotspots"],
    },
  });

  const prefix = cityName ? `${citySlug(cityName)}_` : "";
  return (result.hotspots ?? []).slice(0, 3).map((h) => ({
    id: `hotspot_${prefix}${Number(h.lat).toFixed(3)}_${Number(h.lng).toFixed(3)}`,
    lat: Number(h.lat),
    lng: Number(h.lng),
    category: asCategory(h.category),
    riskLevel: (["low", "medium", "high"].includes(h.riskLevel)
      ? h.riskLevel
      : "medium") as PredictedHotspot["riskLevel"],
    reasoning: h.reasoning,
    radiusM: Number(h.radiusM ?? 200),
    predictedAt: new Date(),
    ...(cityName ? { cityName } : {}),
  }));
}

interface WeeklyReport {
  glance: string;
  highlight: string;
  theShame: string;
  topContributor: string;
  nextWeekWatch: string;
  verdict: string;
}

async function generateWeeklyReport(issues: Issue[]): Promise<WeeklyReport> {
  const open = issues.filter((i) => i.status !== "resolved");
  const resolved = issues.filter((i) => i.status === "resolved");
  const critical = open.filter((i) => i.pressureScore >= 70);
  const worst = [...open].sort((a, b) => b.pressureScore - a.pressureScore)[0];

  // Top contributor by report count.
  const tally = new Map<string, number>();
  for (const i of issues) tally.set(i.reporterName, (tally.get(i.reporterName) ?? 0) + 1);
  const topContributor = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];

  const stats = `Open issues: ${open.length}. Resolved: ${resolved.length}. Critical (pressure>=70): ${critical.length}. Highest-pressure issue: ${worst ? `"${worst.title}" (${worst.pressureScore})` : "none"}. Most active reporter: ${topContributor ? `${topContributor[0]} (${topContributor[1]} reports)` : "none"}.`;

  return generateStructured<WeeklyReport>({
    systemInstruction:
      "You write a factual weekly civic accountability report for a city ward. Tone: clear, fair, a little punchy. Base every line strictly on the stats provided — never invent numbers.",
    prompt: `Stats for this week:\n${stats}\n\nWrite the weekly report with these fields: glance (a one-line state of the ward), highlight (the most encouraging fact), theShame (the most neglected/highest-pressure issue and how long it has festered), topContributor (credit the most active citizen), nextWeekWatch (what to watch), verdict (one blunt closing line).`,
    responseSchema: {
      type: "object",
      properties: {
        glance: { type: "string" },
        highlight: { type: "string" },
        theShame: { type: "string" },
        topContributor: { type: "string" },
        nextWeekWatch: { type: "string" },
        verdict: { type: "string" },
      },
      required: ["glance", "highlight", "theShame", "topContributor", "nextWeekWatch", "verdict"],
    },
  });
}

async function draftEscalation(issue: Issue): Promise<EscalationMemo> {
  const { body } = await generateStructured<{ body: string }>({
    systemInstruction:
      "You draft formal escalation memos a citizens' group would send to a municipal authority. Firm, factual, respectful. 4-6 sentences.",
    prompt: `Draft an escalation memo for this neglected issue:\nTitle: ${issue.title}\nCategory: ${CATEGORY_LABELS[issue.category]}\nSeverity: ${issue.severity}/10\nLocation: ${issue.location.address}\nReported: ${Math.round(daysSince(issue.reportedAt))} days ago\nStatus: ${issue.status} (still unacknowledged)\nPressure score: ${issue.pressureScore}/100\n\nReference the age, the pressure score, and the public-safety stakes. Request acknowledgement and a timeline.`,
    responseSchema: {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    },
  });

  return {
    issueId: issue.id,
    draftedAt: new Date(),
    body,
    pressureAtDraft: issue.pressureScore,
  };
}
