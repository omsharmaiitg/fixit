"use client";

import { useState } from "react";
import { collection, getDocs, writeBatch } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { seedDemoData } from "@/lib/seedData";
import { calculatePressureScore, getAgingStatus } from "@/lib/pressureScore";
import { issueFromSnapshot } from "@/lib/firebaseHelpers";

type State = { running: boolean; message: string };

export default function AdminPage() {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<State>({ running: false, message: "" });
  const [recalc, setRecalc] = useState<State>({ running: false, message: "" });
  const [watchtower, setWatchtower] = useState<State>({ running: false, message: "" });
  // Server-only secret — operator pastes it; never bundled into the client.
  const [secret, setSecret] = useState("");

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

  async function handleWatchtower() {
    setWatchtower({ running: true, message: "" });
    try {
      const res = await fetch("/api/watchtower", {
        method: "POST",
        headers: { "x-watchtower-secret": secret },
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
              label="🔄 Recalculate All Pressure Scores"
              state={recalc}
              onClick={handleRecalc}
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
          </div>
        )}
      </section>
    </main>
  );
}

function ToolButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: State;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        onClick={onClick}
        disabled={state.running}
        className="w-full rounded-lg bg-[#1d4ed8] px-4 py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-60"
      >
        {state.running ? "Working…" : label}
      </button>
      {state.message && (
        <p className="mt-1.5 text-xs text-gray-600">{state.message}</p>
      )}
    </div>
  );
}
