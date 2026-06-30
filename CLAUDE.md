# CLAUDE.md — FixIt

> This file is read automatically by Claude Code at the start of every session. It is the single
> source of truth for *how* this project is built. The narrative/"why" lives in `fixit_project_doc.md`.
> The step-by-step build order lives in `fixit_build_plan.md`. **Read all three before writing code.**

---

## 1. What this is

**FixIt** is an AI-powered hyperlocal civic-issue platform for the **Vibe2Ship Hackathon
(Coding Ninjas × Google for Developers, 2026)**, Problem Statement: *Hyperlocal Problem Solver*.

Citizens **report → verify → track → resolve** local infrastructure issues (potholes, drainage,
water leaks, broken streetlights, waste, etc.). The product closes the broken feedback loop between
people who *see* problems and the system that *fixes* them, using **two AI agents** and **radical
public transparency** — no government buy-in required.

The differentiator is not "an app with a chatbot." It is **agentic AI doing real multi-step work**:
a reactive **Triage Agent** at report time and a proactive **Watchtower Agent** on a schedule.

---

## 2. The judging matrix — and how every decision maps to it

| Criterion | Weight | Where we win it |
|---|---|---|
| Problem Solving & Impact | 20% | Loop-closing thesis; multilingual voice reach; the Pressure Score making neglect *visible*; offline-first capture. |
| **Agentic Depth** | **20%** | **Triage Agent** (Gemini function-calling loop, tools, branching, visible reasoning) + **Watchtower Agent** (autonomous scheduled actions: scoring, clustering, prediction, escalation drafting). |
| Innovation & Creativity | 20% | Pressure Score, Issue DNA (immutable biography), Problem Zones, predictive hotspots, community-verified resolution that can't be faked. |
| Usage of Google Technologies | 15% | Gemini 2.5 Flash (multimodal + function calling + structured output), Firebase (Firestore/Auth/Storage/FCM), Cloud Run, Cloud Scheduler, Google Maps Platform (Maps/Places/Geocoding). |
| Product Experience & Design | 10% | Opinionated design system (§7), OLX-style feed, motion, mobile-first 390px. |
| Technical Implementation | 10% | Server-side AI (no leaked keys), Firestore security rules, typed everything, error boundaries, optimistic UI. |
| Completeness & Usability | 5% | **Every phase is deployable.** A working public Cloud Run link exists from Phase 0 onward. |

**Rule of thumb when trading off:** never sacrifice *Completeness* (a working deployed link is a hard
eligibility gate) for an extra feature. A shipped vertical slice beats a half-built everything.

---

## 3. Tech stack (verified current as of 2026)

- **Framework:** Next.js 14+ (App Router), TypeScript (strict), Tailwind CSS.
- **AI:** Google **Gemini 2.5 Flash** via the **`@google/genai`** SDK, called **only from server-side
  route handlers**. Model id comes from `GEMINI_MODEL` env (default `gemini-2.5-flash`).
- **Data/auth/media:** Firebase — Firestore (realtime), Auth (Google sign-in), Storage, Cloud Messaging.
- **Maps:** Google Maps Platform — Maps JS (browser), Places Autocomplete (browser), Geocoding (server).
- **Weather:** Open-Meteo (free, no key) for environmental context.
- **Scheduling:** Cloud Scheduler → an authenticated Cloud Run endpoint (the Watchtower Agent).
- **Deploy:** Containerized (`Dockerfile`, `output: 'standalone'`) on **Google Cloud Run**.

### ⚠️ Model correctness — do not regress this
`gemini-1.5-flash`, `gemini-1.0-*`, and `gemini-2.0-flash*` are **shut down** — they return 404.
**Always** use `gemini-2.5-flash` (or `gemini-flash-latest`) read from `process.env.GEMINI_MODEL`.
Never hardcode a model id in a `.ts` file. `gemini-2.5-flash` is retired Oct 2026 — keeping it in an
env var makes the future migration a one-line change.

---

## 4. Environment variables

