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
import { useLocation } from "@/hooks/useLocation";
import { useIssues, sortIssues } from "@/hooks/useIssues";
import { useCity } from "@/hooks/useCity";
import { haversineDistance } from "@/lib/firebaseHelpers";
import { FilterBar } from "@/components/FilterBar";
import { CityPicker } from "@/components/CityPicker";
import { IssueCard } from "@/components/IssueCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { FABButton } from "@/components/FABButton";
import { useAuth } from "@/contexts/AuthContext";
import type { City } from "@/lib/city";
import type { Issue } from "@/types";

// Hard cap: the feed never shows issues beyond this from the chosen city center.
const CITY_RADIUS_M = 65_000;

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

export default function HomePage() {
  const { user } = useAuth();
  const { city, resolved: cityResolved, setCity } = useCity();
  const [tab, setTab] = useState<Tab>("active");
  const [distanceFilter, setDistanceFilter] = useState<number | null>(2000);
  const { userLat, userLng, requestLocation } = useLocation();
  // Pull the full corpus; we apply the 65km city cap + distance-pill filter below.
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

  // Ask for location once so the distance pills can use live GPS.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // 65km hard cap around the chosen city, then the distance-pill filter — pills
  // measure from live GPS when available, else from the city center. "All"
  // (distanceFilter null) = the full city radius.
  const cityFiltered = useMemo(() => {
    if (!city) return [];
    let pool = issues.filter(
      (i) =>
        haversineDistance(city.cityLat, city.cityLng, i.location.lat, i.location.lng) <=
        CITY_RADIUS_M,
    );
    if (distanceFilter != null) {
      const cLat = userLat ?? city.cityLat;
      const cLng = userLng ?? city.cityLng;
      pool = pool.filter(
        (i) =>
          haversineDistance(cLat, cLng, i.location.lat, i.location.lng) <= distanceFilter,
      );
    }
    return pool;
  }, [issues, city, distanceFilter, userLat, userLng]);

  const sorted = useMemo(() => {
    if (tab === "resolved") {
      return cityFiltered
        .filter((i) => i.status === "resolved")
        .sort((a, b) => resolvedTime(b) - resolvedTime(a));
    }
    return sortIssues(
      cityFiltered.filter((i) => i.status !== "resolved"),
      "pressure",
      userLat,
      userLng,
    );
  }, [cityFiltered, tab, userLat, userLng]);

  // Treat "city still resolving" as loading so the feed doesn't flash empty.
  const showLoading = loading || !cityResolved;

  // First run / no city chosen → onboarding picker before the feed.
  if (cityResolved && !city) {
    return <CityOnboarding onPick={setCity} />;
  }

  const kmLabel = distanceFilter ? `within ${distanceFilter / 1000} km` : "everywhere";

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
          <span className="truncate">{city?.cityName ?? "Choose your city"}</span>
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

      <FilterBar value={distanceFilter} onChange={setDistanceFilter} />

      {/* count summary */}
      {!showLoading && !error && (
        <p className="mb-3 mt-1 px-1 text-xs font-medium text-muted">
          <span className="font-bold text-foreground">{sorted.length}</span>{" "}
          {tab === "resolved"
            ? `resolved ${kmLabel} · most recent first`
            : `open ${sorted.length === 1 ? "issue" : "issues"} ${kmLabel} · sorted by pressure`}
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
      {!showLoading && !error && sorted.length === 0 && (
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
                When an issue {kmLabel} gets resolved and the community confirms
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
                Nothing reported {kmLabel}. Spotted a pothole, a dark streetlight,
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
              <IssueCard issue={issue} userLat={userLat} userLng={userLng} />
            </motion.div>
          ))}
        </div>
      )}

      <FABButton />
    </div>
  );
}

// First-run city selection. Shown until a city is chosen; the choice is then
// persisted (cookie for guests, user doc when logged in) by useCity.setCity.
function CityOnboarding({ onPick }: { onPick: (city: City) => void }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary-dark">
          Welcome to FixIt 👋
        </h1>
        <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-muted">
          <MapPin size={15} className="shrink-0 text-primary" strokeWidth={2.2} />
          Which city are you in?
        </div>
        <p className="mt-3 mb-4 text-sm leading-relaxed text-muted">
          We&apos;ll show you civic issues reported across your city, so your feed
          stays local and relevant.
        </p>
        <CityPicker onPick={onPick} />
      </motion.div>
    </div>
  );
}
