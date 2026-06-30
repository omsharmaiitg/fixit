# FixIt — Build Plan (Claude Code)

> Companion to `CLAUDE.md` (conventions, stack, agents, formulas, design) and `fixit_project_doc.md`
> (the narrative + submission doc). **Read `CLAUDE.md` first.** Unlike the old Cursor prompt, you do
> not paste a context block per chat — Claude Code reads `CLAUDE.md` automatically and can see the
> whole repo, run the build, and fix its own errors.

## How to use this with Claude Code
Work **phase by phase**. Each phase is sized to end with a **building, deployable app**. After every
phase: run `npm run build` and `npm run typecheck`, fix everything, redeploy to Cloud Run, and
confirm the public link still works *before* starting the next phase. Tell Claude Code: *"Do Phase N
from `fixit_build_plan.md`. Build, fix all type/build errors, then stop and summarize."*

## Phase overview (re-sequenced for shippability)

| Phase | Goal | Deployable result |
|---|---|---|
| 0 | Scaffold + Cloud Run "hello world" | Public URL that loads. Proves the deploy pipe. |
| 1 | Types, Firebase, helpers, formulas, seed data | App with seeded Firestore; admin can seed/reset. |
| 2 | Home feed + issue detail (read path) | Browse real seeded issues end-to-end. |
| 3 | **Triage Agent** + reporting flow (write path) | Report an issue via the agent → it appears in feed. **Core demo.** |
| 4 | Pressure engine + admin + resolution flow | Full lifecycle: report → verify → acknowledge → resolve. |
| 5 | **Watchtower Agent** + intelligence + dashboard | Zones, hotspots, weekly report, escalations, public dashboard. |
| 6 | Gamification, squads, profiles | Points, badges, squads, adoption, resolution cards. |
| 7 | Offline, multilingual, duplicate-merge, polish, PWA | The hard-to-demo extras, scoped honestly. |

> If you run low on time, **Phases 0–4 are a complete, impressive, deployable submission** on their
> own: the Triage Agent + full issue lifecycle + a working public link already covers all seven
> judging criteria. Phases 5–7 raise the ceiling; they don't gate eligibility.

---

# PHASE 0 — Scaffold & first deploy (do this on day one)

Goal: prove you can deploy to Cloud Run before writing real features.

1. `npx create-next-app@latest` — TypeScript, App Router, Tailwind, `src/` dir, import alias `@/*`.
2. Add `next.config.js` with `output: 'standalone'` and `images.domains`
   `['firebasestorage.googleapis.com','lh3.googleusercontent.com']`.
3. Add a `Dockerfile` (multi-stage, node:20-alpine, standalone output — see Appendix A).
4. Add scripts: `"typecheck": "tsc --noEmit"`.
5. Create `src/lib/firebase.ts` exporting `db`, `auth`, `storage` from the `NEXT_PUBLIC_FIREBASE_*` env.
6. Put a minimal landing page in `src/app/page.tsx`.
7. **Deploy:** `gcloud run deploy fixit --source . --region asia-south1 --allow-unauthenticated`.
8. Commit. **Keep this URL alive for the rest of the hackathon.**

Acceptance: the Cloud Run URL loads in a browser. `npm run build` is clean.

---

# PHASE 1 — Data model, Firebase helpers, formulas, seed data

### File: `src/types/index.ts`
Define every type. (Field list unchanged from the original spec — it's good — reproduced in
Appendix B so this file stays readable.) Key types: `IssueCategory`, `IssueSeverity`, `IssueStatus`,
`AgingStatus`, `Location`, `DNAEntry`, `DiscussionEntry`, `Issue`, `User`, `Badge`, `Squad`,
`ProblemZone`, plus new agent types:
- `TriageToolCall { name: string; args: Record<string, unknown>; result?: unknown }`
- `EscalationMemo { issueId: string; draftedAt: Date; body: string; pressureAtDraft: number }`
- Add `escalation?: EscalationMemo` and `predictedHotspot?: boolean` where relevant.

### File: `src/lib/firebaseHelpers.ts`
All Firestore/Storage ops as named exports. Includes (from the original): `subscribeToIssues`,
`getIssueById`, `createIssue`, `updateIssueStatus`, `upvoteIssue`, `cantFindIssue`, `adoptIssue`,
`addDiscussionEntry`, `appendDNAEntry`, `addIssuePhoto`, `uploadIssuePhoto`, `createOrUpdateUser`,
`getUserById`, `awardPoints`, `awardBadge`, `getAgingStatus`, `getSeverityLabel`, `haversineDistance`.
**Conventions:** convert Firestore `Timestamp` ↔ JS `Date` at the boundary; `appendDNAEntry` uses
`arrayUnion` and is the *only* way DNA is written (append-only).

