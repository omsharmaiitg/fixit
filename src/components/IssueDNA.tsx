"use client";

import { useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import type { DNAEntry } from "@/types";

const DAY = 86_400_000;

function dayLabel(ts: Date, reportedAt: Date): string {
  const day = Math.max(0, Math.floor((ts.getTime() - reportedAt.getTime()) / DAY));
  return `Day ${day} · ${format(ts, "HH:mm")}`;
}

function Node({
  entry,
  reportedAt,
  gapDaysBefore,
}: {
  entry: DNAEntry;
  reportedAt: Date;
  gapDaysBefore: number;
}) {
  const stalled = gapDaysBefore >= 7;
  return (
    <li className="relative pl-10">
      {/* connector to previous node */}
      <span
        className={`absolute left-[15px] top-0 h-3 w-px ${
          stalled ? "border-l border-dashed border-red-400 bg-transparent" : "bg-slate-200"
        }`}
      />
      {stalled && (
        <span className="absolute left-7 top-0 text-[10px] font-semibold text-red-500">
          {gapDaysBefore} days of silence
        </span>
      )}
      {/* node */}
      <span className="absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-base shadow-card ring-1 ring-slate-100">
        {entry.emoji}
      </span>

      <div className="pb-5 pt-3">
        <p className="text-sm font-semibold text-foreground">{entry.label}</p>
        <p className="mt-0.5 text-xs text-muted">
          {dayLabel(entry.timestamp, reportedAt)}
          {entry.actor && entry.actor !== "system" && (
            <span className="capitalize"> · {entry.actor}</span>
          )}
        </p>
        {entry.photoUrl && (
          <div className="relative mt-2 h-24 w-32 overflow-hidden rounded-lg bg-slate-100">
            <Image
              src={entry.photoUrl}
              alt={entry.label}
              fill
              sizes="128px"
              className="object-cover"
            />
          </div>
        )}
      </div>
    </li>
  );
}

export function IssueDNA({
  dna,
  reportedAt,
}: {
  dna: DNAEntry[];
  reportedAt: Date;
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = [...dna].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  const gapBefore = (i: number) =>
    i === 0
      ? 0
      : Math.floor(
          (entries[i].timestamp.getTime() - entries[i - 1].timestamp.getTime()) /
            DAY,
        );

  // Collapse the middle when the biography gets long (>6 entries).
  const collapse = entries.length > 6 && !expanded;
  const head = collapse ? entries.slice(0, 2) : entries;
  const tail = collapse ? entries.slice(-2) : [];
  const hiddenCount = entries.length - 4;

  return (
    <ol className="relative">
      {head.map((e, i) => (
        <Node key={e.id} entry={e} reportedAt={reportedAt} gapDaysBefore={gapBefore(i)} />
      ))}

      {collapse && (
        <li className="relative pl-10">
          <span className="absolute left-[15px] top-0 h-full w-px bg-slate-200" />
          <button
            onClick={() => setExpanded(true)}
            className="my-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary shadow-card"
          >
            Show {hiddenCount} more {hiddenCount === 1 ? "entry" : "entries"}
          </button>
        </li>
      )}

      {tail.map((e) => {
        const idx = entries.indexOf(e);
        return (
          <Node
            key={e.id}
            entry={e}
            reportedAt={reportedAt}
            gapDaysBefore={gapBefore(idx)}
          />
        );
      })}
    </ol>
  );
}
