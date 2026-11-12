"use client";

import { useState } from "react";
import type { DigestItem, DigestPayload } from "@/lib/types";
import { railColor } from "./AlertRow";

/**
 * Hero digest card: title, window, "N shown · M routine collapsed",
 * top-3 items with priority dots; tap toggles the full item list inline.
 */
export default function DigestCard({ digest, windowEnd }: { digest: DigestPayload; windowEnd?: string }) {
  const [expanded, setExpanded] = useState(false);
  const top = digest.items.slice(0, 3);
  const rest = digest.items.slice(3);

  return (
    <button
      onClick={() => setExpanded((e) => !e)}
      className="press card block w-full overflow-hidden p-4 text-left hover:border-[#1E6B4F]/30"
    >
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="#1E6B4F" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
          <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" strokeLinecap="round" />
        </svg>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1E6B4F]">
          {digest.window_hours}h digest
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8A8272"
          strokeWidth={2}
          className={`ml-auto h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="display mt-2 text-[17.5px] font-bold leading-snug tracking-tight text-[#1F1B16]">{digest.title}</h2>

      <p className="num mt-1 text-[11.5px] text-[#6E675C]">
        {digest.stats.shown} shown · {digest.stats.hidden} routine collapsed
        {windowEnd ? ` · till ${new Date(windowEnd).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </p>

      <div className="mt-3 space-y-2">
        {(expanded ? digest.items : top).map((it, i) => (
          <DigestItemRow key={`${it.ticker}-${i}`} item={it} />
        ))}
      </div>

      {!expanded && rest.length > 0 && (
        <p className="mt-2.5 text-[11.5px] font-medium text-[#1E6B4F]">+ {rest.length} more in today's digest</p>
      )}
    </button>
  );
}

export function DigestItemRow({ item }: { item: DigestItem }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: railColor(item.priority) }} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[12.5px] leading-snug">
          <span className="num font-bold text-[#1F1B16]">{item.ticker}</span>
          <span className="text-[#6E675C]"> · {item.headline}</span>
        </p>
        {item.one_liner && <p className="mt-0.5 line-clamp-1 text-[11.5px] text-[#6E675C]">{item.one_liner}</p>}
      </div>
    </div>
  );
}
