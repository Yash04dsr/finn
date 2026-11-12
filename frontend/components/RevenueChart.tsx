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
          <line key={f} x1={0} x2={W} y1={yRev(maxRev * f)} y2={yRev(maxRev * f)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
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
                rx={4}
                fill={isActive ? "#000000" : "#E5E7EB"}
              />
              {isLast && (
                <text
                  x={i * slot + slot / 2}
                  y={H - PAD_B - h - 7}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill="#000000"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {crore(s.revenue).replace(" Cr", "")}
                </text>
              )}
              <text x={i * slot + slot / 2} y={H - 7} textAnchor="middle" fontSize={8.5} fill="#4B5563">
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
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-[#4B5563]">
          <span className="font-semibold text-[#000000]">{q.period}</span> · Rev {crore(q.revenue)} · EBITDA {crore(q.ebitda)}
        </span>
        <span className="flex items-center gap-1 text-[#4B5563]">
          <span className="h-[3px] w-4 bg-[#1E6B4F]" />
          Revenue
          <span className="ml-2 h-[3px] w-4 bg-[#B38B6D]" />
          Margin
        </span>
      </div>
    </div>
  );
}
