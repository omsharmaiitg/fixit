// Problem Zone detection + AI enrichment (Watchtower step b). Deterministic
// clustering first, then one Gemini line per zone. Build-safe: no Gemini call
// at import — only inside enrichProblemZoneWithAI.
import { doc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { haversineDistance, stripUndefined } from "@/lib/firebaseHelpers";
import { generateStructured } from "@/lib/genai";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { Issue, IssueCategory, ProblemZone } from "@/types";

const CLUSTER_RADIUS_M = 200;
const MIN_CLUSTER = 3;

const isOpen = (i: Issue) => i.status !== "resolved";

// Greedy single-link clustering: each open issue seeds a cluster and pulls in
// every other open issue within ~200m. Small corpus → O(n²) is fine.
// ponytail: O(n²) scan; swap for a grid index only if the corpus gets large.
export function detectProblemZones(issues: Issue[]): ProblemZone[] {
  const open = issues.filter(isOpen);
  const used = new Set<string>();
  const zones: ProblemZone[] = [];

  for (const seed of open) {
    if (used.has(seed.id)) continue;
    const cluster = [seed];
    used.add(seed.id);
    for (const other of open) {
      if (used.has(other.id)) continue;
      const d = haversineDistance(
        seed.location.lat,
        seed.location.lng,
        other.location.lat,
        other.location.lng,
      );
      if (d <= CLUSTER_RADIUS_M) {
        cluster.push(other);
        used.add(other.id);
      }
    }
    if (cluster.length >= MIN_CLUSTER) zones.push(buildZone(cluster));
  }

  return zones;
}

function buildZone(cluster: Issue[]): ProblemZone {
  const centerLat = cluster.reduce((a, i) => a + i.location.lat, 0) / cluster.length;
  const centerLng = cluster.reduce((a, i) => a + i.location.lng, 0) / cluster.length;

  const counts = new Map<IssueCategory, number>();
  for (const i of cluster) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const combinedPressure = Math.min(
    Math.round(cluster.reduce((a, i) => a + i.pressureScore, 0)),
    100,
  );

  return {
    // Deterministic id keyed on the centroid so re-runs merge instead of duplicate.
    id: `zone_${centerLat.toFixed(3)}_${centerLng.toFixed(3)}`,
    centerLat,
    centerLng,
    issueIds: cluster.map((i) => i.id),
    primaryCategory: ranked[0][0],
    secondaryCategory: ranked[1]?.[0],
    combinedPressure,
    detectedAt: new Date(),
  };
}

export async function enrichProblemZoneWithAI(
  zone: ProblemZone,
  issues: Issue[],
): Promise<ProblemZone> {
  const zoneIssues = issues.filter((i) => zone.issueIds.includes(i.id));
  if (zoneIssues.length === 0) return zone;

  const list = zoneIssues
    .map((i) => `- ${CATEGORY_LABELS[i.category]} (severity ${i.severity}/10, ${i.status})`)
    .join("\n");
  const area = zoneIssues[0].location.address;

  const result = await generateStructured<{ analysis: string }>({
    systemInstruction:
      "You are an urban-planning analyst for an Indian municipality. Be specific, factual, and concise.",
    prompt: `A cluster of ${zoneIssues.length} open civic issues sits within ~200m near ${area}:\n${list}\n\nWrite ONE sentence (max 25 words) naming the likely shared root cause and what is at stake if it is left unaddressed.`,
    responseSchema: {
      type: "object",
      properties: { analysis: { type: "string" } },
      required: ["analysis"],
    },
  });

  return { ...zone, aiAnalysis: result.analysis };
}

export async function saveProblemZones(zones: ProblemZone[]): Promise<void> {
  const db = getDb();
  await Promise.all(
    zones.map((z) => {
      const { id, ...rest } = z;
      return setDoc(doc(db, "problemZones", id), stripUndefined(rest), { merge: true });
    }),
  );
}
