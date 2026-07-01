// src/lib/agents/triageTools.ts
// Server-side tools the Triage Agent can call. Each pairs a Gemini function declaration with a run().
// Reads Firestore via the client SDK (fine for hackathon-scale reads). Server-only.
import type { AgentTool } from '@/lib/genai';
import { collection, getDocs } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { haversineDistance } from '@/lib/firebaseHelpers';
import { CATEGORY_BASE_WEIGHT } from '@/lib/constants'; // { road_damage: 8, drainage_flooding: 7, ... }

// ---- geocode_location ------------------------------------------------------
const geocodeLocation: AgentTool = {
  declaration: {
    name: 'geocode_location',
    description:
      'Convert a landmark, address, or place description into latitude/longitude coordinates. Call this once you have any usable location text from the user.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Landmark or address, e.g. 'near Blue Bell School, Sector 9, Gurugram'" },
      },
      required: ['query'],
    },
  },
  run: async (args) => {
    const query = String(args.query ?? '');
    const key = process.env.GOOGLE_GEOCODING_KEY;
    // No key = infra not addressable → treat as unavailable, route to the map pin.
    if (!key) return { found: false, unavailable: true, status: 'NO_KEY' };
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=in&key=${key}`;
    let data: { status?: string; error_message?: string; results?: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }> };
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch {
      // Network/parse failure talking to Google — an API error, not a bad address.
      return { found: false, unavailable: true, status: 'FETCH_FAILED' };
    }
    console.error('[geocode]', data.status, data.error_message);
    const top = data.results?.[0];
    if (data.status === 'OK' && top) {
      return {
        found: true,
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
        address: top.formatted_address,
      };
    }
    // A genuine "no match for this address" — the address text is the problem.
    if (data.status === 'ZERO_RESULTS') return { found: false };
    // Anything else (OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, quota/
    // billing) is an API/infra error, NOT a bad address. Signal the agent to
    // stop asking for addresses and hand off to the map pin instead.
    return { found: false, unavailable: true, status: data.status ?? 'UNKNOWN' };
  },
};

// ---- find_nearby_issues ----------------------------------------------------
const findNearbyIssues: AgentTool = {
  declaration: {
    name: 'find_nearby_issues',
    description:
      'Search for existing reported issues near a coordinate. Use BEFORE creating a new report to detect duplicates. If a same-category issue exists within ~50m, prefer flag_possible_duplicate over creating a new one.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number' },
        lng: { type: 'number' },
        radiusM: { type: 'number', description: 'Search radius in metres (default 80)' },
        category: { type: 'string', description: 'Optional category to match' },
      },
      required: ['lat', 'lng'],
    },
  },
  run: async (args) => {
    const lat = Number(args.lat);
    const lng = Number(args.lng);
    const radiusM = Number(args.radiusM ?? 80);
    const category = args.category ? String(args.category) : null;

    // Small dataset → fetch all and filter in memory (no geo-index needed for a hackathon).
    const snap = await getDocs(collection(getDb(), 'issues'));
    const nearby = snap.docs
      .map((d): Record<string, unknown> & { id: string } => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      }))
      .map((i): Record<string, unknown> & { id: string; distanceM: number } => {
        const loc = i.location as { lat: number; lng: number } | undefined;
        const distanceM = loc ? haversineDistance(lat, lng, loc.lat, loc.lng) * 1000 : Infinity;
        return { ...i, distanceM };
      })
      .filter((i) => (i.distanceM as number) <= radiusM)
      .filter((i) => (category ? i.category === category : true))
      .filter((i) => i.status !== 'resolved')
      .sort((a, b) => (a.distanceM as number) - (b.distanceM as number))
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        status: i.status,
        upvoteCount: i.upvoteCount ?? 0,
        distanceM: Math.round(i.distanceM as number),
      }));

    return { count: nearby.length, issues: nearby };
  },
};

// ---- get_weather_context ---------------------------------------------------
const getWeatherContext: AgentTool = {
  declaration: {
    name: 'get_weather_context',
    description:
      'Get recent rainfall and current conditions for a coordinate. Use this to factor weather into severity for rain-sensitive issues (potholes, drainage, exposed wiring).',
    parametersJsonSchema: {
      type: 'object',
      properties: { lat: { type: 'number' }, lng: { type: 'number' } },
      required: ['lat', 'lng'],
    },
  },
  run: async (args) => {
    const lat = Number(args.lat);
    const lng = Number(args.lng);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&past_days=2&forecast_days=1`;
      const res = await fetch(url);
      const data = await res.json();
      const precip: number[] = data.hourly?.precipitation ?? [];
      const last48 = precip.slice(-48).reduce((s, p) => s + (p || 0), 0);
      const rainfall48h = last48 > 5;
      return {
        rainfall48h,
        totalMm: Math.round(last48 * 10) / 10,
        condition: rainfall48h ? 'rainy' : 'dry',
        description: rainfall48h
          ? `Significant rainfall in last 48h (${Math.round(last48)}mm)`
          : 'No significant recent rainfall',
      };
    } catch {
      return { rainfall48h: false, condition: 'unknown', description: 'Weather data unavailable' };
    }
  },
};

// ---- get_category_severity_weight ------------------------------------------
const getCategorySeverityWeight: AgentTool = {
  declaration: {
    name: 'get_category_severity_weight',
    description: 'Look up the base risk weight (1-10) for an issue category, used in the severity formula.',
    parametersJsonSchema: {
      type: 'object',
      properties: { category: { type: 'string' } },
      required: ['category'],
    },
  },
  run: async (args) => {
    const category = String(args.category ?? '');
    const weight = (CATEGORY_BASE_WEIGHT as Record<string, number>)[category] ?? 5;
    return { category, baseWeight: weight };
  },
};

// ---- finalize_report (terminal) --------------------------------------------
const finalizeReport: AgentTool = {
  declaration: {
    name: 'finalize_report',
    description:
      'Call when you have enough to log a NEW issue: an issue type and a usable location. Returns the draft to the user for confirmation. Do NOT call if a strong duplicate exists — use flag_possible_duplicate instead. If geocode_location reported that address lookup is unavailable, OMIT lat/lng — the user will drop a pin on the map to set the exact spot.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'One of: road_damage, drainage_flooding, street_lighting, waste_management, water_supply, public_safety, tree_hazard, other',
        },
        severity: { type: 'number', description: '1-10, computed as visual*0.5 + categoryWeight*0.3 + community*0.2' },
        title: { type: 'string', description: 'Short title, under 10 words' },
        description: { type: 'string', description: 'Clear description in English' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        address: { type: 'string' },
      },
      // lat/lng are omitted when geocoding is unavailable — the user pins the spot on the map.
      required: ['category', 'severity', 'title'],
    },
  },
  run: async (args) => ({ ok: true, draft: args }), // no DB write — client confirms first
};

// ---- flag_possible_duplicate (terminal) ------------------------------------
const flagPossibleDuplicate: AgentTool = {
  declaration: {
    name: 'flag_possible_duplicate',
    description:
      "Call instead of finalize_report when find_nearby_issues returned a strong same-category match within ~50m. The user's photo/confirmation will be added as evidence to the existing issue.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        confidence: { type: 'string', description: 'high | medium | low' },
        reason: { type: 'string' },
      },
      required: ['issueId', 'confidence'],
    },
  },
  run: async (args) => ({ ok: true, flagged: args }),
};

export const triageTools: AgentTool[] = [
  geocodeLocation,
  findNearbyIssues,
  getWeatherContext,
  getCategorySeverityWeight,
  finalizeReport,
  flagPossibleDuplicate,
];
