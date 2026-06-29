"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

// The single most dominant element on the home screen (§7). Thumb-reachable,
// bottom-right, with a calm attention pulse.
export function FABButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push("/report")}
      aria-label="Report an issue"
      className="fab-pulse fixed bottom-6 right-5 z-50 flex h-14 items-center gap-2 rounded-full bg-primary pl-4 pr-5 font-display font-bold text-white transition active:scale-95"
    >
      <Plus size={22} strokeWidth={2.6} />
      Report Issue
    </button>
  );
}
