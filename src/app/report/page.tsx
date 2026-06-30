"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  MapPin,
  Pencil,
  Sparkles,
  Loader2,
} from "lucide-react";
import { TriageChat } from "@/components/report/TriageChat";
import { LocationPicker } from "@/components/LocationPicker";
import {
  createIssue,
  uploadIssuePhoto,
  uploadIssueVideo,
  getSeverityLabel,
} from "@/lib/firebaseHelpers";
import {
  calculatePressureScore,
  VERIFICATION_THRESHOLD_NAMED,
  VERIFICATION_THRESHOLD_ANONYMOUS,
} from "@/lib/pressureScore";
import { base64ToBlob } from "@/lib/imageUtils";
import { getReporterId } from "@/lib/reporter";
import { recomputeUserGamification } from "@/lib/gamification";
import { useAuth } from "@/contexts/AuthContext";
import {
  CATEGORY_LABELS,
  CATEGORY_EMOJIS,
  CATEGORY_BASE_WEIGHT,
  SEVERITY_COLORS,
} from "@/lib/constants";
import type { Issue, IssueCategory, TimeOfDay } from "@/types";
import type {
  CapturedMedia,
  ConfirmedLocation,
  ReportDraft,
} from "@/components/report/reportTypes";

type Stage = "chat" | "location" | "review";
const STAGES: { id: Stage; label: string }[] = [
  { id: "chat", label: "Describe" },
  { id: "location", label: "Location" },
  { id: "review", label: "Review" },
];

// ─── agent-string → our unions ───────────────────────────────────────────────
const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as IssueCategory[];
const CATEGORY_ALIASES: Record<string, IssueCategory> = {
  waste_management: "waste_garbage",
  garbage: "waste_garbage",
  waste: "waste_garbage",
  flooding: "drainage_flooding",
  drainage: "drainage_flooding",
  water: "water_supply",
  lighting: "street_lighting",
  streetlight: "street_lighting",
  streetlights: "street_lighting",
  pothole: "road_damage",
  road: "road_damage",
};
function normalizeCategory(raw: string): IssueCategory {
  const key = raw.trim().toLowerCase();
  if ((VALID_CATEGORIES as string[]).includes(key)) return key as IssueCategory;
  return CATEGORY_ALIASES[key] ?? "other";
}

