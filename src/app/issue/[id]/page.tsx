"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  MapPin,
  ArrowBigUp,
  Users,
  Check,
  SearchX,
  CircleCheck,
  CircleX,
} from "lucide-react";
import {
  getIssueById,
  getSeverityLabel,
  upvoteIssue,
  cantFindIssue,
  confirmResolution,
  RESOLVE_CONFIRM_THRESHOLD,
  RESOLVE_CONTRADICT_THRESHOLD,
} from "@/lib/firebaseHelpers";
import { calculatePressureScore, BASELINE_WEIGHT } from "@/lib/pressureScore";
import { resolveUpvoteWeight } from "@/lib/upvoteLocation";
import { recomputeUserGamification } from "@/lib/gamification";
import { getReporterId } from "@/lib/reporter";
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
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { useRequireAuth, LoginPrompt } from "@/components/LoginPrompt";
import { useAuth } from "@/contexts/AuthContext";
import type { Issue, IssueStatus } from "@/types";

const STEP_ORDER: IssueStatus[] = [
  "reported",
  "verified",
  "acknowledged",
  "in_progress",
  "resolved",
];

// Toggle this reporter's upvote on a local copy of the issue, keeping
// upvoteCount === upvotedBy.length, freezing the proximity weight on cast, and
// recomputing pressure. Its own inverse (same weight), so calling it again
// reverts an optimistic update.
function toggleUpvoteLocal(issue: Issue, reporterId: string, weight: number): Issue {
  const upvotedBy = [...(issue.upvotedBy ?? [])];
  const weights = { ...(issue.upvoteWeights ?? {}) };
  const i = upvotedBy.indexOf(reporterId);
  if (i >= 0) {
    upvotedBy.splice(i, 1);
    delete weights[reporterId];
  } else {
    upvotedBy.push(reporterId);
    weights[reporterId] = weight;
  }
  const next = { ...issue, upvotedBy, upvoteCount: upvotedBy.length, upvoteWeights: weights };
  const { score, breakdown } = calculatePressureScore(next);
  next.pressureScore = score;
  next.pressureBreakdown = breakdown;
  return next;
}

function toggleCantFindLocal(issue: Issue, reporterId: string): Issue {
  const cantFindBy = [...(issue.cantFindBy ?? [])];
  const i = cantFindBy.indexOf(reporterId);
  if (i >= 0) cantFindBy.splice(i, 1);
  else cantFindBy.push(reporterId);
  return { ...issue, cantFindBy, cantFindCount: cantFindBy.length };
}

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
  const { user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reporterId, setReporterId] = useState("");
  const [upBusy, setUpBusy] = useState(false);
  const [cfBusy, setCfBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const { promptOpen, closePrompt, requireAuth } = useRequireAuth();

  useEffect(() => {
    // Reporter id isn't available during SSR; resolve it after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReporterId(getReporterId());
  }, []);

  const upvoteActive =
    reporterId !== "" && !!issue && (issue.upvotedBy ?? []).includes(reporterId);
  const cantFindActive =
    reporterId !== "" && !!issue && (issue.cantFindBy ?? []).includes(reporterId);

  // Toggle: optimistic local update (its own inverse on error), then persist.
  // Both actions require login (gate runs before the optimistic update).
  function handleUpvote() {
    requireAuth(async () => {
      if (!reporterId || upBusy || !issue) return;
      setUpBusy(true);
      // No known location on this page — prompt once at tap, unless un-voting.
      const removing = (issue.upvotedBy ?? []).includes(reporterId);
      const weight = removing
        ? BASELINE_WEIGHT
        : await resolveUpvoteWeight(issue.location.lat, issue.location.lng);
      setIssue((prev) => prev && toggleUpvoteLocal(prev, reporterId, weight));
      try {
        await upvoteIssue(id, reporterId, weight);
        void recomputeUserGamification(reporterId).catch(() => {});
      } catch {
        setIssue((prev) => prev && toggleUpvoteLocal(prev, reporterId, weight));
      } finally {
        setUpBusy(false);
      }
    });
  }

  function handleCantFind() {
    requireAuth(async () => {
      if (!reporterId || cfBusy) return;
      setCfBusy(true);
      setIssue((prev) => prev && toggleCantFindLocal(prev, reporterId));
      try {
        await cantFindIssue(id, reporterId);
      } catch {
        setIssue((prev) => prev && toggleCantFindLocal(prev, reporterId));
      } finally {
        setCfBusy(false);
      }
    });
  }

  // Community vote on a submitted resolution. The transition (resolved/reopened)
  // is non-trivial, so we re-read the doc after the write rather than mirror the
  // threshold logic optimistically.
  function handleResolveVote(agree: boolean) {
    requireAuth(async () => {
      if (!reporterId || resolveBusy) return;
      setResolveBusy(true);
      try {
        await confirmResolution(id, reporterId, agree);
        const fresh = await getIssueById(id);
        if (fresh) setIssue(fresh);
        void recomputeUserGamification(reporterId).catch(() => {});
      } finally {
        setResolveBusy(false);
      }
    });
  }

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

  // Anonymity is display-only: hide the real name from everyone EXCEPT the
  // reporter viewing their own report (uid matches the stored reporterId).
  // Legacy docs without isAnonymous read as not-anonymous.
  const showAnonymous =
    !!issue && issue.isAnonymous === true && user?.uid !== issue.reporterId;
  const reporterDisplayName = showAnonymous ? "Anonymous" : issue?.reporterName;
  // Same rule for the reporter-authored "reported" DNA node's actor.
  const dnaForView =
    issue && showAnonymous
      ? issue.dna.map((d) => (d.type === "reported" ? { ...d, actor: "Anonymous" } : d))
      : (issue?.dna ?? []);

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
                  {reporterDisplayName}
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

            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
              <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: AGING_COLORS[issue.agingStatus] }}
                />
                {AGING_LABELS[issue.agingStatus]}
              </span>

              <button
                onClick={handleUpvote}
                disabled={upBusy}
                aria-pressed={upvoteActive}
                aria-label={upvoteActive ? "Remove your upvote" : "Upvote this issue"}
                className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
                  upvoteActive ? "bg-primary/10 text-primary" : "bg-slate-100 text-foreground"
                }`}
              >
                <ArrowBigUp
                  size={17}
                  strokeWidth={2.2}
                  fill={upvoteActive ? "currentColor" : "none"}
                />
                {issue.upvoteCount} {issue.upvoteCount === 1 ? "upvote" : "upvotes"}
              </button>

              <button
                onClick={handleCantFind}
                disabled={cfBusy}
                aria-pressed={cantFindActive}
                aria-label="Report that you can't find this issue"
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
                  cantFindActive ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-muted"
                }`}
              >
                <SearchX size={16} strokeWidth={2.2} />
                {cantFindActive ? "Can't find ✓" : "Can't find"}
              </button>
            </div>
          </div>

          {/* before/after on a confirmed fix */}
          {issue.status === "resolved" &&
            issue.resolutionPhotoUrl &&
            issue.photoUrls[0] && (
              <div className="rounded-2xl bg-surface p-4 shadow-card">
                <p className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
                  <Check size={16} className="text-[#16a34a]" /> Fixed — see the change
                </p>
                <BeforeAfterSlider
                  beforeUrl={issue.photoUrls[0]}
                  afterUrl={issue.resolutionPhotoUrl}
                />
              </div>
            )}

          {/* community confirmation window */}
          {issue.status === "pending_confirmation" && (
            <ResolutionConfirm
              issue={issue}
              reporterId={reporterId}
              busy={resolveBusy}
              onVote={handleResolveVote}
            />
          )}

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
            <IssueDNA dna={dnaForView} reportedAt={issue.reportedAt} />
          </div>
        </div>
      )}

      <LoginPrompt open={promptOpen} onClose={closePrompt} />
    </div>
  );
}

