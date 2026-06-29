# FixIt — Hyperlocal Problem Solver
### Product Vision & Submission Document
**Vibe2Ship Hackathon | Coding Ninjas × Google for Developers (2026)**

> Companion docs: `CLAUDE.md` (engineering source of truth) and `fixit_build_plan.md`
> (phased build order). This document is the narrative — and is structured so the final section can be
> pasted directly into the required Google Doc submission.

---

## THE PROBLEM

India's urban infrastructure is silently crumbling — not because nobody cares, but because there is no
system connecting the people who *see* problems with the people who can *fix* them, and no mechanism
that holds anyone accountable in between.

A resident spots a pothole that has already caused two accidents. The municipal helpline rings
endlessly; his WhatsApp message is buried under 200 others by afternoon. The pothole stays, worsens
after monsoon, and a third accident happens. A woman passes a pipe leaking near a transformer every
morning and assumes someone else has reported it; everyone assumes the same, and three weeks later the
transformer shorts and the street floods. A principal watches the streetlights outside his school stay
dark for six weeks despite two acknowledged letters; the children leave in darkness.

These are not rare stories — they happen in every ward, every day. The problem is not missing civic
infrastructure; India has corporations, councillors, and budgets. The problem is a **broken feedback
loop**: issues go unreported, reported issues go unverified, verified issues go untracked, and even
completed fixes go unseen. **FixIt is built to close that loop — completely.**

---

## SOLUTION OVERVIEW

FixIt is an **AI-agent-powered hyperlocal civic platform** that lets citizens report, verify,
track, and drive the resolution of infrastructure issues through intelligent automation, community
participation, and radical transparency.

It is not a complaint box and not a government portal. It is a **civic accountability engine** powered
by **two AI agents**:

- **The Triage Agent** turns a 45-second conversation (typed, spoken in any language, or photographed)
  into a structured, geocoded, severity-rated, de-duplicated civic data point — reasoning across live
  tools as it goes.
- **The Watchtower Agent** autonomously governs the whole corpus on a schedule: recomputing urgency,
  detecting failure clusters, predicting where problems will emerge next, writing weekly civic reports,
  and drafting escalations for issues being ignored.

Around these agents sits a transparent public record: every issue has an immutable life story
(**Issue DNA**), a single public urgency number (**Pressure Score**), and a community-verified
resolution flow that authorities cannot fake. It requires **no government buy-in** to create
accountability — it creates accountability through visibility.

---

## WHY THIS IS AGENTIC, NOT "AI-FEATURED"

The judging matrix weights **Agentic Depth at 20%**, equal to Problem Solving and Innovation. The
difference between a winning and a forgettable submission here is whether the AI *reasons and acts* or
merely *classifies*. FixIt is built around genuine agency:

