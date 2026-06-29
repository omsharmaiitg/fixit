"use client";

import { MapPin, Globe } from "lucide-react";

type Option = { label: string; value: number | null; icon: "pin" | "globe" };

const OPTIONS: Option[] = [
  { label: "Under 1 km", value: 1000, icon: "pin" },
  { label: "Under 2 km", value: 2000, icon: "pin" },
  { label: "Under 5 km", value: 5000, icon: "pin" },
  { label: "All", value: null, icon: "globe" },
];

export function FilterBar({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="sticky top-[57px] z-30 -mx-4 bg-background/85 px-4 py-2.5 backdrop-blur-md">
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {OPTIONS.map((opt) => {
          const active = opt.value === value;
          const Icon = opt.icon === "pin" ? MapPin : Globe;
          return (
            <button
              key={opt.label}
              onClick={() => onChange(opt.value)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition active:scale-95 ${
                active
                  ? "bg-primary text-white shadow-card"
                  : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              <Icon size={15} strokeWidth={2.2} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
