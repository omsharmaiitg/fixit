"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { format } from "date-fns";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Pencil,
  LogOut,
  Plus,
  ClipboardList,
  Trophy,
  Lock,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCity } from "@/hooks/useCity";
import { getAllIssues } from "@/lib/firebaseHelpers";
import {
  computeGamification,
  deriveActivity,
  recomputeUserGamification,
  type GamificationSummary,
} from "@/lib/gamification";
import { getDb } from "@/lib/firebase";
import { IssueCard } from "@/components/IssueCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import type { Issue } from "@/types";

function initialsOf(name?: string | null, email?: string | null): string {
  const base = (name || email || "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { city } = useCity();

  const [reports, setReports] = useState<Issue[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [gam, setGam] = useState<GamificationSummary | null>(null);
  const [squadName, setSquadName] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);

  // Load the corpus once auth resolves: derive this user's reports + a LIVE
  // gamification read for instant display, then recompute-and-persist (which
  // also assigns a squad) in the background. State only set in async callbacks.
  useEffect(() => {
    if (loading || !user) return;
    const uid = user.uid;
    let alive = true;
    getAllIssues()
      .then((issues) => {
        if (!alive) return;
        const mine = issues
          .filter((i) => i.reporterId === uid)
          .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
        setReports(mine);
        setGam(computeGamification(deriveActivity(uid, issues)));
        setReportsLoading(false);
        recomputeUserGamification(uid, { issues, withSquad: true })
          .then((r) => alive && setSquadName(r.squadName))
          .catch(() => {});
      })
      .catch(() => alive && setReportsLoading(false));
    return () => {
      alive = false;
    };
  }, [loading, user]);

  // Bio lives only on the user doc (auth carries name/email/photo).
  useEffect(() => {
    if (loading || !user) return;
    let alive = true;
    getDoc(doc(getDb(), "users", user.uid))
      .then((snap) => {
        if (alive && typeof snap.data()?.bio === "string") setBio(snap.data()!.bio);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loading, user]);

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      router.push("/");
    }
  }

  // ── Logged out ──────────────────────────────────────────────────────────
  if (!loading && !user) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Trophy size={28} />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-foreground">
            Track your civic impact
          </h2>
          <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">
            Sign in to track your reports and earn civic points as your
            neighbourhood gets fixed.
          </p>
          <Link
            href="/auth"
            className="mt-5 rounded-full bg-primary px-6 py-2.5 font-display font-bold text-white shadow-card transition active:scale-95"
          >
            Sign in or create account
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading auth ────────────────────────────────────────────────────────
  if (loading || !user) {
    return (
      <div className="mx-auto w-full max-w-md px-5">
        <Header />
        <div className="mt-6 space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      </div>
    );
  }

  // ── Logged in ───────────────────────────────────────────────────────────
  const avatarUrl = user.photoURL;
  const reportsMade = reports.length;
  const resolvedCount = reports.filter((r) => r.status === "resolved").length;
  const points = gam?.points ?? 0;
  const level = gam?.level ?? "Newcomer";
  const badges = gam?.badges ?? [];
  const since = user.metadata?.creationTime
    ? format(new Date(user.metadata.creationTime), "MMM yyyy")
    : null;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-16">
      <Header />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="mt-2 space-y-5"
      >
        {/* identity */}
        <section className="rounded-2xl bg-surface p-4 shadow-card">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-display text-xl font-bold text-primary">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                initialsOf(user.displayName, user.email)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-bold text-foreground">
                {user.displayName || "Citizen"}
              </p>
              <p className="truncate text-sm text-muted">{user.email}</p>
              {since && <p className="mt-0.5 text-xs text-muted">Member since {since}</p>}
            </div>
            <Link
              href="/profile/edit"
              aria-label="Edit profile"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-foreground transition active:scale-95"
            >
              <Pencil size={15} />
            </Link>
          </div>

          {bio && <p className="mt-3 text-sm leading-relaxed text-foreground">{bio}</p>}

          {city && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-muted">
              <MapPin size={15} className="shrink-0 text-primary" strokeWidth={2.2} />
              {city.cityName}
            </p>
          )}

          <Link
            href="/profile/edit"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-primary transition active:scale-[0.98]"
          >
            <Pencil size={15} /> Edit profile
          </Link>
        </section>

        {/* stats */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="font-display text-2xl font-extrabold text-primary">{points}</p>
            <p className="text-xs font-medium text-muted">civic points · {level}</p>
          </div>
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="font-display text-2xl font-extrabold text-foreground">
              {reportsMade}
              <span className="ml-1 text-sm font-semibold text-green-600">
                · {resolvedCount} fixed
              </span>
            </p>
            <p className="text-xs font-medium text-muted">
              {reportsMade === 1 ? "report made" : "reports made"}
            </p>
          </div>
        </section>

        {/* neighbourhood squad */}
        {squadName && (
          <section className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
              🛡️
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-foreground">
                {squadName}
              </p>
              <p className="text-xs text-muted">Your neighbourhood squad</p>
            </div>
          </section>
        )}

        {/* badges */}
        <section>
          <h3 className="mb-2 font-display text-sm font-bold text-foreground">My Badges</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {badges.map((b) => (
              <div
                key={b.name}
                className={`flex flex-col items-center rounded-2xl p-3 text-center ${
                  b.earned ? "bg-surface shadow-card" : "bg-slate-100"
                }`}
              >
                <span className={`text-2xl ${b.earned ? "" : "opacity-30 grayscale"}`}>
                  {b.emoji}
                </span>
                <p
                  className={`mt-1 text-[11px] font-semibold leading-tight ${
                    b.earned ? "text-foreground" : "text-muted"
                  }`}
                >
                  {b.name}
                </p>
                <p className="mt-0.5 flex items-center gap-0.5 text-[9px] leading-tight text-muted">
                  {!b.earned && <Lock size={8} />}
                  {b.earned ? "Earned" : b.hint}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* my reports */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-foreground">My Reports</h3>
            <Link href="/report" className="text-xs font-semibold text-primary">
              + New
            </Link>
          </div>
          {reportsLoading ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl bg-surface p-6 text-center shadow-card">
              <ClipboardList size={24} className="text-primary" />
              <p className="mt-2 text-sm font-semibold text-foreground">
                No reports yet
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Spotted a pothole or broken light? Put it on the map.
              </p>
              <Link
                href="/report"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95"
              >
                <Plus size={15} /> Report an issue
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((issue, i) => (
                <motion.div
                  key={issue.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <IssueCard issue={issue} />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* account */}
        <section className="rounded-2xl bg-surface p-4 shadow-card">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-600 transition active:scale-[0.98]"
          >
            <LogOut size={16} /> Sign out
          </button>
        </section>
      </motion.div>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 -mx-5 flex items-center gap-3 bg-background/85 px-5 py-3 backdrop-blur-md">
      <Link
        href="/"
        aria-label="Back to feed"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground shadow-card transition active:scale-95"
      >
        <ArrowLeft size={18} />
      </Link>
      <h1 className="font-display text-xl font-extrabold tracking-tight text-primary-dark">
        Profile
      </h1>
    </header>
  );
}
