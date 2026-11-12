"use client";

import { api } from "@/lib/api";
import type { CostsResponse } from "@/lib/types";
import { compactNum } from "@/lib/format";
import { useEffect, useState } from "react";

/** Sticky FINN wordmark + live token-cost chip. Swiss: black rule, square chip. */
export default function Header() {
  const [costs, setCosts] = useState<CostsResponse | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .costs(ctrl.signal)
      .then(setCosts)
      .catch(() => {
        /* chip simply stays hidden when backend is down */
      });
    return () => ctrl.abort();
  }, []);

  const tokens = costs?.total_tokens;

  return (
    <header
      className="sticky top-0 z-40 border-b border-black bg-white"
      style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}
    >
      <div className="flex items-center justify-between px-4 pb-2.5 pt-1">
        <div className="flex items-baseline gap-2 select-none">
          <span className="display text-[22px] text-black">FINN</span>
          <span className="hidden text-[9px] uppercase tracking-[0.14em] text-[#4B5563] sm:inline">
            Investment Intelligence
          </span>
        </div>
        {typeof tokens === "number" && tokens > 0 && (
          <span
            className="num border border-black/20 px-2 py-0.5 text-[11px] font-medium text-[#4B5563]"
            title="Total tokens spent by FINN across all scopes"
          >
            {compactNum(tokens)} TOK
          </span>
        )}
      </div>
    </header>
  );
}
