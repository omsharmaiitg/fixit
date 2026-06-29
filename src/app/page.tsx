"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Bell,
  User,
  AlertTriangle,
  RotateCw,
  Sparkles,
  Trophy,
  MapPin,
} from "lucide-react";
import { useLocation } from "@/hooks/useLocation";
import { useIssues, sortIssues } from "@/hooks/useIssues";
import { FilterBar } from "@/components/FilterBar";
import { IssueCard } from "@/components/IssueCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { FABButton } from "@/components/FABButton";
import type { Issue } from "@/types";

type Tab = "active" | "resolved";

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
  const [tab, setTab] = useState<Tab>("active");
  const [distanceFilter, setDistanceFilter] = useState<number | null>(2000);
  const { userLat, userLng, requestLocation } = useLocation();
  const { issues, loading, error, refresh } = useIssues(
    distanceFilter,
    userLat,
    userLng,
  );

  // Greeting is time-of-day. Computed in an effect (not at render) so the
  // static prerender and the client agree — no hydration mismatch.
  const [greeting, setGreeting] = useState<string | null>(null);
  // Reverse-geocoded ward. `resolved` lets us tell "still locating" from
  // "located, but no name" so the line never hangs on "Pinpointing…".
  const [ward, setWard] = useState<{ value: string | null; resolved: boolean }>({
    value: null,
    resolved: false,
  });

  useEffect(() => {
    // Greeting depends on the client's clock, so it's read after mount — a
    // static prerender would otherwise freeze it to build time. One-shot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  // Ask for location once so distance filtering + labels work.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Reverse-geocode the ward via the server route (key stays server-side).
  // Key on coarse coords (~110m) so GPS jitter doesn't refetch.
  const latKey = userLat != null ? userLat.toFixed(3) : null;
  const lngKey = userLng != null ? userLng.toFixed(3) : null;
  useEffect(() => {
    if (!latKey || !lngKey) return;
    let alive = true;
    fetch(`/api/geocode?lat=${latKey}&lng=${lngKey}`)
      .then((r) => r.json())
      .then((d) => alive && setWard({ value: d.locality ?? null, resolved: true }))
      .catch(() => alive && setWard({ value: null, resolved: true }));
    return () => {
      alive = false;
    };
  }, [latKey, lngKey]);

  const wardLine =
    userLat == null
      ? "Turn on location to see your ward"
      : !ward.resolved
        ? "Pinpointing your area…"
        : (ward.value ?? "Near you");

  // `issues` is already distance-filtered by the subscription; split by tab,
  // then sort each tab on its own axis.
  const sorted = useMemo(() => {
    if (tab === "resolved") {
      return issues
        .filter((i) => i.status === "resolved")
        .sort((a, b) => resolvedTime(b) - resolvedTime(a));
    }
    return sortIssues(
      issues.filter((i) => i.status !== "resolved"),
      "pressure",
      userLat,
      userLng,
    );
  }, [issues, tab, userLat, userLng]);

  const kmLabel = distanceFilter ? `within ${distanceFilter / 1000} km` : "everywhere";

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28">
      {/* slim sticky app bar */}
      <header className="sticky top-0 z-40 -mx-4 flex items-center justify-between bg-background/85 px-4 py-2.5 backdrop-blur-md">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-primary-dark">
          FixIt
        </h1>
        <div className="flex items-center gap-2">
          <button
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted shadow-card transition active:scale-95"
          >
            <Bell size={18} strokeWidth={2} />
          </button>
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-card transition active:scale-95"
          >
            <User size={18} strokeWidth={2} />
          </Link>
        </div>
      </header>

      {/* warm personalized greeting — feed stays the focus below */}
      <section className="mt-3 rounded-3xl bg-gradient-to-br from-amber-50 via-surface to-surface p-5 shadow-card">
        {greeting ? (
          <h2 className="font-display text-[26px] font-extrabold leading-tight text-foreground">
            {greeting} <span className="align-middle">👋</span>
          </h2>
        ) : (
          <div className="h-7 w-44 animate-pulse rounded-full bg-slate-200" />
        )}
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-muted">
          <MapPin size={15} className="shrink-0 text-primary" strokeWidth={2.2} />
          <span className="truncate">{wardLine}</span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Here&apos;s what your neighbourhood needs today. Every report moves it
          up the list.
        </p>
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
      {!loading && !error && (
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
      {loading && !error && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* empty state */}
      {!loading && !error && sorted.length === 0 && (
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
      {!loading && !error && sorted.length > 0 && (
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