Browser-exposed (`NEXT_PUBLIC_*`) — **only** values safe to ship to the client:
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=   # HTTP-referrer-restricted; Maps JS + Places only
```
Server-only (NEVER prefixed `NEXT_PUBLIC_`, never imported into a client component):
```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_GEOCODING_KEY=        # may equal a separate IP-restricted key
WATCHTOWER_SECRET=           # shared secret Cloud Scheduler sends as a header
```
> If a Gemini or Geocoding key ever appears under `NEXT_PUBLIC_`, that is a bug. Fix it on sight.

---

## 5. Architecture — the two agents

### 5a. Triage Agent — reactive, server-side function-calling loop
Lives in `src/lib/agents/triageAgent.ts`, invoked by `POST /api/triage`. The browser sends the
conversation history + optional image (base64). The route handler runs a **tool-use loop** with Gemini:

Model-callable tools (executed server-side, results fed back to the model):
- `geocode_location(text)` → `{lat, lng, address}` (Google Geocoding)
- `find_nearby_issues(lat, lng, radiusM, category)` → candidate duplicates (Firestore)
- `get_weather_context(lat, lng)` → `{rainfall48h, condition}` (Open-Meteo)
- `get_category_severity_weight(category)` → static risk matrix
- `finalize_report(draft)` → returns assembled draft to client for confirmation (no DB write yet)
- `flag_possible_duplicate(issueId, confidence)` → routes to the merge path

The image is passed **inline** so the model sees it natively (vision); tools fetch only what the model
*cannot* know. The loop ends when the model emits a final message — either a single clarifying
question or a `finalize_report`/`flag_possible_duplicate` call. The route streams the model's
intermediate tool calls back to the UI so the chat can show **visible reasoning**:
`🔎 Checking for nearby reports…`, `🌧️ Pulling weather for this spot…`. This visibility *is* the
Agentic Depth demo — do not hide it.

The DB write happens only after the user taps **Submit** on the review screen.

### 5b. Watchtower Agent — proactive, scheduled
Lives in `src/lib/agents/watchtowerAgent.ts`, invoked by `POST /api/watchtower` (guarded by the
`WATCHTOWER_SECRET` header; Cloud Scheduler calls it). One run does, in order:
1. Recompute pressure score + aging for every open issue (deterministic; see §6).
2. Detect Problem Zones (deterministic clustering); for each, call Gemini for the analysis line.
3. Predict up to 3 hotspots from the 30-day corpus (Gemini, structured output).
4. Generate the weekly civic report (Gemini, structured output).
5. For neglected, high-pressure, *unacknowledged* issues: Gemini **drafts an escalation memo**,
   store it on the issue, and notify adopters via FCM.

Expose a **"Run Watchtower now"** button in the admin Developer Tools so judges can trigger a live
run during the demo (the seed data carries realistic historical timestamps so output looks real).

### Why two agents
One reacts to a single citizen with tools and branching; one autonomously governs the whole corpus on
a schedule and takes actions. Together they are a clean, demoable, *genuinely* agentic system — not a
classifier called eight times.

---

## 6. Core formulas (single source of truth — keep every copy in sync)

**Severity (1–10)** = `geminiVisualScore*0.5 + categoryBaseWeight*0.3 + communitySignal*0.2`,
clamped 1–10. `communitySignal` grows with verified upvotes.

**Pressure Score (0–100):**
```
verification = min(upvoteCount*2, 30)   // nearby upvotes (≤50m) count 1.5×
age          = min(daysSinceReport*1.5, 25)
severity     = severity * 2.5
weather      = 0
  if rainfall48h:
    road_damage|drainage_flooding += 10
    water_supply                  += 7
    street_lighting               += 15   // exposed wiring + rain
  if night && street_lighting     += 8
  weather = min(weather, 20)
total = round(verification + age + severity + weather)
if status == acknowledged: total -= 5
if status == in_progress:  total -= 10
total = clamp(total, 0, 100)
```
**Aging:** 0–3 fresh · 4–7 aging · 8–14 neglected · 15–30 critical_neglect · 30+ civic_failure.
**Severity label:** 1–3 low · 4–6 moderate · 7–8 high · 9–10 critical.

> These exist in `src/lib/pressureScore.ts` and `src/lib/firebaseHelpers.ts`. If you change one,
> change both, and re-run the admin "Recalculate All Pressure Scores" tool.

---

## 7. Design system (Product Experience = 10%)

Do **not** ship default-Tailwind grey. The app should look intentional and civic-confident.

- **Identity:** "civic trust." Deep institutional blue as primary, warm amber for *attention/urgency*,
  semantic colors for status. Generous whitespace, soft shadows, no harsh borders.
- **Tokens** (define as CSS variables in `globals.css`, reference via Tailwind):
  - primary `#1d4ed8`, primary-dark `#1e3a8a`, attention/amber `#f59e0b`
  - status: reported grey · verified blue · acknowledged indigo · in_progress amber ·
    pending_confirmation purple · resolved green · reopened red
  - aging dots: 🟢 `#16a34a` · 🟡 `#ca8a04` · 🟠 `#ea580c` · 🔴 `#dc2626` · ⚫ `#1f2937`
