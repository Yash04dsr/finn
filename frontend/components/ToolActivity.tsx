"use client";

import { useState } from "react";

/** Pulsing tool row while streaming; collapses to a compact done-chip after. */
export default function ToolActivity({ tools, active }: { tools: string[]; active: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!tools.length) return null;

  if (!active) {
    if (!collapsed) {
      return (
        <button
          onClick={() => setCollapsed(true)}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#8B93A3] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={2.2} className="h-3 w-3" aria-hidden="true">
            <path d="m4.5 12.5 5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          used {tools.length} tool{tools.length > 1 ? "s" : ""}
        </button>
      );
      return (
        <button
          onClick={() => setCollapsed(false)}
          className="mt-1.5 flex flex-wrap gap-1.5 text-left"
        >
          {tools.map((t, i) => (
            <span key={i} className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-[#8B93A3]">
              {t}
            </span>
          ))}
        </button>
      );
    }
    return null;
  }

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="pulse-dot" aria-hidden="true" />
      <svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={1.8} className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M14.5 6.5a4 4 0 1 0-5.66 5.66L4 17v3h3l4.84-4.84A4 4 0 0 0 14.5 6.5Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[11.5px] italic text-[#8B93A3]">{tools[tools.length - 1]}…</span>
    </div>
  );
}
