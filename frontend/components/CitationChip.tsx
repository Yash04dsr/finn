"use client";

import { useId, useState } from "react";
import type { SourceInfo } from "@/lib/types";
import { ExternalIcon } from "@/components/ui";

const DOC_LABEL: Record<string, string> = {
  transcript: "Call transcript",
  annual_report: "Annual report",
  results_filing: "Results presentation",
  metric: "Reported numbers",
};

const PROVIDER_LABEL: Record<string, string> = {
  screener_live: "Screener quarterly table, compiled from exchange filings",
};

/** One cited source: what it is, the passage FINN read, and a link to the document. */
export default function CitationChip({
  source,
  anchorId,
  open: openProp,
  onOpenChange,
}: {
  source: SourceInfo;
  anchorId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (onOpenChange) onOpenChange(value);
    else setOpenState(value);
  };
  const panelId = useId();
  const kind = source.doc_type ? DOC_LABEL[source.doc_type] ?? source.doc_type.replace(/_/g, " ") : "Document";
  const excerpt = source.excerpt?.replace(/\s+/g, " ").trim();

  return (
    <div id={anchorId} className="scroll-mt-24 border-t border-[#E5E7EB]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-12 w-full items-start gap-3 py-2 text-left"
      >
        <span className="cite mt-[1px] shrink-0">{source.id}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">
            {kind}
            {source.period ? ` · ${source.period.replace(/^(Q\d)(FY)/, "$1 $2")}` : ""}
          </span>
          {!open && excerpt ? <span className="block truncate text-[12.5px] text-[#4B5563]">&ldquo;{excerpt}&rdquo;</span> : null}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`mt-1 h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="square" />
        </svg>
      </button>
      {open ? (
        <div id={panelId} className="mb-2 bg-[#F5F1E8] px-3 py-2.5">
          <p className="text-[12.5px] font-semibold">{source.title}</p>
          {excerpt ? <p className="mt-1 break-words text-[14px] leading-relaxed">&ldquo;{excerpt}&rdquo;</p> : null}
          {!excerpt && source.provider ? (
            <p className="mt-1 text-[13px] text-[#4B5563]">{PROVIDER_LABEL[source.provider] ?? source.provider}</p>
          ) : null}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link mt-1 inline-flex min-h-11 items-center gap-1 text-[14px]"
            >
              Open the document
              <ExternalIcon className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
