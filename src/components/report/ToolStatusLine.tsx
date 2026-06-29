"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Check } from "lucide-react";

// One line of the agent's visible reasoning. Slides in on a stagger, runs a
// spinner, then resolves to a green check — so the tool loop reads as live work
// happening (this is the Agentic Depth money-shot).
export function ToolStatusLine({
  emoji,
  label,
  index,
}: {
  emoji: string;
  label: string;
  index: number;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Resolve shortly after this line has slid in. setTimeout callback is async,
    // so this is not a synchronous-setState-in-effect.
    const t = setTimeout(() => setDone(true), index * 600 + 560);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.6, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2 text-sm"
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className={done ? "text-muted" : "font-medium text-foreground"}>
        {label}
      </span>
      <span className="ml-auto">
        {done ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 18 }}
          >
            <Check size={15} className="text-green-600" strokeWidth={3} />
          </motion.span>
        ) : (
          <Loader2 size={15} className="animate-spin text-primary" />
        )}
      </span>
    </motion.div>
  );
}
