# 🛠️ FixIt — Hyperlocal Problem Solver

> **AI-agent-powered civic issue reporting that closes the broken loop between citizens who *see* problems and the systems meant to *fix* them.**

🔗 **Live App:** https://fixit-341094842696.asia-south1.run.app
🏆 **Built for:** Vibe2Ship Hackathon · Coding Ninjas × Google for Developers (2026)

---

## The Problem

Communities face a constant stream of infrastructure issues — potholes, water leaks, broken streetlights, overflowing waste, exposed wiring, blocked drains. People *see* these every day. What's missing is the **feedback loop**: reporting is fragmented, untrackable, and opaque. A citizen who reports a pothole rarely learns whether it was verified, acknowledged, or fixed. FixIt closes that loop — through **two AI agents** and **radical public transparency**, requiring no government buy-in to create accountability.

---

## 💡 Two AI Agents, Not One Chatbot

### 🔍 Triage Agent — *reactive*
When a citizen reports an issue, a **Gemini function-calling tool loop** turns a short conversation + photo into a structured, geocoded, severity-rated, de-duplicated record. It *visibly* reasons across tools: geocoding the location, checking for nearby duplicates, pulling live weather, and computing a transparent severity score.

### 🛰️ Watchtower Agent — *proactive*
On a schedule (via Cloud Scheduler), it autonomously recomputes every issue's urgency, clusters failures into **Problem Zones** with an AI root-cause read, predicts emerging hotspots, writes a **weekly civic report**, and drafts escalations for neglected issues.

---

## ✨ Key Features

- **Pressure Score** — one public 0–100 urgency number per issue; rises with neglect, falls when authorities act
- **Issue DNA** — immutable, timestamped life-story of every issue; nothing can be hidden
- **Issue Aging** — Fresh → Aging → Neglected → Critical → Civic Failure, colouring the feed
- **AI severity scoring** — transparent and explainable, from visual + category + community signals
- **Problem Zones & predictive hotspots** — civic intelligence from the Watchtower Agent
- **Auto-generated weekly civic report**
- **Location-aware feed** — see issues around you, with distance filters and Active/Resolved views
- **Community verification** — proximity-weighted upvotes move issues Reported → Verified
- **Accounts & profiles** — email (with verification) + Google sign-in, points, badges, "My Reports"
- **Public Impact Dashboard** — a login-free transparency view of community civic health

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| AI | **Google Gemini 2.5 Flash** (`@google/genai`) — function calling, multimodal, structured output |
| Backend / data | **Firebase** — Firestore, Authentication (email + Google), Cloud Storage |
| Maps & location | **Google Maps Platform** — Maps JS, Places, Geocoding |
| Weather | Open-Meteo |
| Deploy | **Google Cloud Run** + **Cloud Build** + **Cloud Scheduler** |

All AI and geocoding calls run server-side — API keys never reach the browser.

---

## 🧭 Architecture

```
Citizen → Triage Agent (Gemini tool loop: geocode · dedupe · weather · severity) → Issue
↓
Firestore (real-time) ← Pressure Score · Issue DNA
↓
Cloud Scheduler → Watchtower Agent → Problem Zones · Hotspots · Weekly Report · Escalations
↓
Public Impact Dashboard (login-free)
```

---

## 🚀 Run Locally

```bash
npm install
# add .env.local with Firebase, Gemini, and Google Maps keys
npm run dev          # http://localhost:3000
npm run build        # production build
```

Deploy (Google Cloud Run):

```bash
gcloud run deploy fixit --source . --region asia-south1 --allow-unauthenticated
```

Ships as a multi-stage Docker container with Next.js output: "standalone".

---

## 🔒 Security

- Gemini & server-side Geocoding keys are server-only — never exposed to the client
- Browser Maps key is HTTP-referrer restricted; server geocoding key is API-restricted
- Firebase web config is public by design (security via Firestore rules + Auth)
- Firestore rules enforce append-only Issue DNA and owner-scoped profiles

---

Built with Next.js, Firebase, Google Maps Platform, and Google Gemini for the Vibe2Ship Hackathon — Coding Ninjas × Google for Developers, 2026.
