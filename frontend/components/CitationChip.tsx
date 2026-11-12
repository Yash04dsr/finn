"use client";

import { useState } from "react";

/** [S1] → tappable superscript chip that expands to the source title. */
export default function CitationChip({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-label={`Source ${id}: ${title}`}
        className="num ml-0.5 inline-flex h-[15px] min-w-[15px] translate-y-[-2px] items-center justify-center rounded-none border border-[#1E6B4F]/30 bg-[#1E6B4F]/10 px-[3px] align-super text-[9px] font-bold leading-none text-[#1E6B4F] transition-colors active:bg-[#1E6B4F]/25"
      >
        {id}
      </button>
      {open && (
        <span className="absolute bottom-[140%] left-1/2 z-20 w-56 -translate-x-1/2 rounded-none border border-white/10 bg-[#1A2230] px-2.5 py-1.5 text-[11px] font-normal leading-snug text-[#000000] shadow-lg shadow-black/40">
          {title}
        </span>
      )}
    </span>
  );
}
