"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  User,
  AlertTriangle,
  RotateCw,
  Sparkles,
  Trophy,
  MapPin,
  BarChart3,
} from "lucide-react";
import { useIssues, sortIssues } from "@/hooks/useIssues";
import { haversineDistance } from "@/lib/firebaseHelpers";
import { FilterBar } from "@/components/FilterBar";
import { IssueCard } from "@/components/IssueCard";
import { ExploreBanner } from "@/components/ExploreBanner";
import { SkeletonCard } from "@/components/SkeletonCard";
import { FABButton } from "@/components/FABButton";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationContext } from "@/contexts/LocationContext";
import { Landing } from "@/components/Landing";
import { isNamedCity } from "@/lib/city";
import { ENTERED_APP_KEY } from "@/lib/constants";
import type { Issue } from "@/types";

// Shown wherever the home city would appear when GPS is off/denied/unavailable.
const GPS_UNAVAILABLE = "Location unavailable — turn on GPS to fetch home city.";

// The feed scope ("All" filter): issues within this radius of the active anchor
// (live GPS, else the profile city center). Nothing beyond it ever shows.
const FEED_RADIUS_M = 65_000;

// Warm civic subtitles, one picked at random per app load.
const SUBTITLES = [
  "Here's what your neighbourhood needs today.",
  "Your ward is counting on eyes like yours.",
  "Small reports, real change — let's go.",
  "Every report you make moves your street up the list.",
  "Spot it, report it, watch your city respond.",
  "The fastest fixes start with one honest report.",
  "Your block gets better the moment you speak up.",
  "Be the reason something gets fixed this week.",
];

type Tab = "active" | "resolved";

function initialsOf(name?: string | null, email?: string | null): string {
  const base = (name || email || "").trim();
  if (!base) return "";
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

// Recency of resolution = timestamp of the issue's `resolved` DNA entry,
// falling back to updatedAt if (somehow) absent.
function resolvedTime(issue: Issue): number {
  const entry = issue.dna.filter((d) => d.type === "resolved").pop();
  return (entry?.timestamp ?? issue.updatedAt).getTime();
}

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

// ─── entry gate ───────────────────────────────────────────────────────────────
// First-time, logged-out visitors get the landing page front door. One choice
// ("Get started" → existing /auth flow, or "Continue as guest") marks the
// session as entered; signed-in users skip it entirely. Explicit logout clears
// the flag (profile page), so only then does the landing reappear.
export default function HomePage() {
  const { user, loading } = useAuth();
  const [entered, setEntered] = useState<boolean | null>(null); // null = flag not read yet

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntered(sessionStorage.getItem(ENTERED_APP_KEY) === "1");
  }, []);

  if (user || entered) return <Feed />;
  if (entered === null || loading) {
    // Still resolving the session flag / auth state — a wordmark beat instead
    // of flashing the feed at someone who's about to see the landing page.
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <span className="font-display text-2xl font-extrabold tracking-tight text-primary-dark">
          FixIt
        </span>
      </div>
    );
  }
  return (
    <Landing
      onGuest={() => {
        sessionStorage.setItem(ENTERED_APP_KEY, "1");
        setEntered(true);
      }}
    />
  );
}