### File: `src/lib/pressureScore.ts`
`calculatePressureScore(issue)` → `{ score, breakdown }` exactly per `CLAUDE.md` §6. Plus
`getPressureColor`, `getPressureTextColor`, and re-export `getAgingStatus` (keep in sync with helpers).

### File: `src/lib/constants.ts`
`CATEGORY_EMOJIS`, `CATEGORY_LABELS`, `SEVERITY_COLORS`, `AGING_COLORS`, `AGING_LABELS`,
`STATUS_COLORS`, and the **category base-weight matrix** used by severity + the Triage Agent tool.

### File: `src/lib/seedData.ts`
`seedDemoData()` creates the **15 issues** from Appendix C — covering every category and status, with
**realistic historical `reportedAt` timestamps** (spread across the last ~40 days) so the Watchtower
Agent's "30-day" analysis and the aging colors look genuine. Generate appropriate `dna` entries per
issue (every issue ≥ a `reported` entry; advanced-status issues get matching entries). Create 3 seed
squads; cluster issues 1, 9, 11 (road damage, near each other) into one Problem Zone. Guard: if
Firestore already has ≥10 issues, skip (no duplicate seeding on re-run).

### File: `src/app/admin/page.tsx` (stub for now)
Just a "Developer Tools" accordion (collapsed) with **🌱 Seed Demo Data**, **🔄 Recalculate All
Pressure Scores** (fetch all → recompute → batch update), and a **🛰️ Run Watchtower Now** button
(wired in Phase 5). The full admin dashboard comes in Phase 4.

### Firestore security rules (`firestore.rules`)
Do **not** ship open rules. Minimum viable: signed-in users can create issues and append upvotes /
discussion / DNA; nobody can delete issues or edit existing DNA entries; `/admin` writes go through
the route handlers, not the client. Deploy with `firebase deploy --only firestore:rules`.

Acceptance: seed runs, 15 issues + 3 squads + 1 zone exist in Firestore, build clean, link live.

---

# PHASE 2 — Home feed & issue detail (read path)

### `src/hooks/useLocation.ts`
`watchPosition`-based hook → `{ userLat, userLng, locationError, isLocating, requestLocation }`;
`clearWatch` on unmount.

### `src/hooks/useIssues.ts`
Realtime hook over `subscribeToIssues(distanceFilter, userLat, userLng)` →
`{ issues, loading, error, refresh }`. Export `sortIssues(issues, by, lat?, lng?)` for
`'pressure' | 'newest' | 'nearest'`.

### `src/components/FilterBar.tsx`
Sticky pill tabs: 📍 Under 1km (1000) · Under 2km (2000) · Under 5km (5000) · 🌐 All (null). Active =
solid primary blue; horizontally scrollable on mobile.

### `src/components/IssueCard.tsx`
OLX-style horizontal card (full layout in Appendix D). Thumbnail | category+severity badges | title |
location+distance | aging dot + status badge + upvote + "Can't find"; thin pressure-score bar along
the bottom; a tiny `🧬 {dnaCount}` marker top-right. Whole card tappable except the action buttons.

### `src/components/FABButton.tsx`
Fixed bottom-right, 56px, primary blue, Plus icon, "Report Issue" label, attention pulse, `z-50`,
`active:scale-95`. → `router.push('/report')`.

### `src/components/SkeletonCard.tsx`
Shimmer placeholder matching `IssueCard` dimensions.

### `src/app/page.tsx` (home)
Sticky header (title left; bell + avatar→`/profile` right) → `FilterBar` → count summary
("X issues within Ykm · sorted by pressure") → feed of `IssueCard` (skeletons while loading; civic
empty-state with a "Be the first →" prompt that opens the FAB; red retry banner on error) → `FABButton`.
Optimistic upvote/cantFind. Card mount animation (fade + translate-y). Default filter 2km, sort by pressure.

### `src/app/issue/[id]/page.tsx` (read-only sections for now)
Photo gallery → header (badges, title, reporter+badges, merged-reporters line, location, status+aging) →
`PressureScore` (size lg) → horizontal status step-timeline → mini Google Map (non-interactive pin) →
`IssueDNA` timeline → (discussion & adopt wired in later phases). Build `PressureScore.tsx` and
`IssueDNA.tsx` here (Appendix E for visual specs).

