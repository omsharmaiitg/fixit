"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowBigUp, Dna, MessageSquare, Clock, SearchX } from "lucide-react";
import type { Issue, VoteState } from "@/types";
import {
  CATEGORY_EMOJIS,
  CATEGORY_LABELS,
  AGING_COLORS,
  AGING_LABELS,
  SEVERITY_COLORS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/constants";
import {
  getSeverityLabel,
  haversineDistance,
  setVote,
  applyVoteLocal,
} from "@/lib/firebaseHelpers";
import { getPressureColor, BASELINE_WEIGHT } from "@/lib/pressureScore";
import { resolveUpvoteWeight } from "@/lib/upvoteLocation";
import { recomputeUserGamification } from "@/lib/gamification";
import { getReporterId } from "@/lib/reporter";
import { useRequireAuth, LoginPrompt } from "@/components/LoginPrompt";

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function IssueCard({
  issue,
  userLat,
  userLng,
  canAct = true,
}: {
  issue: Issue;
  userLat?: number | null;
  userLng?: number | null;
  // When false (e.g. browsing another city, or no live GPS), the card is
  // read-only: the upvote and "Can't find" controls are removed entirely.
  canAct?: boolean;
}) {
  const sevLabel = getSeverityLabel(issue.severity);
  const sevColor = SEVERITY_COLORS[sevLabel];
  const photo = issue.photoUrls[0];
  const distance =
    userLat != null && userLng != null
      ? haversineDistance(userLat, userLng, issue.location.lat, issue.location.lng)
      : null;
  const address =
    issue.location.address.length > 30
      ? `${issue.location.address.slice(0, 30)}…`
      : issue.location.address;
  // Only show a description line when it actually adds detail beyond the title.
  const hasDescription =
    issue.description.trim().length > 0 &&
    issue.description.trim() !== issue.title.trim();

  // Resolve the current reporter id after mount (cookie/uid aren't available
  // during SSR, and reading them at render would cause a hydration mismatch).
  const [reporterId, setReporterId] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReporterId(getReporterId());
  }, []);

  // Optimistic override: on a tap we immediately swap in a locally-computed copy
  // of the issue, then let the write reconcile. When fresh server state arrives
  // for this card (a new feed snapshot ⇒ new `issue` prop), we drop the override
  // so realtime truth wins; on a failed write we clear it explicitly to roll back.
  const [override, setOverride] = useState<Issue | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverride(null);
  }, [issue]);
  const view = override ?? issue;

  // Active states are derived from the (optimistic or persisted) arrays, so
  // they're correct after a refresh, update live on the realtime feed, and flip
  // instantly on tap. A single `busy` flag guards both mutually-exclusive
  // buttons while a vote write is in flight.
  const upvoteActive = reporterId !== "" && (view.upvotedBy ?? []).includes(reporterId);
  const cantFindActive = reporterId !== "" && (view.cantFindBy ?? []).includes(reporterId);
  const [busy, setBusy] = useState(false);
  const { promptOpen, closePrompt, requireAuth } = useRequireAuth();

  // One handler drives both buttons. `desired` is the state the tapped button
  // wants to move TO; pressing the already-active button clears to null (toggle
  // off), otherwise it activates and — because the write rebuilds membership —
  // deactivates the other side in the same operation. The card is a <Link>, so
  // action clicks must not bubble into navigation. Both are login-gated.
  function castVote(desired: "upvote" | "cant_find", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    requireAuth(async () => {
      if (!reporterId || busy) return;
      const active = desired === "upvote" ? upvoteActive : cantFindActive;
      const next: VoteState = active ? null : desired;
      setBusy(true);
      try {
        // Reuse the feed's location if we have it (no extra prompt); resolve the
        // proximity weight only when casting an upvote (off/cant_find ignore it).
        const weight =
          next === "upvote"
            ? await resolveUpvoteWeight(
                issue.location.lat,
                issue.location.lng,
                userLat,
                userLng,
              )
            : BASELINE_WEIGHT;
        // Optimistic swap, then persist; roll back if the write fails.
        setOverride(applyVoteLocal(view, reporterId, next, weight));
        try {
          await setVote(issue.id, reporterId, next, weight);
          if (next === "upvote") {
            void recomputeUserGamification(reporterId).catch(() => {});
          }
        } catch {
          setOverride(null); // revert to the last server truth
        }
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <>
    <Link
      href={`/issue/${issue.id}`}
      className="group relative block overflow-hidden rounded-2xl bg-surface shadow-card transition active:scale-[0.99]"
    >
      {/* DNA marker */}
      <span className="absolute right-2.5 top-2.5 z-10 flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
        <Dna size={11} strokeWidth={2.4} />
        {issue.dna.length}
      </span>

      <div className="flex gap-3 p-3">
        {/* Thumbnail or category-emoji placeholder */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {photo ? (
            <Image
              src={photo}
              alt={issue.title}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl">
              {CATEGORY_EMOJIS[issue.category]}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* row 1 — category + severity */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[11px] font-semibold text-primary-dark">
              {CATEGORY_LABELS[issue.category]}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize"
              style={{ backgroundColor: `${sevColor}1a`, color: sevColor }}
            >
              {sevLabel}
            </span>
          </div>

          {/* row 2 — title */}
          <h3 className="mt-1 line-clamp-2 font-display text-[15px] font-bold leading-snug text-foreground">
            {issue.title}
          </h3>

          {/* row 3 — description (only when it adds detail) */}
          {hasDescription && (
            <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-muted">
              {issue.description}
            </p>
          )}

          {/* row 4 — location + distance */}
          <p className="mt-0.5 truncate text-xs text-muted">
            📍 {address}
            {distance != null && (
              <span className="text-muted/80"> · {formatDistance(distance)}</span>
            )}
          </p>

          {/* row 5 — aging + status + time */}
          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 font-medium text-muted">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: AGING_COLORS[issue.agingStatus] }}
              />
              {AGING_LABELS[issue.agingStatus]}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 font-semibold"
              style={{
                backgroundColor: `${STATUS_COLORS[issue.status]}1a`,
                color: STATUS_COLORS[issue.status],
              }}
            >
              {STATUS_LABELS[issue.status]}
            </span>
            <span className="ml-auto flex items-center gap-1 font-medium text-muted">
              <Clock size={12} strokeWidth={2.2} />
              {formatDistanceToNowStrict(issue.reportedAt)} ago
            </span>
          </div>

          {/* row 6 — actions (must not bubble to the card link). Removed when
              the card is read-only; the discussion count (read-only signal)
              still shows on its own when there's discussion to surface. */}
          {canAct ? (
            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
              <button
                onClick={(e) => castVote("upvote", e)}
                disabled={busy}
                aria-pressed={upvoteActive}
                aria-label={upvoteActive ? "Remove your upvote" : "Upvote this issue"}
                className={`flex items-center gap-1 rounded-full px-2 py-1 transition active:scale-95 disabled:opacity-60 ${
                  upvoteActive ? "bg-primary/10 text-primary" : "bg-slate-100 text-muted"
                }`}
              >
                <ArrowBigUp
                  size={14}
                  strokeWidth={2.4}
                  fill={upvoteActive ? "currentColor" : "none"}
                />
                {view.upvoteCount}
              </button>

              {issue.discussion.length > 0 && (
                <span className="flex items-center gap-1 text-muted">
                  <MessageSquare size={12} strokeWidth={2.2} />
                  {issue.discussion.length}
                </span>
              )}

              <button
                onClick={(e) => castVote("cant_find", e)}
                disabled={busy}
                aria-pressed={cantFindActive}
                aria-label={
                  cantFindActive
                    ? "Remove your can't-find report"
                    : "Report that you can't find this issue"
                }
                className={`ml-auto flex items-center gap-1 rounded-full px-2 py-1 transition active:scale-95 disabled:opacity-60 ${
                  cantFindActive ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-muted"
                }`}
              >
                <SearchX size={12} strokeWidth={2.2} />
                Can&apos;t find{cantFindActive ? " ✓" : ""}
                {view.cantFindCount > 0 && (
                  <span className="tabular-nums">{view.cantFindCount}</span>
                )}
              </button>
            </div>
          ) : (
            issue.discussion.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
                <span className="flex items-center gap-1 text-muted">
                  <MessageSquare size={12} strokeWidth={2.2} />
                  {issue.discussion.length}
                </span>
              </div>
            )
          )}
        </div>
      </div>

      {/* bottom pressure bar */}
      <div className="h-1 w-full bg-slate-100">
        <div
          className="h-full rounded-r-full transition-[width]"
          style={{
            width: `${issue.pressureScore}%`,
            backgroundColor: getPressureColor(issue.pressureScore),
          }}
        />
      </div>
    </Link>
    <LoginPrompt open={promptOpen} onClose={closePrompt} />
    </>
  );
}
