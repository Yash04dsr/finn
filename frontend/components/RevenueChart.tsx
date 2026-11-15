"use client";

import { useMemo, useState } from "react";
import type { QuarterlyRow } from "@/lib/types";
import { crore } from "@/lib/format";

/**
 * Quarterly revenue bars (8) + EBITDA margin line overlay.
 * Pure SVG, tabular-nums labels on the last period. Tap a bar for details.
 */
export default function RevenueChart({ quarterly }: { quarterly: QuarterlyRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const series = useMemo(() => quarterly.filter((q) => typeof q.revenue === "number").slice(-8), [quarterly]);

  if (series.length < 2) {
    return <p className="text-[12px] text-[#4B5563]">Quarterly financials will appear here once filings are ingested.</p>;
  }

  const W = 320;
  const H = 150;
  const PAD_B = 22;
  const PAD_T = 26;
  const maxRev = Math.max(...series.map((q) => q.revenue ?? 0)) || 1;
  const margins = series
    .map((q, i) => ({ i, m: q.revenue && q.ebitda != null ? (q.ebitda / q.revenue) * 100 : null }))
    .filter((x) => x.m !== null) as { i: number; m: number }[];
  const maxMargin = margins.length ? Math.max(...margins.map((x) => x.m)) : 0;

  const slot = W / series.length;
  const barW = Math.min(26, slot * 0.52);
  const yRev = (v: number) => H - PAD_B - (v / maxRev) * (H - PAD_B - PAD_T);
  const yMar = (m: number) => H - PAD_B - (m / (maxMargin * 1.15 || 1)) * (H - PAD_B - PAD_T);

  const linePts = margins.map((x) => `${(x.i * slot + slot / 2).toFixed(1)},${yMar(x.m).toFixed(1)}`).join(" ");
  const shown = active ?? series.length - 1;
  const q = series[shown];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Quarterly revenue and EBITDA margin">
        {/* horizontal gridlines */}
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={yRev(maxRev * f)} y2={yRev(maxRev * f)} stroke="#E5E7EB" strokeWidth={1} />
        ))}
        {series.map((s, i) => {
          const h = Math.max(2, H - PAD_B - yRev(s.revenue ?? 0));
          const isLast = i === series.length - 1;
          const isActive = i === shown;
          return (
            <g key={s.period + i} onClick={() => setActive(i)} className="cursor-pointer">
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              <rect
                x={i * slot + (slot - barW) / 2}
                y={H - PAD_B - h}
                width={barW}
                height={h}
                rx={0}
                fill={isActive ? "#000000" : "rgba(0,0,0,0.18)"}
              />
              {isLast && (
                <text
                  x={i * slot + slot / 2}
                  y={H - PAD_B - h - 7}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="#000000"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {crore(s.revenue).replace(" Cr", "")}
                </text>
              )}
              <text x={i * slot + slot / 2} y={H - 7} textAnchor="middle" fontSize={9.5} fill="#4B5563">
                {s.period}
              </text>
            </g>
          );
        })}
        {margins.length > 1 && (
          <polyline points={linePts} fill="none" stroke="#B38B6D" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
        )}
        {margins.length > 0 && (
          <circle cx={margins[margins.length - 1].i * slot + slot / 2} cy={yMar(margins[margins.length - 1].m)} r={3} fill="#B38B6D" />
        )}
      </svg>
      <p className="num mt-2 text-[13px] text-[#4B5563]" aria-live="polite">
        <span className="font-semibold text-black">{q.period.replace(/^(Q\d)(FY)/, "$1 $2")}</span> · Revenue {crore(q.revenue)} · EBITDA margin{" "}
        {q.revenue && q.ebitda != null ? `${((q.ebitda / q.revenue) * 100).toFixed(1)}%` : "not reported"}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-[#4B5563]">
        <span className="h-[3px] w-4 shrink-0 bg-black" aria-hidden="true" />
        <span>Revenue</span>
        <span className="ml-3 h-[3px] w-4 shrink-0 bg-[#B38B6D]" aria-hidden="true" />
        <span>EBITDA margin</span>
        <span className="ml-auto">Tap a quarter</span>
      </p>
    </div>
  );
}
