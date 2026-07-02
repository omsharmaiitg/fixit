# FixIt — Hyperlocal Civic Intelligence Platform

**An AI-agent-powered platform that turns scattered citizen observations into structured, prioritized, and verifiable civic intelligence — built end-to-end on Google Gemini, Firebase, Google Maps Platform, and Google Cloud.**

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Google Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-4285F4)
![Firebase](https://img.shields.io/badge/Firebase-Firestore_·_Auth_·_Storage-FFCA28)
![Google Cloud Run](https://img.shields.io/badge/Google_Cloud_Run-deployed-4285F4)

**Live app:** https://fixit-341094842696.asia-south1.run.app/

**Strategy & architecture:** [Google Doc](https://docs.google.com/document/d/1N0pL-ZYgITc_ugbA-_CqAk87-dKDvlj6rp6FPFjrDy4/edit?usp=sharing)

> Submitted for the **Vibe2Ship Hackathon** — Coding Ninjas × Google for Developers, 2026.

---

## Table of Contents

- [What FixIt Solves](#what-fixit-solves)
- [Why FixIt Is Different](#why-fixit-is-different)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Data Model & Security](#data-model--security)
- [The Watchtower Agent](#the-watchtower-agent)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Future Scope](#future-scope)
- [Acknowledgements](#acknowledgements)

---

## What FixIt Solves

Communities face a constant stream of local infrastructure problems — potholes, water leakages, broken streetlights, overflowing waste, exposed wiring, blocked drains. The failure is rarely awareness; it's the **broken feedback loop** between citizens who notice problems and the systems meant to fix them.

Reporting today is fragmented across helplines, forms, and social media. Reports are hard to track, easy to lose, and opaque — a citizen who reports a pothole rarely learns whether it was verified, acknowledged, or resolved. There is no shared, trustworthy, public record of what's wrong, how urgent it is, and what's being done.

**FixIt makes civic reality transparent and public** — creating an append-only record of every issue, a comparable urgency signal that rises with neglect, and a verification model that keeps the record honest. It creates accountability **without requiring government participation.**

## Why FixIt Is Different

Citizen-reporting tools like SeeClickFix, FixMyStreet, and municipal 311 systems already collect reports. FixIt differs on three axes they don't address:

1. **Agentic intelligence, not static forms** — a Gemini function-calling **Triage Agent** reasons over every report in a visible multi-step tool loop, and an autonomous **Watchtower Agent** governs the entire corpus.
2. **Location-verified integrity** — the right to report or verify is tied to the user's live physical presence in that city, structurally preventing remote fake activity.
3. **A measurable, self-updating accountability signal** — the 0–100 **Pressure Score** and append-only **Issue DNA** make neglect visible and comparable over time.

---

## Key Features

### Signature innovations
- **Two-agent model** — a reactive Gemini Triage Agent + an autonomous Watchtower Agent.
- **Location-verified integrity + Explore Mode** — action rights tied to live presence; read-only exploration of any other city's civic record.
- **Pressure Score** — a single public 0–100 urgency signal that rises with neglect and falls when action is taken.
- **Issue DNA** — an immutable, append-only public biography of every issue.

### Reporting & the Triage Agent
- Conversational, AI-guided reporting via a Gemini function-calling tool loop (not a static form).
- Visible agent reasoning — the user watches each tool call in real time.
- Multi-tool reasoning — geocode location, search duplicates, pull live weather, look up category risk, decide new-vs-duplicate.
- Separated photo-capture / photo-video-upload controls; multimodal photo understanding via Gemini vision.
- Transparent, explainable severity scoring with the formula shown to the user.

### Location intelligence & the dual-mode city model
- A single source of truth separating **home city** (live location) from **active city** (currently viewed), deriving an `isExploring` state.
- **Explore Mode** — signed-in users browse any other city's feed, dashboard, and reports read-only; the home city is excluded from the explore picker.
- Non-sticky exploration — active city resets to home on every fresh load.
- A persistent explore banner and city-boundary feed (proximity filters removed when exploring).

### Urgency, tracking & transparency
- Tappable Pressure Score breakdown (verification, age, severity, weather).
- Issue Aging lifecycle: Fresh → Aging → Neglected → Critical → Civic Failure.
- Weather-aware dynamic severity (rain raises risk for potholes, exposed wiring, etc.).
- Real-time, city-scoped civic feed with Active / Resolved tabs.

### Community & verification
- Proximity-weighted upvotes move an issue from Reported → Verified; a non-adversarial "Can't find" replaces downvoting.
- One-vote-per-account integrity; undoable votes.
- Email/password (with verification) + Google Sign-In; editable profiles; civic points and badges; "My Reports".

### Civic intelligence — the Watchtower Agent
- Autonomous, scheduled operation (Google Cloud Scheduler) with no human in the loop.
- Pressure recomputation, Problem Zones with an AI urban-planning root-cause read, predictive hotspots, per-city weekly civic reports, and AI-drafted escalation memos.

### Transparency & the public Impact Dashboard
- A login-free, city-scoped dashboard: totals, resolution rate, problem zones, hotspots, contributors, and the weekly report.
- Public-read transparency; accountability comes from visibility.

---

## How It Works

### The two agents

**Triage Agent (reactive).** On each report, a Gemini `2.5-flash` function-calling loop runs server-side. The model is given tool declarations (geocode, search-nearby, get-weather, category-risk, create-issue / flag-duplicate) and drives a multi-step reasoning loop, emitting tool calls the UI surfaces live. The result is a fully-structured civic record plus a transparent severity score.

**Watchtower Agent (proactive).** On a Cloud Scheduler cadence (and on demand), a Gemini structured-output run recomputes pressure/aging across the corpus, clusters Problem Zones, forecasts hotspots from 30-day patterns, and writes a **per-city** civic report stored in Firestore, keyed by city so each city surfaces its own.

### The location model (single source of truth)

```
locationSource : 'gps' | 'profile-fallback' | 'guest-picked'
homeCity       : resolved from live GPS (reverse-geocoded) → else profile city → else guest-picked
activeCity     : the city currently being viewed (initializes to homeCity)
isExploring    : activeCity !== homeCity
canAct         : locationSource === 'gps' && !isExploring   // report / upvote / can't-find
```

Everything downstream — feed scope, distance filters, action-button visibility, Watchtower scope, dashboard, and the greeting — is derived from this one model.

### The Pressure Score

A single public 0–100 signal per issue combining **community verification**, **age**, **severity**, and **live weather**. It rises as an issue is neglected and falls when it is acknowledged and resolved — turning "was this ever fixed?" into a public number. Every contributing factor is inspectable via a tappable breakdown.

### Issue DNA

An immutable, append-only, timestamped biography of each issue (reports, verifications, acknowledgements, progress, resolutions, reopenings). Enforced append-only at the Firestore security-rules layer so history can be added to but never rewritten or hidden.

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| **AI** | **Google Gemini 2.5 Flash** (`@google/genai`) | Triage tool-loop, Watchtower structured output, multimodal vision |
| **AI tooling** | **Google AI Studio** | Prompt & function-declaration design |
| **Framework** | **Next.js 14** (App Router) + **TypeScript** | Server components, API route handlers, type safety |
| **Styling** | **Tailwind CSS** | Mobile-first design system |
| **Database** | **Firebase Firestore** | Real-time issues, users, zones, hotspots, per-city reports |
| **Auth** | **Firebase Authentication** | Email verification + Google Sign-In |
| **Storage** | **Firebase Cloud Storage** | Issue & profile media |
| **Maps** | **Google Maps Platform** | Maps JS API, Places Autocomplete, Geocoding & reverse Geocoding |
| **Weather** | **Open-Meteo API** | Live rainfall/conditions for dynamic severity |
| **Hosting** | **Google Cloud Run** | Serverless, autoscaling container |
| **Build** | **Google Cloud Build + Artifact Registry** | Container build & image hosting |
| **Scheduling** | **Google Cloud Scheduler** | Autonomous Watchtower invocation |
| **Container** | **Docker** | Multi-stage standalone Next.js build |

---

## Screenshots

> Add images to a `docs/` folder in the repo and update the paths below.

**Triage Agent mid-run** — the visible tool-call steps
`![Triage Agent](docs/01-triage-agent.png)`

**Populated city feed** — seeded issues with pressure & aging colours
`![City feed](docs/02-feed.png)`

**Issue detail** — Pressure Score breakdown + Issue DNA timeline
`![Issue detail](docs/03-issue-detail.png)`

**Watchtower output** — Problem Zones + "Where trouble is heading next"
`![Watchtower](docs/04-watchtower.png)`

**Explore mode** — "Viewing {city}" with the explore banner, actions removed
`![Explore mode](docs/05-explore.png)`

**Impact Dashboard** — real city totals & resolution rate
`![Dashboard](docs/06-dashboard.png)`

---

## Getting Started

### Prerequisites
- **Node.js 18+** and npm
- A **Firebase** project (Firestore, Authentication, Storage enabled)
- A **Google Cloud** project with billing enabled
- API keys for **Gemini**, **Google Maps Platform** (browser + server-side geocoding), enabled Google Cloud APIs

### 1. Clone & install
```bash
git clone https://github.com/omsharmaiitg/fixit.git
cd fixit
npm install
```

### 2. Configure environment
Create `.env.local` in the project root (see [Environment Variables](#environment-variables)).

### 3. Run locally
```bash
npm run dev
# open http://localhost:3000
```

### 4. Build for production
```bash
npm run build
npm start
```

---

## Environment Variables

> ⚠️ **Reconcile these names with your actual code / `.env.example`.** The values below follow common Next.js + Firebase conventions; use whatever keys the codebase actually reads.

```bash
# --- Google Gemini ---
GEMINI_API_KEY=                     # server-side only; paid-tier key

# --- Firebase (public client config) ---
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# --- Firebase Admin (server-side; for privileged reads/writes) ---
FIREBASE_SERVICE_ACCOUNT_KEY=       # JSON string or path, if used

# --- Google Maps Platform ---
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=    # browser key — referrer-restricted
GOOGLE_GEOCODING_API_KEY=           # server key — API-restricted (Geocoding)

# --- Weather ---
# Open-Meteo requires no key

# --- Watchtower ---
WATCHTOWER_SECRET=                  # shared secret to authorize manual/scheduled runs
```

**Key hygiene notes**
- The **browser Maps key** must be *referrer-restricted*; the **server geocoding key** must be a separate *API-restricted* key. Never share one key across both.
- All privileged keys (`GEMINI_API_KEY`, `GOOGLE_GEOCODING_API_KEY`, `WATCHTOWER_SECRET`) are **server-side only** and must never be prefixed `NEXT_PUBLIC_`.

---

## Data Model & Security

**Core collections (Firestore)**
- `issues` — civic issues (title, description, category, severity, pressure, `cityName`, coordinates, status, `dna[]`, `upvotedBy[]`, timestamps).
- `users` — profiles (name, bio, city, photo, points/badges).
- `problemZones` / `hotspots` — Watchtower cluster & forecast output.
- `civicReports` — per-city weekly reports, keyed by city.
- `reports` — per-user report references.

**Security rules (summary)**
- **Public-read** civic data (feed, dashboard) for transparency.
- **Append-only Issue DNA** — the `dna` timeline can be appended to but never edited or deleted.
- **Owner-scoped profiles** — a user can only write their own profile.
- **Account-gated writes** — reporting/verifying requires a verified account.

---

## The Watchtower Agent

**Scheduled runs.** Google Cloud Scheduler invokes the Watchtower endpoint on a cadence with no human in the loop.

**Manual runs.** The Admin → Developer Tools panel can trigger a run by supplying the `WATCHTOWER_SECRET`; the endpoint rejects unauthorized calls (this is the gate working as designed, not a bug).

**Per-city reports.** Running Watchtower for a given active city generates and stores that city's civic report and analyses independently, so pre-generating reports for demo cities (e.g. Shamli, Delhi, Guwahati) keeps them instant and avoids live-call latency during a presentation.

> Watchtower runs make live Gemini calls; if you hit quota (HTTP 429), wait and retry. Pre-generate demo reports well ahead of time.

---

## Deployment

FixIt deploys as a standalone Next.js container to **Google Cloud Run** (region `asia-south1`).

### Build & deploy via Cloud Build
```bash
# from the project root
gcloud builds submit --tag \
  asia-south1-docker.pkg.dev/PROJECT_ID/fixit/fixit:latest

gcloud run deploy fixit \
  --image asia-south1-docker.pkg.dev/PROJECT_ID/fixit/fixit:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=...,GOOGLE_GEOCODING_API_KEY=...,WATCHTOWER_SECRET=..."
```

### Schedule the Watchtower Agent
```bash
gcloud scheduler jobs create http watchtower-weekly \
  --location asia-south1 \
  --schedule "0 6 * * 1" \
  --uri "https://fixit-341094842696.asia-south1.run.app/api/watchtower" \
  --http-method POST \
  --headers "Content-Type=application/json" \
  --message-body '{"secret":"WATCHTOWER_SECRET"}'
```

**Deployment notes**
- Firebase is initialized **lazily** with public config fallbacks so the container builds and boots cleanly on Cloud Run.
- Ensure the Cloud Run service account has the IAM roles it needs (Firestore, and invoker for the Scheduler job).
- Confirm billing is linked to the project the geocoding key belongs to, or Geocoding returns `REQUEST_DENIED`.

---

## Project Structure

> Indicative layout — adjust to match the repository.

```
fixit/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── triage/        # Triage Agent route (Gemini tool loop)
│   │   │   └── watchtower/    # Watchtower Agent route (scheduled/manual)
│   │   ├── (feed)/            # home feed
│   │   ├── issue/[id]/        # issue detail (Pressure Score, Issue DNA)
│   │   ├── dashboard/         # public Impact Dashboard
│   │   ├── profile/           # profile + edit
│   │   └── onboarding/        # first-run intro & city setup
│   ├── components/            # UI (cards, banners, score rings, timeline)
│   ├── context/               # location model (home/active/exploring/canAct)
│   ├── lib/
│   │   ├── genai.ts           # Gemini client
│   │   ├── triageTools.ts     # tool declarations
│   │   ├── triageAgent.ts     # tool-loop orchestration
│   │   ├── firebase.ts        # lazy Firebase init
│   │   ├── pressure.ts        # Pressure Score / aging
│   │   └── geocode.ts         # Maps geocoding helpers
│   └── types/                 # shared TypeScript types
├── Dockerfile                 # multi-stage standalone build
├── firestore.rules            # security rules
└── README.md
```

---

## Future Scope

Natural next steps build on what FixIt already ships. A **cross-city civic index and "best city" competition** would rank participating cities by resolution rate, response speed, and community verification — turning the per-city record into a friendly public leaderboard that rewards responsiveness. Beyond that: a verified municipal-authority onboarding path that turns the simulated authority layer into real two-way action, an escalation bridge that routes neglected high-pressure issues into open-data / RTI channels, and on-device multilingual reporting so the Triage Agent meets citizens in their own language.

---

## Acknowledgements

Built for the **Vibe2Ship Hackathon** — Coding Ninjas × Google for Developers, 2026 — on the Google ecosystem: Gemini, Firebase, Google Maps Platform, and Google Cloud.
