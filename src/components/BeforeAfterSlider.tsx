"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronsLeftRight } from "lucide-react";

// Drag (or keyboard-arrow) the divider to wipe between the original report photo
// and the resolution photo. A native range input drives it, so it's accessible
// and keyboard-operable; clip-path does the reveal without distorting either image.
export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string;
  afterUrl: string;
}) {
  const [pos, setPos] = useState(50);

  return (
    <div className="relative w-full select-none overflow-hidden rounded-2xl bg-slate-100 shadow-card">
      <div className="relative aspect-[4/3] w-full">
        {/* after photo (full, underneath) */}
        <Image
          src={afterUrl}
          alt="After resolution"
          fill
          sizes="(max-width: 480px) 100vw, 480px"
          className="object-cover"
        />
        {/* before photo, clipped to the slider position */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <Image
            src={beforeUrl}
            alt="Before — original report"
            fill
            sizes="(max-width: 480px) 100vw, 480px"
            className="object-cover"
          />
        </div>

        {/* corner labels */}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
          Before
        </span>
        <span className="absolute right-2.5 top-2.5 rounded-full bg-[#16a34a]/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
          After
        </span>

        {/* divider + grabber (visual only) */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_8px_rgba(15,23,42,0.35)]"
          style={{ left: `${pos}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-primary shadow-card">
            <ChevronsLeftRight size={18} strokeWidth={2.4} />
          </span>
        </div>

        {/* the actual control: a full-area, invisible range the user drags */}
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Reveal before and after"
          className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </div>
  );
}
