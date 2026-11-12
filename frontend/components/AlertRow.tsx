"use client";

import type { Alert } from "@/lib/types";
import { relTime, rupees, times, humanMetric, pct } from "@/lib/format";
import CategoryChip from "./CategoryChip";
import Sparkline from "./Sparkline";

/** One tappable feed row: ticker badge, rel time, category chip, priority rail. */
export default function AlertRow({ alert, onOpen }: { alert: Alert; onOpen: (a: Alert) => void }) {
  const p = alert.payload as Record<string, unknown>;
  const headline =
    alert.kind === "announcement"
      ? String((p.headline as string) || "Filing")
      : alert.kind === "digest"
        ? String((p.title as string) || "Digest")
        : anomalyLine(alert);

  return (
    <button
      onClick={() => onOpen(alert)}
      className="press card flex w-full items-stretch gap-3 p-3.5 text-left hover:border-[#1F1B16]/[0.22]"
    >
      <span className="lead-bar" style={{ background: railColor(alert.priority) }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TickerBadge ticker={alert.ticker} />
          {alert.kind === "announcement" && <CategoryChip category={p.category as string} />}
          <span className="num ml-auto shrink-0 text-[11px] text-[#6E675C]">{relTime(alert.created_at)}</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-[#1F1B16]">{headline}</p>
        {alert.kind === "announcement" && typeof p.summary === "string" && p.summary && (
          <p className="mt-1 line-clamp-1 text-[12px] leading-snug text-[#6E675C]">{p.summary}</p>
        )}
        {anomalyExtra(alert)}
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="#B9AE99" strokeWidth={2} className="mt-1 h-4 w-4 shrink-0 self-start" aria-hidden="true">
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function TickerBadge({ ticker }: { ticker: string }) {
  return (
    <span className="num rounded-md bg-[#1F1B16]/[0.06] px-1.5 py-0.5 text-[11.5px] font-bold tracking-wide text-[#1F1B16]">
      {ticker}
    </span>
  );
}

export function railColor(priority: number): string {
  if (priority <= 1) return "#B4442C";
  if (priority === 2) return "#B07C24";
  return "rgba(138, 130, 114, 0.4)";
}

function anomalyLine(a: Alert): string {
  const p = a.payload as { metric?: string; value?: number; threshold?: number };
  const m = humanMetric(p.metric);
  if (a.kind === "volume_spike") return `Volume ${times(p.value)} of 20-day average`;
  return `${m} ${pct(p.value)} in a day`;
}

function anomalyExtra(a: Alert): React.ReactNode {
  if (a.kind !== "volume_spike" && a.kind !== "price_move") return null;
  const p = a.payload as {
    value?: number;
    threshold?: number;
    close?: number;
    change_pct?: number;
    closes?: number[];
  };
  const isVol = a.kind === "volume_spike";
  return (
    <div className="mt-2 flex items-center gap-2.5">
      {Array.isArray(p.closes) && p.closes.length > 2 ? <Sparkline data={p.closes} width={64} height={22} /> : null}
      <span className="num text-[11.5px] text-[#6E675C]">
        {isVol ? (
          <>
            <span className="font-semibold text-[#B07C24]">{times(p.value)}</span>
            <span> observed · your threshold {times(p.threshold)}</span>
          </>
        ) : (
          <>
            <span className="font-semibold" style={{ color: (p.change_pct ?? 0) < 0 ? "#B4442C" : "#1E6B4F" }}>
              {pct(p.change_pct)}
            </span>
            <span>
              {" "}
              at {rupees(p.close)} · your threshold ±{(p.threshold ?? 0).toFixed(1)}%
            </span>
          </>
        )}
      </span>
    </div>
  );
}
