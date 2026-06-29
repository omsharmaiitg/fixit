"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, ClipboardList, Plus, AlertTriangle } from "lucide-react";
import { getReporterId } from "@/lib/reporter";
import { getIssuesByReporter } from "@/lib/firebaseHelpers";
import { IssueCard } from "@/components/IssueCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import type { Issue } from "@/types";

export default function MyReportsPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getIssuesByReporter(getReporterId())
      .then((list) => {
        if (alive) {
          setIssues(list);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError((e as Error).message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28">
      {/* sticky header */}
      <header className="sticky top-0 z-40 -mx-4 flex items-center gap-3 bg-background/85 px-4 py-3 backdrop-blur-md">
        <Link
          href="/"
          aria-label="Back to feed"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground shadow-card transition active:scale-95"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-primary-dark">
            My Reports
          </h1>
          <p className="-mt-0.5 text-[11px] font-medium text-muted">
            Everything you&apos;ve put on the map
          </p>
        </div>
      </header>

      {!loading && !error && issues.length > 0 && (
        <p className="mb-3 mt-2 px-1 text-xs font-medium text-muted">
          <span className="font-bold text-foreground">{issues.length}</span>{" "}
          {issues.length === 1 ? "report" : "reports"} · newest first
        </p>
      )}

      {/* loading */}
      {loading && (
        <div className="mt-3 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* error */}
      {!loading && error && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-700">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <p className="text-sm font-semibold">Couldn&apos;t load your reports</p>
            <p className="text-xs text-red-600/80">{error}</p>
          </div>
        </div>
      )}

      {/* empty state */}
      {!loading && !error && issues.length === 0 && (
        <div className="mt-12 flex flex-col items-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList size={28} />
          </div>
          <h2 className="mt-4 font-display text-lg font-bold text-foreground">
            You haven&apos;t reported anything yet
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Spotted a pothole or broken light? Tap Report to put it on the map.
          </p>
          <Link
            href="/report"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-display font-bold text-white shadow-card transition active:scale-95"
          >
            <Plus size={18} strokeWidth={2.5} />
            Report an issue
          </Link>
        </div>
      )}

      {/* list */}
      {!loading && !error && issues.length > 0 && (
        <div className="space-y-3">
          {issues.map((issue, i) => (
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
              <IssueCard issue={issue} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
