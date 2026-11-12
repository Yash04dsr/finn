"use client";

import { useId, useState } from "react";
import type { SourceInfo } from "@/lib/types";

/** Accessible source disclosure with optional primary-source link and excerpt. */
export default function CitationChip({ source }: { source: SourceInfo }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const meta = [source.doc_type?.replace(/_/g, " "), source.period].filter(Boolean).join(" · ");

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        className="press flex min-h-11 w-full min-w-0 items-center gap-2 border border-black/20 bg-black/[0.03] px-3 py-2 text-left text-black"
      >
        <span className="num shrink-0 text-[10px] font-bold">S{source.id}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{source.title}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={panelId} className="border-x border-b border-black/20 bg-[#F5F1E8] px-3 py-2.5">
          {meta && <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#4B5563]">{meta}</p>}
          {source.excerpt && (
            <p className="mt-1 break-words text-[12px] leading-relaxed text-[#000000]">“{source.excerpt}”</p>
          )}
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center text-[12px] font-semibold text-[#000000] underline decoration-black/40 underline-offset-4"
            >
              Open primary source
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="ml-1 h-3.5 w-3.5" aria-hidden="true">
                <path d="M14 5h5v5M19 5l-9 9M19 14v5H5V5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
          {!source.excerpt && !source.url && (
            <p className="mt-1 text-[12px] leading-relaxed text-[#4B5563]">
              Source details are limited to the document reference supplied by FINN.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
