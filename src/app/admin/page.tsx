"use client";

import { useState } from "react";
import { collection, getDocs, writeBatch } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { seedDemoData, seedDemoIntelligence, seedShamliData } from "@/lib/seedData";
import { calculatePressureScore, getAgingStatus } from "@/lib/pressureScore";
import {
  issueFromSnapshot,
  getAllIssues,
  acknowledgeIssue,
  markIssueInProgress,
  submitResolution,
  uploadIssuePhoto,
} from "@/lib/firebaseHelpers";
import { getReporterId } from "@/lib/reporter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationContext } from "@/contexts/LocationContext";
import { STATUS_LABELS, STATUS_COLORS, CATEGORY_EMOJIS } from "@/lib/constants";
import type { Issue } from "@/types";

type State = { running: boolean; message: string };

// Delete every doc in a collection, chunked under Firestore's 500-op batch
// limit. Returns how many were deleted.
async function clearCollection(name: string): Promise<number> {
  const snap = await getDocs(collection(getDb(), name));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(getDb());
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

export default function AdminPage() {
  const { user } = useAuth();
  const { activeCity } = useLocationContext();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<State>({ running: false, message: "" });
  const [seedIntel, setSeedIntel] = useState<State>({ running: false, message: "" });
  const [seedShamli, setSeedShamli] = useState<State>({ running: false, message: "" });
  const [recalc, setRecalc] = useState<State>({ running: false, message: "" });
  const [watchtower, setWatchtower] = useState<State>({ running: false, message: "" });
  const [attach, setAttach] = useState<State>({ running: false, message: "" });
  const [reset, setReset] = useState<State>({ running: false, message: "" });
  // Server-only secret — operator pastes it; never bundled into the client.
  const [secret, setSecret] = useState("");

  // Per-issue lifecycle controls over the top-pressure issues.
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  async function loadIssues() {
    setIssuesError(null);
    try {
      const all = await getAllIssues();
      const ranked = all
        .filter((i) => i.status !== "resolved")
        .sort((a, b) => b.pressureScore - a.pressureScore)
        .slice(0, 8);
      setIssues(ranked);
    } catch (e) {
      setIssuesError((e as Error).message);
    }
  }

  function toggleLifecycle() {
    const next = !lifecycleOpen;
    setLifecycleOpen(next);
    if (next && issues === null) void loadIssues();
  }

  async function handleSeed() {
    setSeed({ running: true, message: "" });
    try {
      const r = await seedDemoData();
      setSeed({
        running: false,
        message: r.seeded
          ? `🌱 Seeded ${r.count} issues, 3 squads, 1 problem zone.`
          : `Skipped — ${r.count} issues already exist.`,
      });
    } catch (e) {
      setSeed({ running: false, message: `Error: ${(e as Error).message}` });
    }
  }

  async function handleSeedIntel() {
    setSeedIntel({ running: true, message: "" });
    try {
      const r = await seedDemoIntelligence();
      setSeedIntel({
        running: false,
        message: `🌱 Seeded ${r.hotspots} hotspots + 1 weekly report. Open the dashboard to see them.`,
      });
    } catch (e) {
      setSeedIntel({ running: false, message: `Error: ${(e as Error).message}` });
    }
  }

  async function handleSeedShamli() {
    setSeedShamli({ running: true, message: "" });
    try {
      const r = await seedShamliData();
      setSeedShamli({
        running: false,
        message: r.seeded
          ? `🌱 Seeded ${r.count} Shamli mock issues. Open the feed for a Shamli account.`
          : `Skipped — shamli-demo-v1 batch already seeded (${r.count} issues).`,
      });
    } catch (e) {
      setSeedShamli({ running: false, message: `Error: ${(e as Error).message}` });
    }
  }

  async function handleRecalc() {
    setRecalc({ running: true, message: "" });
    try {
      const snap = await getDocs(collection(getDb(), "issues"));
      const batch = writeBatch(getDb());
      snap.forEach((d) => {
        const issue = issueFromSnapshot(d.id, d.data());
        const { score, breakdown } = calculatePressureScore(issue);
        batch.update(d.ref, {
          pressureScore: score,
          pressureBreakdown: breakdown,
          agingStatus: getAgingStatus(issue.reportedAt),
        });
      });
      await batch.commit();
      setRecalc({ running: false, message: `🔄 Recalculated ${snap.size} issues.` });
    } catch (e) {
      setRecalc({ running: false, message: `Error: ${(e as Error).message}` });
    }
  }

  async function handleAttach() {
    setAttach({ running: true, message: "" });
    try {
      const id = getReporterId();
      const snap = await getDocs(collection(getDb(), "issues"));
      const targets = snap.docs.slice(0, 3);
      if (targets.length === 0) {
        setAttach({
          running: false,
          message: "No issues found — seed demo data first.",
        });
        return;
      }
      const batch = writeBatch(getDb());
      targets.forEach((d) => batch.update(d.ref, { reporterId: id }));
      await batch.commit();
      setAttach({
        running: false,
        message: `📌 Attached ${targets.length} reports to this device. Open My Reports to see them.`,
      });
    } catch (e) {
      setAttach({ running: false, message: `Error: ${(e as Error).message}` });
    }
  }

  // Wipe every Firestore collection for a clean slate before reseeding mock
  // data. NOTE: this clears FIRESTORE ONLY — Firebase Auth accounts are stored
  // separately and must be deleted from the Firebase Console if needed.
  async function handleReset() {
    if (
      !window.confirm(
        "Delete ALL Firestore data (issues, problem zones, hotspots, reports, squads, users)? This cannot be undone.",
      )
    ) {
      return;
    }
    setReset({ running: true, message: "" });
    try {
      const collections = [
        "issues",
        "problemZones",
        "hotspots",
        "reports",
        "squads",
        "users",
      ];
      let total = 0;
      for (const name of collections) total += await clearCollection(name);
      setReset({
        running: false,
        message: `🗑️ Cleared ${total} documents. Auth accounts are separate — clear them in the Firebase Console if needed.`,
      });
    } catch (e) {
      setReset({ running: false, message: `Error: ${(e as Error).message}` });
    }
  }

  async function handleWatchtower() {
    setWatchtower({ running: true, message: "" });
    try {
      // Scope the run to the city currently being viewed (Phase 1 model), so
      // the report + forecasts reflect that city only.
      const res = await fetch("/api/watchtower", {
        method: "POST",
        headers: {
          "x-watchtower-secret": secret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          activeCity
            ? {
                cityName: activeCity.cityName,
                cityLat: activeCity.cityLat,
                cityLng: activeCity.cityLng,
              }
            : {},
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Watchtower failed");
      const parts = [
        `scored ${data.issuesScored}`,
        `${data.zonesDetected} zones`,
        `${data.hotspotsPredicted} hotspots`,
        `report ${data.reportGenerated ? "✓" : "✗"}`,
        `${data.escalationsDrafted} escalations`,
      ];
      let message = `🛰️ ${parts.join(" · ")}`;
      if (Array.isArray(data.errors) && data.errors.length) {
        message += ` — errors: ${data.errors.join("; ")}`;
      }
      setWatchtower({ running: false, message });
    } catch (e) {
      setWatchtower({ running: false, message: `Error: ${(e as Error).message}` });
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-bold text-[#1e3a8a]">Admin</h1>
      <p className="mt-1 text-sm text-gray-500">
        Simulated authority layer. In production this requires verified
        municipal credentials.
      </p>

      <section className="mt-6 rounded-xl border border-gray-100 bg-white shadow-sm">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-gray-800"
        >
          <span>🛠️ Developer Tools</span>
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="space-y-3 border-t border-gray-100 p-4">
            <ToolButton
              label="🌱 Seed Demo Data"
              state={seed}
              onClick={handleSeed}
            />
            <ToolButton
              label="🌱 Seed demo intelligence"
              state={seedIntel}
              onClick={handleSeedIntel}
            />
            <ToolButton
              label="🌱 Seed Shamli demo data"
              state={seedShamli}
              onClick={handleSeedShamli}
            />
            <ToolButton
              label="🔄 Recalculate All Pressure Scores"
              state={recalc}
              onClick={handleRecalc}
            />
            <ToolButton
              label="📌 Attach sample reports to this device"
              state={attach}
              onClick={handleAttach}
            />
            <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Watchtower secret"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1d4ed8]"
              />
              <ToolButton
                label="🛰️ Run Watchtower Now"
                state={watchtower}
                onClick={handleWatchtower}
              />
            </div>

            <div className="border-t border-gray-100 pt-3">
              <ToolButton
                label="🗑️ Reset all data"
                state={reset}
                onClick={handleReset}
                danger
              />
            </div>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-gray-100 bg-white shadow-sm">
        <button
          onClick={toggleLifecycle}
          className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-gray-800"
        >
          <span>🚦 Issue Lifecycle</span>
          <span className="text-gray-400">{lifecycleOpen ? "▲" : "▼"}</span>
        </button>

        {lifecycleOpen && (
          <div className="space-y-3 border-t border-gray-100 p-4">
            <p className="text-xs text-gray-500">
              Authority actions on the highest-pressure open issues. Each appends
              an immutable DNA entry.
            </p>
            {!user && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Sign in to perform authority actions — these writes require
                authentication.
              </p>
            )}
            {issuesError && (
              <p className="text-xs text-red-600">Error: {issuesError}</p>
            )}
            {issues === null && !issuesError && (
              <p className="text-xs text-gray-500">Loading issues…</p>
            )}
            {issues && issues.length === 0 && (
              <p className="text-xs text-gray-500">
                No open issues. Seed demo data first.
              </p>
            )}
            {issues?.map((i) => (
              <IssueLifecycleRow
                key={i.id}
                issue={i}
                disabled={!user}
                onChanged={loadIssues}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function IssueLifecycleRow({
  issue,
  disabled,
  onChanged,
}: {
  issue: Issue;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canAcknowledge =
    issue.status === "reported" ||
    issue.status === "verified" ||
    issue.status === "reopened";

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">
          <span className="mr-1">{CATEGORY_EMOJIS[issue.category]}</span>
          {issue.title}
        </p>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: `${STATUS_COLORS[issue.status]}1a`,
            color: STATUS_COLORS[issue.status],
          }}
        >
          {STATUS_LABELS[issue.status]}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-gray-500">
        Pressure {issue.pressureScore}
      </p>

      <div className="mt-2.5 space-y-2">
        {canAcknowledge && (
          <ActionButton
            label="🏛️ Acknowledge"
            disabled={disabled || busy}
            onClick={() => run(() => acknowledgeIssue(issue.id))}
          />
        )}

        {issue.status === "acknowledged" && (
          <>
            <PhotoField
              label="Progress photo (optional)"
              file={file}
              onPick={setFile}
            />
            <ActionButton
              label="🔧 Mark In Progress"
              disabled={disabled || busy}
              onClick={() =>
                run(async () => {
                  const url = file
                    ? await uploadIssuePhoto(file, issue.id)
                    : undefined;
                  await markIssueInProgress(issue.id, url);
                })
              }
            />
          </>
        )}

        {issue.status === "in_progress" && (
          <>
            <PhotoField
              label="After-photo (required)"
              file={file}
              onPick={setFile}
            />
            <ActionButton
              label="✅ Mark Resolved"
              disabled={disabled || busy || !file}
              onClick={() =>
                run(async () => {
                  if (!file) throw new Error("An after-photo is required.");
                  const url = await uploadIssuePhoto(file, issue.id);
                  await submitResolution(issue.id, url);
                })
              }
            />
          </>
        )}

        {issue.status === "pending_confirmation" && (
          <p className="text-xs text-gray-500">
            Awaiting community confirmation on the issue page.
          </p>
        )}
      </div>

      {err && <p className="mt-1.5 text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

function PhotoField({
  label,
  file,
  onPick,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  return (
    <label className="block text-[11px] font-medium text-gray-600">
      {label}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full text-[11px] text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-gray-200 file:px-2 file:py-1 file:text-[11px] file:font-medium"
      />
      {file && <span className="text-[10px] text-gray-400">{file.name}</span>}
    </label>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg bg-[#1d4ed8] px-3 py-2 text-xs font-medium text-white transition active:scale-95 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function ToolButton({
  label,
  state,
  onClick,
  danger = false,
}: {
  label: string;
  state: State;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div>
      <button
        onClick={onClick}
        disabled={state.running}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-60 ${
          danger ? "bg-[#dc2626]" : "bg-[#1d4ed8]"
        }`}
      >
        {state.running ? "Working…" : label}
      </button>
      {state.message && (
        <p className="mt-1.5 text-xs text-gray-600">{state.message}</p>
      )}
    </div>
  );
}