- **Type:** one strong display face for headings (e.g. a humanist sans), system stack for body.
  Clear scale; never more than 2 families.
- **Motion:** cards fade-in + small translate-y on mount; FAB has a subtle attention pulse; tool-call
  status lines in the Triage chat animate in one at a time. Keep it under 250ms, never janky.
- **Mobile-first:** design every screen at **390px** first. The FAB ("Report Issue") is the single
  most visually dominant element on the home screen and is always reachable with one thumb.

---

## 8. Conventions

1. TypeScript strict; no `any` unless truly unavoidable (justify with a comment).
2. Tailwind only — no inline styles, no separate CSS files except `globals.css` tokens.
3. Mobile-first, 390px baseline.
4. All Firebase access goes through `@/lib/firebaseHelpers` (exports `db`, `auth`, `storage` from `@/lib/firebase`).
5. All shared types live in `@/types`.
6. Icons: `lucide-react`. Dates: `date-fns`.
7. Every async op has `try/catch` with a user-facing error path (toast or inline), never a silent fail.
8. **All Gemini and Geocoding calls go through `/api/*` route handlers.** Client components never
   touch a server key.
9. `'use client'` only where hooks/browser APIs are actually used; keep server components server-side.
10. Append-only data is append-only: never edit/delete a `DNAEntry`. Reopens are *new* entries.

---

## 9. Build & deploy commands

```bash
npm run dev                 # local dev (localhost:3000)
npm run build               # MUST pass clean before any deploy or phase hand-off
npm run lint
npm run typecheck           # tsc --noEmit (add this script)

# Deploy to Cloud Run (Phase 0 onward — keep this link alive for judges):
gcloud run deploy fixit --source . --region asia-south1 --allow-unauthenticated

# Schedule the Watchtower Agent (after Phase 4):
gcloud scheduler jobs create http watchtower-hourly \
  --schedule="0 * * * *" --uri="$SERVICE_URL/api/watchtower" \
  --http-method=POST --headers="x-watchtower-secret=$WATCHTOWER_SECRET"
```
After any code change that could break the build, **run `npm run build` and fix all errors before
moving on.** Common fixes: missing `'use client'`, unresolved imports, server keys leaking into client
components, Firestore `Timestamp` vs JS `Date` conversions.

---

## 10. Real vs. simulated (be honest in the demo, don't over-promise)

| Feature | For the hackathon build |
|---|---|
| Triage Agent (tools, branching, vision) | **Real.** This is the centerpiece — make it genuinely work. |
| Watchtower Agent (scoring, zones, weekly report, escalation drafts) | **Real**, triggered by Cloud Scheduler + a manual "run now" button. Seed data gives it history. |
| Pressure Score / Aging / Issue DNA | **Real**, deterministic, live. |
| Duplicate detection | **Real** on location+category; Gemini image-similarity is an *optional* upgrade — leave a clean TODO if skipped. |
| Multilingual voice | **Real** for input (Web Speech API + Gemini understands many languages). Don't claim flawless coverage of every Indian language; demo Hindi + English confidently. |
| Offline-first capture | **Real** for queue+sync of a completed report. The "conversational AI in degraded offline mode" line is the riskiest claim — scope it to: photo+location+text captured offline, AI triage runs on reconnect. Say exactly that. |
| Authority layer (`/admin`) | **Simulated** by design — label it clearly: "In production this requires verified municipal credentials." This honesty is a strength, not a weakness. |

---

## 11. Guardrails for Claude Code

- Prefer editing existing files over creating parallel ones; check `fixit_build_plan.md` for the file map.
- After each phase, ensure `npm run build` passes and the app still deploys before starting the next.
- If a library or Google API has changed since this file was written, **verify against current docs**
  rather than guessing — model ids and SDKs in this ecosystem churn fast.
- Keep the deployed Cloud Run link working at all times. If a change risks breaking it, gate it behind
  a flag or finish it within the same session.
