"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Camera,
  Mic,
  Send,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { fileToCapturedImage, base64ToBlob, type CapturedImage } from "@/lib/imageUtils";
import {
  getIssueById,
  uploadIssuePhoto,
  addIssuePhoto,
  appendDNAEntry,
  upvoteIssue,
} from "@/lib/firebaseHelpers";
import { CATEGORY_EMOJIS } from "@/lib/constants";
import { getReporterId } from "@/lib/reporter";
import type { Issue } from "@/types";
import type { ReportDraft } from "./reportTypes";
import { ToolStatusLine } from "./ToolStatusLine";

const TOOL_LABELS: Record<string, { emoji: string; label: string }> = {
  geocode_location: { emoji: "📍", label: "Pinpointing the location…" },
  find_nearby_issues: { emoji: "🔎", label: "Checking for nearby reports…" },
  get_weather_context: { emoji: "🌧️", label: "Checking recent weather…" },
  get_category_severity_weight: { emoji: "⚖️", label: "Assessing severity…" },
  finalize_report: { emoji: "✅", label: "Putting your report together…" },
  flag_possible_duplicate: { emoji: "🔁", label: "Matching an existing report…" },
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  imagePreview?: string;
  tools?: { name: string; args: Record<string, unknown> }[];
}

// Minimal typing for the (unprefixed/webkit) Web Speech API.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

const uid = () => crypto.randomUUID();

