"use client";

import { api } from "@/lib/api";
import type { CostsResponse } from "@/lib/types";
import { compactNum } from "@/lib/format";
import { useEffect, useState } from "react";

/** Sticky FINN wordmark + live token-cost chip. */
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
      className="sticky top-0 z-40 border-b border-[#1F1B16]/[0.12] bg-[#F6F1E7]/92 backdrop-blur-md"
      style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}
    >
      <div className="flex items-center justify-between px-4 pb-2.5 pt-1">
        <div className="flex items-baseline gap-1.5 select-none">
          <span className="display text-[21px] font-bold tracking-tight text-[#1F1B16]">FINN</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#1E6B4F]" aria-hidden="true" />
        </div>
        {typeof tokens === "number" && tokens > 0 && (
          <span
            className="num flex items-center gap-1.5 rounded-full border border-[#1F1B16]/[0.1] bg-[#FFFDF8] px-2.5 py-1 text-[11px] font-medium text-[#6E675C]"
            title="Total tokens spent by FINN across all scopes"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#1E6B4F" strokeWidth={2} className="h-3 w-3" aria-hidden="true">
              <path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10H12l1-8Z" strokeLinejoin="round" />
            </svg>
            {compactNum(tokens)} tok
          </span>
        )}
      </div>
    </header>
  );
}