function ResolutionConfirm({
  issue,
  reporterId,
  busy,
  onVote,
}: {
  issue: Issue;
  reporterId: string;
  busy: boolean;
  onVote: (agree: boolean) => void;
}) {
  const confirmCount = issue.resolveConfirmCount ?? 0;
  const contradictCount = issue.resolveContradictCount ?? 0;
  const myStance = (issue.resolveConfirmBy ?? []).includes(reporterId)
    ? "confirm"
    : (issue.resolveContradictBy ?? []).includes(reporterId)
      ? "contradict"
      : null;

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card">
      <p className="font-display text-sm font-bold text-foreground">
        A fix was submitted — is it actually fixed?
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        {RESOLVE_CONFIRM_THRESHOLD} confirmations marks it resolved;{" "}
        {RESOLVE_CONTRADICT_THRESHOLD} reports of &quot;still broken&quot; reopen it.
      </p>

      {issue.resolutionPhotoUrl && (
        <div className="relative mt-3 h-44 w-full overflow-hidden rounded-xl bg-slate-100">
          <Image
            src={issue.resolutionPhotoUrl}
            alt="Submitted resolution"
            fill
            sizes="(max-width: 480px) 100vw, 480px"
            className="object-cover"
          />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onVote(true)}
          disabled={busy}
          aria-pressed={myStance === "confirm"}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
            myStance === "confirm"
              ? "bg-[#16a34a] text-white"
              : "bg-[#16a34a]/10 text-[#15803d]"
          }`}
        >
          <CircleCheck size={16} strokeWidth={2.3} /> Looks fixed
        </button>
        <button
          onClick={() => onVote(false)}
          disabled={busy}
          aria-pressed={myStance === "contradict"}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
            myStance === "contradict"
              ? "bg-[#dc2626] text-white"
              : "bg-[#dc2626]/10 text-[#b91c1c]"
          }`}
        >
          <CircleX size={16} strokeWidth={2.3} /> Still broken
        </button>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
          {confirmCount} of {RESOLVE_CONFIRM_THRESHOLD} confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
          {contradictCount} say not fixed
        </span>
      </div>
    </div>
  );
}
