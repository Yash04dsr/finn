"use client";

import { useState } from "react";
import type { DigestItem, DigestPayload } from "@/lib/types";
import { railColor } from "./AlertRow";

/**
 * Hero digest card — Swiss: heavy black top rule, light display title,
 * square priority ticks. Tap toggles the full item list inline.
 */
export default function DigestCard({ digest, windowEnd }: { digest: DigestPayload; windowEnd?: string }) {
  const [expanded, setExpanded] = useState(false);
  const top = digest.items.slice(0, 3);
  const rest = digest.items.slice(3);

  return (
    <button
      onClick={() => setExpanded((e) => !e)}
      className="press card block w-full overflow-hidden p-4 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="chip border border-black text-black">{digest.window_hours}h digest</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4B5563"
          strokeWidth={2}
          className={`ml-auto h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="square" />
        </svg>
      </div>

      <h2 className="display mt-2 text-[19px] text-black">{digest.title}</h2>

      <p className="num mt-1 text-[11.5px] uppercase tracking-[0.08em] text-[#4B5563]">
        {digest.stats.shown} shown · {digest.stats.hidden} routine collapsed
        {digest.stats.held_back ? ` · ${digest.stats.held_back} more outside this brief` : ""}
        {windowEnd ? ` · till ${new Date(windowEnd).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </p>

      <div className="mt-3 space-y-2 border-t border-[#E5E7EB] pt-3">
        {(expanded ? digest.items : top).map((it, i) => (
          <DigestItemRow key={`${it.ticker}-${i}`} item={it} />
        ))}
      </div>

      {!expanded && rest.length > 0 && (
        <p className="mt-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-black">
          + {rest.length} more in today's digest
        </p>
      )}
    </button>
  );
}

export function DigestItemRow({ item }: { item: DigestItem }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-[6px] h-[6px] w-[6px] shrink-0" style={{ background: railColor(item.priority) }} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[12.5px] leading-snug">
          <span className="num font-bold text-black">{item.ticker}</span>
          <span className="text-[#4B5563]"> · {item.headline}</span>
        </p>
        {item.one_liner && <p className="mt-0.5 line-clamp-1 text-[11.5px] text-[#4B5563]">{item.one_liner}</p>}
      </div>
    </div>
  );
}
