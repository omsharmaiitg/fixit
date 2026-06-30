"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Shared gate for write actions — reporting, upvoting, and "can't find" all
// require a signed-in account now (anonymous device-id writes are gone).
// `requireAuth(fn)` runs fn when signed in, otherwise opens a blocking prompt
// the caller renders via <LoginPrompt/>. Centralised here so the FAB, the feed
// card, and the detail page share one gate and one wording instead of three.
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);
  function requireAuth(action: () => void) {
    if (loading) return; // auth not resolved yet — ignore the tap, don't false-block
    if (!user) {
      setPromptOpen(true);
      return;
    }
    action();
  }
  return { promptOpen, closePrompt: () => setPromptOpen(false), requireAuth };
}

// Blocking inline prompt (not an auto-redirect): the user stays put until they
// choose to go to /auth. Rendered through a portal so it can sit inside a
// card <Link> without clicks bubbling into navigation.
export function LoginPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  // Portals need document.body, absent during SSR; flip on after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted || !open) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-card"
      >
        <p className="font-display text-base font-bold text-foreground">
          Sign in to continue
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Please log in or register to report or upvote issues.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href="/auth"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            <LogIn size={16} strokeWidth={2.4} /> Login / Register
          </Link>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-muted transition active:scale-95"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