Acceptance: browse seeded issues, open any one, see its DNA + pressure breakdown. Build clean, link live.

---

# PHASE 3 — Triage Agent & reporting flow (write path) ⭐ CORE DEMO

This is the Agentic-Depth centerpiece. Build the agent *as an agent*, not a single prompt.

### `src/lib/genai.ts`
Initialize the `@google/genai` client from `GEMINI_API_KEY`. Export a thin `model()` helper that
reads `process.env.GEMINI_MODEL` (default `gemini-2.5-flash`). Helpers for: a structured-output call
(pass a `responseSchema`), a multimodal call (inline image part), and a **tool-use loop** runner.

### `src/lib/agents/tools.ts`
Server-side tool implementations + their Gemini **function declarations**:
- `geocode_location(text)` → Google Geocoding (`GOOGLE_GEOCODING_KEY`) → `{lat,lng,address}`.
- `find_nearby_issues(lat,lng,radiusM,category)` → Firestore query + `haversineDistance` filter →
  array of `{id,title,category,upvoteCount,distanceM}`.
- `get_weather_context(lat,lng)` → Open-Meteo (Appendix F) → `{rainfall48h,condition,description}`.
- `get_category_severity_weight(category)` → static matrix from `constants.ts`.
- `finalize_report(draft)` → validates & returns the assembled draft (no DB write).
- `flag_possible_duplicate(issueId, confidence)` → returns the merge instruction.

### `src/lib/agents/triageAgent.ts`
The loop. System instruction (Appendix G) tells the model: be warm and concise; **reply in the user's
language**; you have tools — use them to verify location, check for duplicates, and pull weather before
finalizing; ask at most **one** clarifying question at a time; only call `finalize_report` when you have
at least the issue type + a usable location. Loop: send history (+ inline image on first turn) → if the
response contains `functionCall`(s), execute them, append `functionResponse`(s), send again → repeat
until a final text message or a `finalize_report`/`flag_possible_duplicate` call. Return to the caller:
the assistant message, the ordered list of `TriageToolCall`s made, and either the draft or a
duplicate-flag.

### `src/app/api/triage/route.ts`
`POST` handler. Body: `{ history, imageBase64?, mimeType? }`. Runs `triageAgent`. **Streams** (or sends
incrementally) the tool-call status events so the UI can show visible reasoning. Server-only — the
Gemini key never reaches the browser.

