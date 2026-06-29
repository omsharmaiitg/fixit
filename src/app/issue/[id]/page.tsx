"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, MapPin, ArrowBigUp, Users, Check } from "lucide-react";
import { getIssueById, getSeverityLabel } from "@/lib/firebaseHelpers";
import {
  CATEGORY_EMOJIS,
  CATEGORY_LABELS,
  AGING_COLORS,
  AGING_LABELS,
  SEVERITY_COLORS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/constants";
import { PressureScore } from "@/components/PressureScore";
import { IssueDNA } from "@/components/IssueDNA";
import type { Issue, IssueStatus } from "@/types";

const STEP_ORDER: IssueStatus[] = [
  "reported",
  "verified",
  "acknowledged",
  "in_progress",
  "resolved",
];

function StatusTimeline({ status }: { status: IssueStatus }) {
  const reopened = status === "reopened";
  const currentIdx = reopened ? STEP_ORDER.length : STEP_ORDER.indexOf(status);
  const steps = status === "pending_confirmation"
    ? [...STEP_ORDER.slice(0, 4), "pending_confirmation" as IssueStatus]
    : STEP_ORDER;
  const activeIdx = status === "pending_confirmation" ? 4 : currentIdx;

  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = i <= activeIdx;
        const color = STATUS_COLORS[step];
        return (
          <div key={step} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done ? "" : "bg-slate-200"}`}
                style={done && i !== 0 ? { backgroundColor: color } : undefined} />
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: done ? color : "#cbd5e1" }}
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </div>
              <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? "opacity-0" : i < activeIdx ? "" : "bg-slate-200"}`}
                style={i < activeIdx ? { backgroundColor: STATUS_COLORS[steps[i + 1]] } : undefined} />
            </div>
            <span className="mt-1.5 text-center text-[9px] font-semibold leading-tight text-muted">
              {STATUS_LABELS[step].split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getIssueById(id)
      .then((data) => {
        if (alive) {
          setIssue(data);
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
  }, [id]);

  return (
    <div className="mx-auto w-full max-w-md pb-16">
      {/* back bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 bg-background/85 px-4 py-3 backdrop-blur-md">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground shadow-card transition active:scale-95"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="font-display text-base font-bold text-foreground">
          Issue details
        </span>
      </div>

      {loading && (
        <div className="space-y-4 px-4">
          <div className="h-48 w-full animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-24 w-full animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-200" />
        </div>
      )}

      {!loading && (error || !issue) && (
        <div className="mt-16 px-6 text-center">
          <p className="font-display text-lg font-bold text-foreground">
            Issue not found
          </p>
          <p className="mt-1 text-sm text-muted">
            {error ?? "This report may have been merged or removed."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white active:scale-95"
          >
            Back to feed
          </button>
        </div>
      )}

      {!loading && issue && (
        <div className="space-y-4 px-4">
          {/* photo gallery / hero */}
          {issue.photoUrls.length > 0 ? (
            <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {issue.photoUrls.map((url, i) => (
                <div
                  key={i}
                  className="relative h-52 w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-slate-100"
                >
                  <Image src={url} alt={`${issue.title} ${i + 1}`} fill sizes="90vw" className="object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-44 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 text-6xl">
              {CATEGORY_EMOJIS[issue.category]}
            </div>
          )}

          {/* header */}
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary-dark">
                {CATEGORY_LABELS[issue.category]}
              </span>
              {(() => {
                const sev = getSeverityLabel(issue.severity);
                return (
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold capitalize"
                    style={{
                      backgroundColor: `${SEVERITY_COLORS[sev]}1a`,
                      color: SEVERITY_COLORS[sev],
                    }}
                  >
                    {sev} · {issue.severity}/10
                  </span>
                );
              })()}
              <span
                className="rounded-md px-2 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: `${STATUS_COLORS[issue.status]}1a`,
                  color: STATUS_COLORS[issue.status],
                }}
              >
                {STATUS_LABELS[issue.status]}
              </span>
            </div>

            <h1 className="mt-2 font-display text-xl font-extrabold leading-tight text-foreground">
              {issue.title}
            </h1>
            {issue.description !== issue.title && (
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {issue.description}
              </p>
            )}

            <div className="mt-3 flex items-center gap-3 text-xs text-muted">
              <span>
                Reported by{" "}
                <span className="font-semibold text-foreground">
                  {issue.reporterName}
                </span>
              </span>
              <span>·</span>
              <span>{formatDistanceToNow(issue.reportedAt, { addSuffix: true })}</span>
            </div>
            {issue.coReporters.length > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <Users size={13} /> +{issue.coReporters.length} more reported this
              </p>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: AGING_COLORS[issue.agingStatus] }}
                />
                {AGING_LABELS[issue.agingStatus]}
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                <ArrowBigUp size={17} strokeWidth={2.2} />
                {issue.upvoteCount} upvotes
              </span>
            </div>
          </div>

          {/* pressure score */}
          <PressureScore
            score={issue.pressureScore}
            breakdown={issue.pressureBreakdown}
            size="lg"
          />

          {/* status timeline */}
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-3 font-display text-sm font-bold text-foreground">
              Lifecycle
            </p>
            <StatusTimeline status={issue.status} />
          </div>

          {/* location */}
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-2 font-display text-sm font-bold text-foreground">
              Location
            </p>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
              <MapPin size={18} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {issue.location.address}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {issue.location.lat.toFixed(5)}, {issue.location.lng.toFixed(5)}
                </p>
              </div>
            </div>
            {/* ponytail: real interactive Google Map lands in Phase 3 (maps loader) */}
          </div>

          {/* issue DNA */}
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-1 font-display text-sm font-bold text-foreground">
              Issue DNA
            </p>
            <p className="mb-3 text-xs text-muted">
              An immutable, timestamped biography. Nothing here can be edited.
            </p>
            <IssueDNA dna={issue.dna} reportedAt={issue.reportedAt} />
          </div>
        </div>
      )}
    </div>
  );
}