**The Triage Agent (reactive).** When a citizen reports, the agent runs a **Gemini function-calling
loop**, not a single prompt. From one message it sees the photo, then *decides which tools to call*:
it geocodes the landmark, searches Firestore for a matching report within 50 metres, pulls live
weather for the location, and looks up the category's risk weight — branching between "merge into an
existing report" and "create a new one," asking a clarifying question only when it genuinely cannot
proceed. The reporting chat **shows these steps as they happen** ("🔎 Checking for nearby reports…
found one 30m away — adding your photo to it"). The reasoning is visible, multi-step, and tool-grounded.

**The Watchtower Agent (proactive).** On a schedule (Cloud Scheduler → Cloud Run), with no human in
the loop, it recomputes every Pressure Score, clusters issues into Problem Zones, predicts next week's
hotspots from 30 days of data and weather, writes each ward's weekly report, and — for neglected,
high-pressure, unacknowledged issues — **drafts a formal escalation memo** and notifies the citizens
who adopted that issue.

One agent serves a single citizen with tools and branching; one governs the city autonomously and
takes real actions (writes, notifications). That two-agent design is the spine of the product.

---

## KEY FEATURES (mapped to the three pillars: Transparency · Accountability · Participation)

### 1 — Effortless reporting *(Transparency · Participation)*
- **Conversational, multimodal capture.** No form. Talk, type, or photograph the issue; the Triage
  Agent structures it. Under 45 seconds end to end.
- **Multilingual & voice-first.** Report in Hindi, Tamil, Bengali, and more via voice; the agent
  understands and replies in the same language. This is the difference between reaching 50M English
  speakers and 500M citizens — and it roughly doubles addressable impact.
- **Dual-mode location.** Auto-detect GPS *or* drop a pin / describe a landmark the agent geocodes —
  because people often report an issue after they've already walked past it.
- **AI category + transparent severity.** Severity = `visual 0.5 + category-weight 0.3 + community 0.2`,
  shown as a tappable breakdown. Nothing is a black box.
- **Smart duplicate merging.** A second report of the same pothole becomes *additional evidence* on the
  original, not clutter — strengthening its case while keeping the map clean.
- **Offline-first capture.** Poor signal doesn't lose a report: photo, location, and text are queued
  locally and submitted (with triage) the moment the device reconnects.

### 2 — Trustworthy verification *(Transparency · Participation · Accountability)*
- **Location-weighted upvotes**; 3 upvotes move an issue from *Reported* to *Verified*. A non-adversarial
  "Can't find this" replaces downvotes.
- **Passive proximity verification** — when you walk within 50m of a reported issue, a one-tap "I'm
  near it — confirm?" banner turns every commute into a verification sweep.
- **Structured discussion** (six response types, not a free-text comment war), with a Gemini-generated
  pinned summary so a first-time visitor understands the whole thread in ten seconds.

### 3 — The Pressure Score & accountability engine *(Accountability · Transparency)*
- One public **0–100 urgency number** per issue, combining verification, age, severity, and weather —
  fully transparent and tappable. It *rises* with neglect and *falls* when authorities act.
- **Issue Aging** (Fresh → Civic Failure) bleeds color into the feed: a sea of orange and black cards
  tells the whole story without a chart.
- **Issue DNA** — an immutable, timestamped biography of every issue. Reopens are permanent record.
  There is nowhere to hide a failure to resolve.
- **Simulated authority layer** (`/admin`, clearly labelled) showing the top-3 highest-pressure issues,
  with acknowledge / in-progress / resolve actions.
- **Three-layer, community-verified resolution** — admin declaration → community confirmation (≥3 to
  lock resolved; ≥2 contradicting photos reopen it) → an AI before/after visual verdict. Resolution
  cannot be faked.

### 4 — The intelligence layer *(Transparency · Accountability)* — the Watchtower Agent's output
- **Problem Zones** — clusters of failure with an AI urban-planner analysis ("Sector 14 — 8 issues in
  30 days; primary: drainage; likely cause: heavy traffic + aging drains").
- **Environmental context** makes severity dynamic — a dry-Tuesday 5/10 pothole becomes a 7/10 after
  three days of rain.
- **Predictive hotspots** — amber risk overlays for where problems are likely to emerge next week.
- **Auto-generated weekly civic report** per ward — Glance, Highlight, The Shame, Top Contributor,
  Next-Week Watch, and a one-line Verdict. Factual, shareable, permalinked.
- **Escalation drafts** — for issues being ignored, the agent writes the memo and pings the people who
  care.

### 5 — Gamification & community identity *(Participation)*
Points and 7 badges tied to *real* civic actions; **Neighbourhood Squads** that auto-form by geography
and compete on a ward leaderboard; **Adopt an Issue** for personal advocacy; and shareable **Resolution
Cards** (before/after, days-to-fix, citizens involved) — the platform's most powerful organic growth
loop.

### 6 — Public transparency *(Transparency · Accountability)*
A login-free **Impact Dashboard** — live numbers, heatmap, category breakdown, resolution race, top
contributors, predicted hotspots, squad leaderboard — designed to look good on a community-centre screen.

---

## A REPRESENTATIVE END-TO-END JOURNEY

Day 0, 8:15am — Priya speaks: *"deep pothole on the main road near Blue Bell School, Sector 9."* The
**Triage Agent** transcribes, geocodes the landmark, finds no nearby duplicate, pulls weather, rates it
6/10, and drafts the report; she confirms in 40 seconds. By 9am, three commuters upvote → *Verified*,
Pressure 18. A rain forecast auto-upgrades severity to 8/10 (Pressure 29). Over days 1–2, photos,
upvotes, a proximity confirmation, and a "possible cause" push it into the admin top-3. The ward
**Acknowledges** (Pressure dips — accountability is rewarded). Day 4 In Progress; Day 6 Resolved with
an after-photo → 48-hour community review → 7 confirmations lock it. Day 7, a **Resolution Card** —
*"Pothole near Blue Bell School · Reported by Priya K. · Verified by 14 people · Fixed in 6 days"* — is
shared to a school WhatsApp group, bringing 22 new sign-ups. Meanwhile the **Watchtower Agent**, seeing
Sector 9's recurring road damage and the monsoon forecast, flags it as next week's hotspot.

---

## TECHNOLOGIES USED

**Frontend** — Next.js 14 (App Router), TypeScript, Tailwind CSS; mobile-first; deployed as a container.
**Backend / data** — Firebase Firestore (realtime), Firebase Auth (Google sign-in), Firebase Storage,
Firebase Cloud Messaging; Next.js server **route handlers** for all privileged logic (keys never reach
the browser). **AI** — Google **Gemini 2.5 Flash** via the `@google/genai` SDK: multimodal
understanding, **function calling** (the Triage Agent's tool loop), and **structured output** (zone
analysis, hotspots, weekly reports). **Scheduling** — Cloud Scheduler triggers the Watchtower Agent on
an authenticated Cloud Run endpoint. **Maps** — Google Maps Platform (Maps JS, Places, Geocoding).
**Weather** — Open-Meteo. **Deploy** — Google **Cloud Run**.

> Engineering note: earlier Gemini models (1.5/2.0 Flash) are retired and 404; the app pins
> `gemini-2.5-flash` via an environment variable so the model can be upgraded without code changes.

---

## GOOGLE TECHNOLOGIES UTILIZED

- **Google Gemini API (2.5 Flash)** — the engine for both agents: vision, function-calling tool loop,
  structured output.
- **Google AI Studio** — prompt and function-declaration development.
- **Google Cloud Run** — containerized deployment of the app and the agent endpoints.
- **Google Cloud Scheduler** — autonomous, scheduled invocation of the Watchtower Agent.
- **Google Maps Platform** — Maps JS, Places Autocomplete, Geocoding.
- **Firebase** — Firestore, Authentication, Storage, Cloud Messaging.

---

## WHAT THIS PLATFORM IS, REALLY

At the surface, a civic issue reporter. One layer down, a community verification and accountability
system. Deeper, an **agentic urban-intelligence platform** that turns scattered citizen observations
into structured, prioritised, actionable civic data — and acts on it. It needs no government
participation to be useful, because it creates accountability through radical transparency: every issue
a data point, every verification a community act, every resolution a shared win, and every failure to
resolve a permanent, public record.

---

---

# APPENDIX — SUBMISSION DOCUMENT (paste into the required Google Doc)

> The hackathon requires a Google Doc, shared "anyone with the link," containing exactly these sections.
> Keep version history visible. Fill the bracketed links before submitting.

**Problem Statement Selected**
Hyperlocal Problem Solver — enabling citizens to identify, report, validate, track, and resolve
community infrastructure issues through collaboration, data, and intelligent automation, with an
emphasis on transparency, accountability, and community participation.

**Solution Overview**
FixIt is an AI-agent-powered hyperlocal civic platform. A reactive **Triage Agent** converts a
multilingual, multimodal report into a structured, geocoded, severity-rated, de-duplicated civic data
point via a Gemini function-calling tool loop. A proactive **Watchtower Agent** autonomously scores
urgency, clusters failures into Problem Zones, predicts emerging hotspots, writes weekly civic reports,
and drafts escalations. A transparent public record — Issue DNA, the Pressure Score, and
community-verified resolution — creates accountability without requiring government participation.

**Key Features**
Conversational multimodal + voice-first multilingual reporting; AI category & transparent severity;
smart duplicate merging; offline-first capture; location-weighted + passive-proximity verification;
structured discussion with AI summaries; the Pressure Score & Issue Aging; immutable Issue DNA;
simulated authority layer; three-layer community-verified resolution with AI before/after verdict;
Problem Zones; dynamic environmental context; predictive hotspots; auto weekly civic reports; AI-drafted
escalations; points, badges, Neighbourhood Squads, Adopt-an-Issue, shareable Resolution Cards; and a
public Impact Dashboard.

**Technologies Used**
Next.js 14 (TypeScript, Tailwind), Firebase (Firestore, Auth, Storage, Cloud Messaging), Google Gemini
2.5 Flash (`@google/genai`), Google Maps Platform (Maps/Places/Geocoding), Open-Meteo, Google Cloud Run,
Google Cloud Scheduler.

**Google Technologies Utilized**
Google Gemini API (2.5 Flash — multimodal, function calling, structured output), Google AI Studio,
Google Cloud Run, Google Cloud Scheduler, Google Maps Platform, Firebase (Firestore, Authentication,
Storage, Cloud Messaging).

**Required Links**
- Deployed application (Google Cloud Run): `[ … ]`
- GitHub repository: `[ … ]`
- This document (anyone-with-link): `[ … ]`

*Document prepared for the Vibe2Ship Hackathon — Coding Ninjas × Google for Developers | 2026*