### `src/components/LocationPicker.tsx`
Maps JS via `@googlemaps/js-api-loader` (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`), libraries
`['places']`. Draggable marker + Places Autocomplete; reverse-geocode through `/api/triage`'s geocode
path or a small `/api/geocode` handler (don't put the geocoding key in the browser). "Confirm This
Location" → `onLocationConfirmed(lat,lng,address)`. (Full spec: Appendix H.)

### `src/app/report/page.tsx`
Three stages: `chat → location → review` (step indicator at top).
- **chat:** WhatsApp-style thread. Camera (→ base64 + preview), text input, **mic** (Web Speech API,
  `hi-IN` default + `en-IN`), send. On send → `POST /api/triage`. **Render each tool call as an
  animated status line** ("🔎 Checking for nearby reports…", "🌧️ Pulling weather…") above the
  assistant's reply — this is the demo money-shot. If the agent flags a high-confidence duplicate,
  jump to the merge screen (Phase 7 builds merge; for now show the existing issue and offer to add
  the photo as evidence). When the agent returns a draft, advance to `location`.
- **location:** summary card of the AI-extracted category/severity/title (edit pencil → back to chat)
  above `LocationPicker`.
- **review:** show photo, category, editable title, severity + "AI assessed", location, expandable
  severity-formula breakdown. **Submit** → upload photo → build the `Issue` (Appendix I) → `createIssue`
  → route to `/issue/[id]`. If offline, queue (Phase 7) and toast.

Acceptance: a brand-new spoken/typed/photographed report flows through the agent (with visible tool
calls) into Firestore and appears on the feed. Build clean, link live.

---

# PHASE 4 — Pressure engine automation, admin dashboard, resolution flow

### `src/components/VerifyBanner.tsx`
Renders only if within 50m of a `reported` (unverified) issue and GPS available. Amber banner: emoji,
"You're near a reported issue" + title, ✅ Yes / ❌ Nope, dismiss X, auto-dismiss 10s. Mount on home.

### `src/components/BeforeAfterSlider.tsx`
Draggable divider comparing `beforeUrl`/`afterUrl` (clip-path/overflow reveal, mouse+touch). Shows
"🤖 AI Analysis: {verdict}" when provided.

### `src/components/StructuredDiscussion.tsx`
Six structured response types only (📍 confirm · 📸 update photo · 💡 cause · 🔧 fix · ⚠️ getting
worse · ✅ looks fixed) — no free-text box. Pinned "🤖 AI Summary" at top when present. On submit →
`addDiscussionEntry`; every 5 entries → regenerate summary via `/api/summary` (Gemini structured);
3rd "getting worse" → severity re-eval via the same route; award 5 points. (Spec: Appendix J.)
Wire the discussion + adopt sections into `issue/[id]/page.tsx`.

### `src/app/api/summary/route.ts`
Server route for discussion summary + before/after verdict + severity re-eval (all Gemini, structured
output). Keeps the key server-side.

### `src/app/admin/page.tsx` (full)
Header + simulated-authority disclaimer banner. Stats row (open / critical / pending). **Top 3 by
pressure** as expanded cards with: full header, `PressureScore` lg, location+link, reporter, upvotes +
adoptions, last 3 DNA entries, discussion summary, and actions: **Acknowledge** (→ status, −pressure,
DNA, notify), **Mark In Progress** (optional progress photo), **Mark Resolved** (mandatory after-photo
→ upload → before/after Gemini verdict → status `pending_confirmation`). **Pending Confirmations**
section with the slider, confirm/contradict counts, "Lock Resolved" (≥3 confirm) / "Reopen" (≥2
contradict + photo), 48h countdown. **All Issues** sortable/filterable/paginated table.

### Resolution confirmation (community side)
On `issue/[id]`, when status is `pending_confirmation`, prior participants see ✅ fixed / ❌ still there
(photo required to contradict). ≥3 confirm → `resolved`; ≥2 contradict → `reopened` (new DNA entry —
the reopen is permanent record). No response in 48h → auto-resolve.

Acceptance: full lifecycle works end-to-end on the deployed link. Build clean.

---

# PHASE 5 — Watchtower Agent, intelligence layer, public dashboard

### `src/lib/environmentalContext.ts`
`getWeatherContext(lat,lng)` (Open-Meteo, Appendix F) + `applyEnvironmentalContext(issue, ctx)` that
bumps severity for rain-sensitive categories and records `weatherAtReport`.

### `src/lib/problemZones.ts`
`detectProblemZones(issues)` — cluster open issues within 200m; a cluster of ≥5 becomes a zone (center
= mean lat/lng, primary/secondary categories, combined pressure capped 100).
`enrichProblemZoneWithAI(zone, issues)` → Gemini analysis line via `/api/intel`.
`saveProblemZones(zones)` → `setDoc` merge into `problemZones`.

### `src/lib/agents/watchtowerAgent.ts` + `src/app/api/watchtower/route.ts`
The proactive agent (guard with `x-watchtower-secret` === `WATCHTOWER_SECRET`). One run:
1. recompute pressure + aging for all open issues (batch write);
2. detect + enrich + save Problem Zones;
3. predict ≤3 hotspots from the 30-day corpus (Gemini structured → `hotspots` collection);
4. generate the weekly civic report (Gemini structured → `reports` collection, permalink);
5. draft escalation memos for neglected, high-pressure, unacknowledged issues (Gemini → store on issue
   + FCM notify adopters).
Wire the admin **🛰️ Run Watchtower Now** button to `POST /api/watchtower`.

### `src/app/api/intel/route.ts`
Server route for the zone-analysis, hotspot, and weekly-report Gemini calls (structured output).

### Map overlays + dashboard
`ProblemZoneOverlay` (pulsing border, speed ∝ combined pressure) and `PredictiveHotspot` (semi-
transparent amber, distinct from pins) on a map view. `src/app/dashboard/page.tsx` — public, no login:
This-Week numbers, live heatmap, category breakdown, resolution race, top contributors (initials),
predicted hotspots preview, squad leaderboard. Designed to look good on a big screen.

Set up Cloud Scheduler (hourly for steps 1–3/5; the weekly report can gate on day-of-week inside the
handler) — see `CLAUDE.md` §9.

Acceptance: clicking "Run Watchtower Now" visibly produces zones, a hotspot, a weekly report, and at
least one escalation memo from the seeded data. Dashboard renders. Build clean.

---

# PHASE 6 — Gamification, squads, profiles

### `src/lib/gamification.ts`
Points table (report 10, verified-report bonus 20, verify 5, first-responder 15, progress photo 8,
confirm/deny 5, cited-cause 12, resolved-adoption 25); slow decay after 14d inactivity. Badge award
logic for all 7 badges (First Responder, Neighbourhood Watch, Issue Slayer, Top Verifier, Guardian,
Root Cause Finder, Streak Keeper).

### `src/lib/squads.ts`
Auto-create a squad when ≥5 active users share a 500m radius over 2 weeks; collective points, shared
feed, 3× weighted squad upvote, weekly ranking.

### `src/lib/resolutionCard.ts`
Generate a shareable PNG resolution card (before|after, category+location, days-to-resolve, citizens
involved, the "Reported by X · Verified by N · Fixed in D days" line, app name). Use canvas server-side
or html-to-image client-side.

### `src/app/profile/page.tsx` + `src/components/ResolutionToast.tsx`
Profile: identity + points + level; badges grid (earned vs locked with unlock conditions); squad card;
adopted/monitored issues; recent activity from `pointsLog`; settings (preferred language: en/hi/ta/bn/
te/mr, notification toggle placeholder, sign out). `ResolutionToast`: full-width celebration banner
(🎉, "Fixed in X days · Y people helped", Share + Download Card, 8s countdown).

Acceptance: points/badges accrue from actions; a resolved issue produces a shareable card. Build clean.

---

# PHASE 7 — Offline, multilingual finish, duplicate-merge, polish, PWA

### `src/lib/offlineQueue.ts`
`saveToOfflineQueue`, `processOfflineQueue` (base64→Blob→Storage→`createIssue`, retry ≤3 then drop),
`getQueuedCount`, `setupOnlineListener` (on `online` → process). **Scope honestly:** the *report*
(photo+location+text) is captured offline and **triage runs on reconnect** — do not claim full
conversational AI offline.

### `src/lib/duplicateDetection.ts`
`checkForDuplicates` (location ≤50m + category match → confidence high/medium/low) and
`mergeIntoDuplicate` (add co-reporter, add photo, +upvote, DNA "additional evidence — merged",
recompute pressure). Optional: Gemini image-similarity for high confidence (clean TODO if skipped).
Wire into the report submit flow (high → auto-merge + go to existing issue; medium → ask; low → create).

### `src/contexts/AuthContext.tsx` + root layout
`useAuth` → `{ user, firebaseUser, loading, signInWithGoogle, signOut }`; create Firestore user doc on
first sign-in. Root layout: `AuthProvider`, `setupOnlineListener` on mount, bottom "N reports waiting
to sync" banner when queued, "Back online — syncing" toast, app-icon loading screen while auth inits.

### PWA + final polish
`public/manifest.json` (name, theme `#1d4ed8`, icons 192/512, standalone, portrait); link it + set
metadata in `layout.tsx`. Page transitions, empty/error/loading states everywhere, accessibility pass
(tap targets ≥44px, labels), Lighthouse mobile pass.

Acceptance: installable PWA; offline report syncs on reconnect; duplicate flow works. Build clean, link live.

---

# Appendices (concrete specs preserved from the original prompt, corrected)

> These hold the field-level detail so the phase bodies stay readable. They are faithful to your
> original Cursor prompt except: model id fixed to `gemini-2.5-flash` via env, all AI/geocoding moved
> server-side, security rules added, and the agent loop replaces the single-shot Gemini calls.

## Appendix A — Dockerfile (multi-stage, standalone)
```dockerfile
FROM node:20-alpine AS base
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```
> Note: build runtime envs (`GEMINI_API_KEY`, etc.) are set on the Cloud Run service, not baked into
> the image. `npm ci` (not `--only=production`) so the build has its dev deps.

## Appendix B — `types/index.ts` field reference
Use the exact field lists from your original Step 1 (they are correct): `Location`, `DNAEntry`
(append-only timeline entry with `emoji`), `DiscussionEntry` (6 structured types, optional lat/lng),
`Issue` (all fields incl. `pressureBreakdown`, `dna[]`, `discussion[]`, `coReporters`, `weatherAtReport`,
`adoptedBy`, `resolutionPhotoUrl`, `resolutionGeminiVerdict`, `problemZoneId`, `isOfflineQueued`),
`User`, `Badge`, `Squad`, `ProblemZone`. Add the three agent types listed in Phase 1.

## Appendix C — 15 seed issues
Use your original 15 (Connaught Place pothole, Noida water main, Rohini streetlights, Azadpur garbage,
Karol Bagh open manhole, Pitampura footpath, Gurugram tree, Dwarka cracked road, Preet Vihar wiring,
Saket sewage, Model Town speed breaker, Bhajanpura waterlogging, Okhla toilet, Shalimar Bagh fence,
AIIMS pothole cluster). **Change:** set each `reportedAt` to a realistic point in the last ~40 days so
aging colors and the Watchtower's 30-day window look real; derive `agingStatus` from it rather than
hardcoding. Cluster #1/#9/#11 into one Problem Zone.

## Appendix D — `IssueCard` layout
80px thumbnail (or category emoji placeholder) | right column: row1 category+severity badges, row2
title (line-clamp-2), row3 📍address(≤30 chars)·distance, row4 aging dot+label / status badge / upvote
(filled if user upvoted) + "Can't find"; bottom: thin pressure bar (green<30, yellow<60, orange<80,
red≥80); top-right `🧬 {dnaCount}`. White, rounded-xl, shadow-sm, border-gray-100. Whole card tappable
except action buttons.

## Appendix E — `PressureScore` & `IssueDNA`
`PressureScore` size lg: circular SVG ring colored by score, number inside, tap to expand 4-row
breakdown (👥 Verification / ⏳ Age / ⚠️ Severity / 🌧️ Weather, each with a proportional bar). size
sm: small colored numbered circle. `IssueDNA`: vertical timeline, colored emoji nodes, "Day X · HH:MM"
labels, photo thumbnails, collapse middle if >6 entries, subtle red dotted gap for 7+ day inactivity.

## Appendix F — Open-Meteo weather
`GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&hourly=precipitation&past_days=2&forecast_days=1`.
Sum last-48h precipitation; `rainfall48h = total > 5mm`; `condition` ∈ rainy/dry/humid; human
`description` ("Heavy rainfall in last 48h (32mm)"). Fallback on error:
`{condition:'unknown',rainfall48h:false,description:'Weather data unavailable'}`. No key required.

## Appendix G — Triage Agent system instruction (sketch)
"You are the FixIt triage agent helping an Indian citizen report a civic infrastructure issue.
Be warm and brief. **Reply in the same language the user writes/speaks in.** You can see attached
photos. You have tools: geocode_location, find_nearby_issues, get_weather_context,
get_category_severity_weight, finalize_report, flag_possible_duplicate. Workflow: understand the issue
and a rough location; geocode it; check find_nearby_issues for an existing same-category report within
~50m — if a strong match exists, call flag_possible_duplicate instead of creating a new one; otherwise
pull weather and the category weight, compute a 1–10 severity (visual 0.5 / category 0.3 / community
0.2), and call finalize_report with {category, severity, title (<10 words), description,
descriptionEnglish, location}. Ask at most ONE clarifying question at a time, only if you truly cannot
proceed. Never finalize without at least an issue type and a usable location."

## Appendix H — `LocationPicker`
Maps JS (`@googlemaps/js-api-loader`, browser key), zoom 16, `disableDefaultUI`,
`gestureHandling:'greedy'`, draggable red marker, Places Autocomplete; reverse-geocode via a server
`/api/geocode` route (don't expose the geocoding key); "Auto-detected — drag to correct" banner on GPS;
"Confirm This Location" → callback; 240px tall on mobile.

## Appendix I — `Issue` object on submit
Build from the agent draft + chosen location + uploaded photo. `status:'reported'`,
`agingStatus:'fresh'`, fresh ids via `crypto.randomUUID()`, `reportedAt:new Date()`, counts zeroed,
initial `pressureScore = severity*2.5` with matching breakdown, one `dna` `reported` entry, `language`
from the agent's detected language, `timeOfDayAtReport` from the hour, `isOfflineQueued:!navigator.onLine`.

## Appendix J — `StructuredDiscussion` types
`'📍 confirm' | '📸 update_photo' | '💡 possible_cause' | '🔧 possible_fix' | '⚠️ getting_worse' |
'✅ looks_fixed'`. Selecting a type reveals a context-specific input (or photo upload for update_photo)
+ Submit. List entries chronologically with user + badge dots + time-ago; show a trust ✓ for Top
Verifier badge holders.

---

## Quick map: old Cursor step → new phase
S1→P1 · S2→P3 (now an agent, server-side) · S3→P2 · S4→P3 · S5→P2/P4 · S6→P4 · S7→P5 · S8→P6 ·
S9→P7 · S10→P0/P1/P7 (deploy moved to P0, seed to P1, PWA to P7).

*FixIt — Build Plan | Vibe2Ship Hackathon | 2026*