function timeOfDayNow(): TimeOfDay {
  const h = new Date().getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

export default function ReportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("chat");
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [media, setMedia] = useState<CapturedMedia | null>(null);
  const [location, setLocation] = useState<ConfirmedLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleBack() {
    if (stage === "chat") router.push("/");
    else if (stage === "location") setStage("chat");
    else setStage("location");
  }

  function handleFinalized(d: ReportDraft, m: CapturedMedia | null) {
    setDraft(d);
    setMedia(m);
    setLocation({ lat: d.lat, lng: d.lng, address: d.address ?? "" });
    setStage("location");
  }

  function handleLocationConfirmed(lat: number, lng: number, address: string) {
    setLocation({ lat, lng, address });
    setStage("review");
  }

  async function handleSubmit(title: string, isAnonymous: boolean) {
    if (!draft || !location) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      let photoUrls: string[] = [];
      let videoUrl: string | undefined;
      if (media?.kind === "image" && media.base64) {
        const blob = base64ToBlob(media.base64, media.mimeType);
        photoUrls = [await uploadIssuePhoto(blob, id)];
      } else if (media?.kind === "video" && media.file) {
        // Stored & displayed, never sent to Gemini.
        videoUrl = await uploadIssueVideo(media.file, id);
      }

      // Derive the issue's city from the confirmed (possibly pin-adjusted)
      // location — more reliable than what the agent saw at geocode time.
      let cityName: string | undefined;
      try {
        const r = await fetch(`/api/geocode?lat=${location.lat}&lng=${location.lng}`);
        cityName = (await r.json()).city ?? undefined;
      } catch {
        /* non-fatal — issue just won't carry a city name */
      }

      const reportedAt = new Date();
      const category = normalizeCategory(draft.category);
      const severity = Math.max(1, Math.min(10, Math.round(draft.severity)));

      // Reporting requires login (FAB gate), so a user exists here. Stamp the
      // REAL identity even when anonymous — anonymity only hides the name at
      // render time (see issue detail page), it never blanks what's stored.
      const reporterId = user?.uid ?? getReporterId();
      const reporterName = user?.displayName?.trim() || user?.email || "You";

      const issue: Issue = {
        id,
        title: title.trim() || draft.title,
        description: draft.description ?? draft.title,
        category,
        severity,
        status: "reported",
        agingStatus: "fresh",
        location: { lat: location.lat, lng: location.lng, address: location.address },
        ...(cityName ? { cityName } : {}),
        photoUrls,
        ...(videoUrl ? { videoUrl } : {}),
        reporterId,
        reporterName,
        coReporters: [],
        isAnonymous,
        requiredUpvotesForVerification: isAnonymous
          ? VERIFICATION_THRESHOLD_ANONYMOUS
          : VERIFICATION_THRESHOLD_NAMED,
        reportedAt,
        updatedAt: reportedAt,
        upvoteCount: 0,
        upvotedBy: [],
        upvoteWeights: {},
        cantFindCount: 0,
        cantFindBy: [],
        pressureScore: 0,
        pressureBreakdown: { verification: 0, age: 0, severity: 0, weather: 0 },
        dna: [
          {
            id: crypto.randomUUID(),
            type: "reported",
            emoji: "📝",
            label: "Issue reported",
            timestamp: reportedAt,
            actor: reporterName,
            ...(photoUrls[0] ? { photoUrl: photoUrls[0] } : {}),
          },
        ],
        discussion: [],
        adoptedBy: [],
        timeOfDayAtReport: timeOfDayNow(),
        language: "en", // English-only for now
        isOfflineQueued: typeof navigator !== "undefined" ? !navigator.onLine : false,
      };

      const { score, breakdown } = calculatePressureScore(issue);
      issue.pressureScore = score;
      issue.pressureBreakdown = breakdown;

      await createIssue(issue);
      // Award points / badges for the new report (best-effort, non-blocking).
      void recomputeUserGamification(reporterId).catch(() => {});
      router.push(`/issue/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background">
      {/* top bar + step indicator */}
      <header className="flex items-center gap-3 border-b border-slate-100 bg-surface px-4 py-3">
        <button
          onClick={handleBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-foreground transition active:scale-95"
        >
          <ArrowLeft size={18} />
        </button>
        <StepIndicator stage={stage} />
      </header>

      {stage === "chat" && <TriageChat onFinalized={handleFinalized} />}

      {stage === "location" && draft && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <DraftSummary draft={draft} onEdit={() => setStage("chat")} />
          <p className="mb-2 mt-4 font-display text-sm font-bold text-foreground">
            Confirm where this is
          </p>
          <LocationPicker
            initialLat={draft.lat}
            initialLng={draft.lng}
            initialAddress={draft.address}
            onConfirm={handleLocationConfirmed}
          />
        </div>
      )}

      {stage === "review" && draft && location && (
        <ReviewStage
          draft={draft}
          media={media}
          location={location}
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function StepIndicator({ stage }: { stage: Stage }) {
  const activeIdx = STAGES.findIndex((s) => s.id === stage);
  return (
    <div className="flex flex-1 items-center gap-1.5">
      {STAGES.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.id} className="flex flex-1 items-center gap-1.5">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                active
                  ? "bg-primary text-white"
                  : done
                    ? "bg-green-600 text-white"
                    : "bg-slate-100 text-muted"
              }`}
            >
              {done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </div>
            <span
              className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted"}`}
            >
              {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <div className={`h-px flex-1 ${done ? "bg-green-600" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DraftSummary({ draft, onEdit }: { draft: ReportDraft; onEdit: () => void }) {
  const category = normalizeCategory(draft.category);
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface p-3 shadow-card">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-2xl">
        {CATEGORY_EMOJIS[category]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          {CATEGORY_LABELS[category]}
        </p>
        <p className="font-display text-sm font-bold leading-tight text-foreground">
          {draft.title}
        </p>
      </div>
      <button
        onClick={onEdit}
        aria-label="Edit in chat"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-muted active:scale-95"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

function ReviewStage({
  draft,
  media,
  location,
  submitting,
  error,
  onSubmit,
}: {
  draft: ReportDraft;
  media: CapturedMedia | null;
  location: ConfirmedLocation;
  submitting: boolean;
  error: string | null;
  onSubmit: (title: string, isAnonymous: boolean) => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const category = normalizeCategory(draft.category);
  const severity = Math.max(1, Math.min(10, Math.round(draft.severity)));
  const sevLabel = getSeverityLabel(severity);
  const sevColor = SEVERITY_COLORS[sevLabel];
  const categoryWeight = CATEGORY_BASE_WEIGHT[category];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
      <div className="flex-1 space-y-4">
        {/* media */}
        {media?.kind === "video" ? (
          <div className="space-y-1.5">
            <div className="overflow-hidden rounded-2xl">
              <video src={media.preview} controls className="max-h-60 w-full object-cover" />
            </div>
            <p className="text-xs text-muted">🎥 Video attached — AI analysis coming soon.</p>
          </div>
        ) : media ? (
          <div className="overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.preview} alt="report" className="max-h-60 w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 text-5xl">
            {CATEGORY_EMOJIS[category]}
          </div>
        )}

        {/* category */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Category
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 font-display text-base font-bold text-foreground">
            {CATEGORY_EMOJIS[category]} {CATEGORY_LABELS[category]}
          </p>
        </div>

        {/* editable title */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 font-display text-sm font-bold text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* severity */}
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Severity
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Sparkles size={11} /> AI assessed
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="rounded-lg px-2 py-1 text-sm font-bold capitalize"
              style={{ backgroundColor: `${sevColor}1a`, color: sevColor }}
            >
              {sevLabel} · {severity}/10
            </span>
          </div>

          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            How this was assessed
            <ChevronDown
              size={14}
              className={`transition ${showBreakdown ? "rotate-180" : ""}`}
            />
          </button>
          {showBreakdown && (
            <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs text-muted">
              <p className="font-semibold text-foreground">
                FixIt weighs three signals to rate urgency:
              </p>
              <p>
                <span className="font-semibold text-foreground">Visual</span> — read
                from your photo and description.
              </p>
              <p>
                <span className="font-semibold text-foreground">Category</span> —{" "}
                {CATEGORY_LABELS[category]} carries a base risk weight of{" "}
                <span className="font-semibold text-foreground">{categoryWeight}/10</span>.
              </p>
              <p>
                <span className="font-semibold text-foreground">Community</span> —
                starts low for a new report; rises as people verify it.
              </p>
            </div>
          )}
        </div>

        {/* location */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Location
          </p>
          <div className="mt-1 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-foreground">{location.address}</p>
              <p className="mt-0.5 font-mono text-xs text-muted">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
            </div>
          </div>
        </div>

        {/* anonymity toggle — display-only; the real reporter is still stored */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="text-sm">
            <span className="font-semibold text-foreground">Report anonymously</span>
            <span className="mt-0.5 block text-xs text-muted">
              Your name won&apos;t be shown publicly on this report.
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>

      {/* submit */}
      <button
        onClick={() => onSubmit(title, isAnonymous)}
        disabled={submitting}
        className="sticky bottom-4 mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-display font-bold text-white shadow-card-lg transition active:scale-[0.98] disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Submitting…
          </>
        ) : (
          <>
            <Check size={18} strokeWidth={2.5} /> Submit report
          </>
        )}
      </button>
    </div>
  );
}