export function TriageChat({
  onFinalized,
}: {
  onFinalized: (draft: ReportDraft, photo: CapturedImage | null) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      text: "Hi! I'm here to help you report a local issue. Tell me what you spotted and roughly where — type it, speak it, or snap a photo.",
    },
  ]);
  const [history, setHistory] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<CapturedImage | null>(null);
  const [reportPhoto, setReportPhoto] = useState<CapturedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [duplicate, setDuplicate] = useState<{ issue: Issue; reason: string } | null>(null);
  const [dupBusy, setDupBusy] = useState(false);

  // voice
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("hi-IN");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, duplicate]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPendingImage(await fileToCapturedImage(file));
    } catch {
      /* ignore unreadable file */
    }
    e.target.value = "";
  }

  function toggleMic() {
    const ctor: SpeechCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;

    if (!ctor) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "error", text: "Voice input isn't supported on this browser." },
      ]);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new ctor();
    rec.lang = speechLang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function send() {
    const text = input.trim();
    const img = pendingImage;
    if (!text && !img) return;

    const photoForReport = img ?? reportPhoto;
    setMessages((m) => [
      ...m,
      { id: uid(), role: "user", text, imagePreview: img?.preview },
    ]);
    if (img) setReportPhoto(img);
    setInput("");
    setPendingImage(null);
    setLoading(true);

    const reqHistory = history;
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: reqHistory,
          message: text,
          imageBase64: img?.base64,
          mimeType: img?.mimeType,
        }),
      });
      const data = await res.json();
      console.log("[triage response]", data);
      setLoading(false);
      if (!res.ok) throw new Error(data.error || "Triage failed");

      const toolCalls: ChatMessage["tools"] = data.toolCalls ?? [];
      setHistory((h) => [
        ...h,
        { role: "user", text },
        { role: "model", text: data.text || "" },
      ]);
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", text: data.text || "", tools: toolCalls },
      ]);

      const fa = data.finalAction as { name: string; args: Record<string, unknown> } | null;
      if (fa) {
        // Let the visible reasoning play out before acting.
        const delayMs = (toolCalls?.length ?? 0) * 600 + 1100;
        if (fa.name === "finalize_report") {
          setAdvancing(true);
          window.setTimeout(() => onFinalized(fa.args as unknown as ReportDraft, photoForReport), delayMs);
        } else if (fa.name === "flag_possible_duplicate") {
          const issue = await getIssueById(String(fa.args.issueId));
          if (issue) {
            window.setTimeout(
              () => setDuplicate({ issue, reason: String(fa.args.reason ?? "") }),
              delayMs,
            );
          }
        }
      }
    } catch (e) {
      setLoading(false);
      setMessages((m) => [
        ...m,
        { id: uid(), role: "error", text: (e as Error).message },
      ]);
    }
  }

  // Duplicate path: merge is Phase 7. For now we add the user's photo as
  // evidence to the existing issue and bump it, then open it.
  // ponytail: light evidence-add; full co-reporter merge lands in Phase 7.
  async function addPhotoAsEvidence() {
    if (!duplicate) return;
    setDupBusy(true);
    try {
      let photoUrl: string | undefined;
      if (reportPhoto) {
        const blob = base64ToBlob(reportPhoto.base64, reportPhoto.mimeType);
        photoUrl = await uploadIssuePhoto(blob, duplicate.issue.id);
        await addIssuePhoto(duplicate.issue.id, photoUrl);
      }
      await appendDNAEntry(duplicate.issue.id, {
        id: uid(),
        type: "merged",
        emoji: "🔗",
        label: "Additional evidence added by a nearby reporter",
        timestamp: new Date(),
        actor: "You",
        ...(photoUrl ? { photoUrl } : {}),
      });
      await upvoteIssue(duplicate.issue.id, getReporterId());
      router.push(`/issue/${duplicate.issue.id}`);
    } catch {
      setDupBusy(false);
      setMessages((m) => [
        ...m,
        { id: uid(), role: "error", text: "Couldn't add evidence. Try opening the report instead." },
      ]);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* thread */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={15} className="animate-spin text-primary" />
            Thinking…
          </div>
        )}

        {duplicate && (
          <DuplicateCard
            issue={duplicate.issue}
            reason={duplicate.reason}
            busy={dupBusy}
            hasPhoto={!!reportPhoto}
            onAddEvidence={addPhotoAsEvidence}
            onView={() => router.push(`/issue/${duplicate.issue.id}`)}
          />
        )}

        {advancing && (
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ArrowRight size={15} /> Taking you to confirm the location…
          </div>
        )}
      </div>

      {/* compose bar */}
      {!duplicate && !advancing && (
        <div className="border-t border-slate-100 bg-surface px-3 pb-4 pt-2">
          {pendingImage && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative h-14 w-14 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingImage.preview} alt="attached" className="h-full w-full object-cover" />
              </div>
              <button
                onClick={() => setPendingImage(null)}
                className="text-xs font-medium text-muted underline"
              >
                Remove photo
              </button>
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPickPhoto}
              className="hidden"
            />
            <IconButton label="Add photo" onClick={() => fileInputRef.current?.click()}>
              <Camera size={20} />
            </IconButton>

            <div className="flex flex-col items-center">
              <IconButton
                label="Voice input"
                onClick={toggleMic}
                active={listening}
              >
                <Mic size={20} />
              </IconButton>
              <div className="mt-0.5 flex gap-0.5">
                {(["hi-IN", "en-IN"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setSpeechLang(l)}
                    className={`rounded px-1 text-[9px] font-bold ${
                      speechLang === l ? "text-primary" : "text-muted"
                    }`}
                  >
                    {l === "hi-IN" ? "हिं" : "EN"}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={listening ? "Listening…" : "Describe the issue…"}
              className="max-h-28 flex-1 resize-none rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:bg-slate-50"
            />

            <button
              onClick={send}
              disabled={loading || (!input.trim() && !pendingImage)}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95 disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
        active ? "bg-red-500 text-white" : "bg-slate-100 text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "error") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertTriangle size={15} className="shrink-0" />
        {message.text}
      </div>
    );
  }

  const isUser = message.role === "user";
  const tools = message.tools ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? "rounded-br-md bg-primary text-white"
            : "rounded-bl-md bg-surface text-foreground shadow-card"
        }`}
      >
        {message.imagePreview && (
          <div className="mb-2 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={message.imagePreview} alt="report photo" className="max-h-48 w-full object-cover" />
          </div>
        )}

        {/* visible reasoning */}
        {tools.length > 0 && (
          <div className="mb-2 space-y-1.5 border-l-2 border-primary/20 pl-2.5">
            {tools.map((t, i) => {
              const meta = TOOL_LABELS[t.name] ?? { emoji: "⚙️", label: "Working…" };
              return (
                <ToolStatusLine key={i} emoji={meta.emoji} label={meta.label} index={i} />
              );
            })}
          </div>
        )}

        {message.text && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: tools.length * 0.6 + 0.2, duration: 0.3 }}
            className="whitespace-pre-wrap leading-relaxed"
          >
            {message.text}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

function DuplicateCard({
  issue,
  reason,
  busy,
  hasPhoto,
  onAddEvidence,
  onView,
}: {
  issue: Issue;
  reason: string;
  busy: boolean;
  hasPhoto: boolean;
  onAddEvidence: () => void;
  onView: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
    >
      <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
        🔁 This looks already reported
      </p>
      {reason && <p className="mt-1 text-xs text-amber-700">{reason}</p>}

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface p-3 shadow-card">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-2xl">
          {CATEGORY_EMOJIS[issue.category]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{issue.title}</p>
          <p className="truncate text-xs text-muted">{issue.location.address}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onAddEvidence}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {hasPhoto ? "Add my photo as evidence" : "Strengthen this report"}
        </button>
        <button
          onClick={onView}
          className="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-primary shadow-card active:scale-[0.98]"
        >
          View
        </button>
      </div>
    </motion.div>
  );
}