function Feed() {
  const { user } = useAuth();
  // Single source of truth for where the user is and what city they're viewing.
  const {
    isExploring,
    canAct,
    activeCity,
    homeCity,
    resolved,
    gpsLat,
    gpsLng,
  } = useLocationContext();
  const [tab, setTab] = useState<Tab>("active");
  const [distanceFilter, setDistanceFilter] = useState<number | null>(2000);
  // Pull the full corpus; we apply the 65km anchor scope + distance-pill filter below.
  const { issues, loading, error, refresh } = useIssues(null, null, null);

  // Greeting (time-of-day) + subtitle (random) are client-only — read in an
  // effect so the static prerender and client agree (no hydration mismatch).
  const [greeting, setGreeting] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingForHour(new Date().getHours()));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubtitle(SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)]);
  }, []);

  // First name only, when signed in — guests get the bare time greeting.
  const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? null;

  // GPS is requested by LocationContext on app load — no need to ask here.

  // Reverse-geocode the GPS position into a confident "Area, State" label for
  // the greeting (server route keeps the key server-side). Keyed on coarse
  // coords so jitter doesn't refetch; the result is cached in state and reused.
  const [ward, setWard] = useState<{ value: string | null; resolved: boolean }>({
    value: null,
    resolved: false,
  });
  const latKey = gpsLat != null ? gpsLat.toFixed(3) : null;
  const lngKey = gpsLng != null ? gpsLng.toFixed(3) : null;
  useEffect(() => {
    if (!latKey || !lngKey) return;
    let alive = true;
    fetch(`/api/geocode?lat=${latKey}&lng=${lngKey}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        // Build the full detailed area: neighbourhood, city, state — deduped and
        // ordered most-specific first (e.g. "Adarsh Colony, Shamli, Uttar Pradesh"
        // or "Shamli, Uttar Pradesh"), rather than a single city token.
        const seen = new Set<string>();
        const parts: string[] = [];
        for (const p of [d.locality, d.city, d.region] as (string | null)[]) {
          const t = p?.trim();
          if (t && !seen.has(t.toLowerCase())) {
            seen.add(t.toLowerCase());
            parts.push(t);
          }
        }
        setWard({ value: parts.length ? parts.join(", ") : null, resolved: true });
      })
      .catch(() => alive && setWard({ value: null, resolved: true }));
    return () => {
      alive = false;
    };
  }, [latKey, lngKey]);

  // Home-city feed anchor: live GPS first, home-city center as fallback. Both
  // the 65km scope and the 1/2/5km pills measure from this single anchor. (Only
  // used when NOT exploring.)
  const anchorLat = gpsLat ?? homeCity?.cityLat ?? null;
  const anchorLng = gpsLng ?? homeCity?.cityLng ?? null;

  // When exploring another city, scope from that city's center. We use the SAME
  // 65km geo-scope the dashboard uses (not a cityName match) so the two always
  // reconcile — many legacy issues have no cityName, and equality would silently
  // drop them. The 1/2/5km pills are hidden while exploring.
  const exploreLat = activeCity?.cityLat ?? null;
  const exploreLng = activeCity?.cityLng ?? null;

  const scoped = useMemo(() => {
    if (isExploring) {
      if (exploreLat == null || exploreLng == null) return [];
      return issues.filter(
        (i) =>
          haversineDistance(exploreLat, exploreLng, i.location.lat, i.location.lng) <=
          FEED_RADIUS_M,
      );
    }
    if (anchorLat == null || anchorLng == null) return [];
    const within = (i: Issue, max: number) =>
      haversineDistance(anchorLat, anchorLng, i.location.lat, i.location.lng) <= max;
    let pool = issues.filter((i) => within(i, FEED_RADIUS_M));
    if (distanceFilter != null) pool = pool.filter((i) => within(i, distanceFilter));
    return pool;
  }, [issues, isExploring, exploreLat, exploreLng, anchorLat, anchorLng, distanceFilter]);

  // Anchor used for proximity tiebreaks in the sort + card distance labels.
  const sortLat = isExploring ? exploreLat : anchorLat;
  const sortLng = isExploring ? exploreLng : anchorLng;

  const sorted = useMemo(() => {
    if (tab === "resolved") {
      return scoped
        .filter((i) => i.status === "resolved")
        .sort((a, b) => resolvedTime(b) - resolvedTime(a));
    }
    return sortIssues(
      scoped.filter((i) => i.status !== "resolved"),
      "pressure",
      sortLat,
      sortLng,
    );
  }, [scoped, tab, sortLat, sortLng]);

  // Greeting location label:
  //  • Home (live GPS) → the user's EXACT reverse-geocoded area ("Area, State"
  //    or the locality), reusing the cached result. If the geocoder couldn't
  //    name it, we derive the area from the issues actually in range.
  //  • Exploring another city → "Viewing {city}".
  //  • GPS off/denied → the unavailable message (no stored-city fallback).
  const cityFromModel =
    (isNamedCity(activeCity?.cityName) ? activeCity!.cityName : null) ??
    (isNamedCity(homeCity?.cityName) ? homeCity!.cityName : null);
  // Most common real cityName among the issues in range (e.g. "Shamli") — used
  // only when the model/geocoder gave us nothing better than the sentinel.
  const derivedArea = useMemo(() => {
    const tally = new Map<string, number>();
    for (const i of scoped) {
      const n = i.cityName?.trim();
      if (isNamedCity(n)) tally.set(n, (tally.get(n) ?? 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [scoped]);

  // Not exploring → live home city/locality only (never an "active city" label).
  // Exploring → "Viewing {activeCity}". GPS off → the unavailable message.
  let locationLabel: string;
  if (isExploring) {
    locationLabel = `Viewing ${cityFromModel ?? derivedArea ?? activeCity?.cityName ?? "this city"}`;
  } else if (homeCity == null) {
    locationLabel = resolved ? GPS_UNAVAILABLE : "Pinpointing your area…";
  } else if (!ward.resolved) {
    locationLabel = "Pinpointing your area…";
  } else {
    locationLabel = ward.value ?? cityFromModel ?? derivedArea ?? "Near you";
  }

  // GPS off/denied and settled → no anchor, no fallback: show the message in the
  // feed area instead of endless skeletons.
  const gpsUnavailable = !isExploring && resolved && homeCity == null;

  // Skeletons while we resolve an anchor (GPS or city) or the corpus loads. When
  // exploring we don't need the home anchor — just the corpus.
  const showLoading =
    !gpsUnavailable && (loading || (!isExploring && anchorLat == null));

  // Count-line suffix: city name when exploring, distance band otherwise.
  const scopeLabel = isExploring
    ? `in ${activeCity?.cityName ?? "this city"}`
    : distanceFilter
      ? `within ${distanceFilter / 1000} km`
      : "across your area";

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28">
      {/* slim sticky app bar */}
      <header className="sticky top-0 z-40 -mx-4 flex items-center justify-between bg-background/85 px-4 py-2.5 backdrop-blur-md">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-primary-dark">
          FixIt
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            aria-label="Impact dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted shadow-card transition active:scale-95"
          >
            <BarChart3 size={18} strokeWidth={2} />
          </Link>
          <Link
            href="/profile"
            aria-label={user ? "Profile" : "Sign in"}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold text-white shadow-card transition active:scale-95"
          >
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="avatar" className="h-full w-full object-cover" />
            ) : user ? (
              initialsOf(user.displayName, user.email)
            ) : (
              <User size={18} strokeWidth={2} />
            )}
          </Link>
        </div>
      </header>

      {/* warm personalized greeting — feed stays the focus below */}
      <section className="mt-3 rounded-3xl bg-gradient-to-br from-amber-50 via-surface to-surface p-5 shadow-card">
        {greeting ? (
          <h2 className="font-display text-[26px] font-extrabold leading-tight text-foreground">
            {greeting}
            {firstName ? `, ${firstName}` : ""} <span className="align-middle">👋</span>
          </h2>
        ) : (
          <div className="h-7 w-44 animate-pulse rounded-full bg-slate-200" />
        )}
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-muted">
          <MapPin size={15} className="shrink-0 text-primary" strokeWidth={2.2} />
          <span className="truncate">{locationLabel}</span>
        </p>
        {subtitle && (
          <p className="mt-3 text-sm leading-relaxed text-muted">{subtitle}</p>
        )}
      </section>

      {/* top-level tabs */}
      <div className="mt-2 flex gap-1 rounded-full bg-surface p-1 shadow-card">
        {(
          [
            { id: "active", label: "Active" },
            { id: "resolved", label: "Resolved" },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          const accent = t.id === "resolved" ? "bg-green-600" : "bg-primary";
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition active:scale-[0.98] ${
                active ? `${accent} text-white` : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Distance pills only make sense in the home city — hidden while exploring. */}
      {!isExploring && (
        <FilterBar value={distanceFilter} onChange={setDistanceFilter} />
      )}

      {/* While exploring another city, a slim banner + a way back to home. */}
      {isExploring && (
        <div className="mt-2">
          <ExploreBanner />
        </div>
      )}

      {/* GPS off/denied — no home city, no fallback */}
      {gpsUnavailable && !error && (
        <div className="mt-6 flex flex-col items-center rounded-2xl bg-surface p-6 text-center shadow-card">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MapPin size={26} strokeWidth={2} />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">{GPS_UNAVAILABLE}</p>
          <p className="mt-1 text-xs text-muted">
            Your home city is set automatically from your live location.
          </p>
        </div>
      )}

      {/* count summary */}
      {!showLoading && !error && !gpsUnavailable && (
        <p className="mb-3 mt-1 px-1 text-xs font-medium text-muted">
          <span className="font-bold text-foreground">{sorted.length}</span>{" "}
          {tab === "resolved"
            ? `resolved ${scopeLabel} · most recent first`
            : `open ${sorted.length === 1 ? "issue" : "issues"} ${scopeLabel} · sorted by pressure`}
        </p>
      )}

      {/* error */}
      {error && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-700">
          <AlertTriangle size={20} className="shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Couldn&apos;t load the feed</p>
            <p className="text-xs text-red-600/80">{error}</p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            <RotateCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* loading skeletons */}
      {showLoading && !error && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* empty state */}
      {!showLoading && !error && !gpsUnavailable && sorted.length === 0 && (
        <div className="mt-10 flex flex-col items-center px-6 text-center">
          {tab === "resolved" ? (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                <Trophy size={28} />
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-foreground">
                No fixes yet — be the first to drive one
              </h2>
              <p className="mt-1 text-sm text-muted">
                When an issue {scopeLabel} gets resolved and the community confirms
                it, the win lands here.
              </p>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles size={28} />
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-foreground">
                No issues here yet
              </h2>
              <p className="mt-1 text-sm text-muted">
                Nothing reported {scopeLabel}. Spotted a pothole, a dark streetlight,
                an overflowing drain? Be the first to put it on the map.
              </p>
            </>
          )}
        </div>
      )}

      {/* feed */}
      {!showLoading && !error && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((issue, i) => (
            <motion.div
              key={issue.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.28,
                delay: Math.min(i * 0.04, 0.4),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <IssueCard
                issue={issue}
                userLat={isExploring ? null : anchorLat}
                userLng={isExploring ? null : anchorLng}
                canAct={canAct}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Reporting is an action — only offered when the user can actually act
          (live GPS, in their home city). Removed, not just disabled, otherwise. */}
      {canAct && <FABButton />}
    </div>
  );
}
