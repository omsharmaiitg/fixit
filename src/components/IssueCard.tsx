"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowBigUp, Dna, MessageSquare, Clock, SearchX } from "lucide-react";
import type { Issue } from "@/types";
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
  upvoteIssue,
  cantFindIssue,
} from "@/lib/firebaseHelpers";
import { getPressureColor, BASELINE_WEIGHT } from "@/lib/pressureScore";
import { resolveUpvoteWeight } from "@/lib/upvoteLocation";
import { getReporterId } from "@/lib/reporter";
import { useRequireAuth, LoginPrompt } from "@/components/LoginPrompt";

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function IssueCard({
  issue,
  userLat,
  userLng,
}: {
  issue: Issue;
  userLat?: number | null;
  userLng?: number | null;
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

  // Active states are derived from the persisted arrays, so they're correct
  // after a refresh and update live on the realtime feed. `busy` just guards
  // against double-firing while the toggle write is in flight.
  const upvoteActive = reporterId !== "" && (issue.upvotedBy ?? []).includes(reporterId);
  const cantFindActive = reporterId !== "" && (issue.cantFindBy ?? []).includes(reporterId);
  const [upBusy, setUpBusy] = useState(false);
  const [cfBusy, setCfBusy] = useState(false);
  const { promptOpen, closePrompt, requireAuth } = useRequireAuth();

  // The card is a <Link>; action buttons must not bubble into navigation.
  // Both upvote and "can't find" are community signals that now require login
  // (can't-find gated too, for consistency — it nudges status just like upvote).
  function handleUpvote(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    requireAuth(async () => {
      if (!reporterId || upBusy) return;
      setUpBusy(true);
      try {
        // Reuse the feed's location if we have it (no extra prompt); resolve the
        // proximity weight only when casting (un-upvote ignores it).
        const weight = upvoteActive
          ? BASELINE_WEIGHT
          : await resolveUpvoteWeight(
              issue.location.lat,
              issue.location.lng,
              userLat,
              userLng,
            );
        await upvoteIssue(issue.id, reporterId, weight);
      } finally {
        setUpBusy(false);
      }
    });
  }

  function handleCantFind(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    requireAuth(async () => {
      if (!reporterId || cfBusy) return;
      setCfBusy(true);
      try {
        await cantFindIssue(issue.id, reporterId);
      } finally {
        setCfBusy(false);
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

          {/* row 6 — actions (must not bubble to the card link) */}
          <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
            <button
              onClick={handleUpvote}
              disabled={upBusy}
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
              {issue.upvoteCount}
            </button>

            {issue.discussion.length > 0 && (
              <span className="flex items-center gap-1 text-muted">
                <MessageSquare size={12} strokeWidth={2.2} />
                {issue.discussion.length}
              </span>
            )}

            <button
              onClick={handleCantFind}
              disabled={cfBusy}
              aria-pressed={cantFindActive}
              aria-label="Report that you can't find this issue"
              className={`ml-auto flex items-center gap-1 rounded-full px-2 py-1 transition active:scale-95 disabled:opacity-60 ${
                cantFindActive ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-muted"
              }`}
            >
              <SearchX size={12} strokeWidth={2.2} />
              {cantFindActive ? "Can't find ✓" : "Can't find"}
            </button>
          </div>
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
