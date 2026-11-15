"use client";

import { useState } from "react";
import type { GuidanceClaim, GuidanceScorecard, Ledger, LedgerRow, LedgerStatus } from "@/lib/types";
import { fmtPctPlain, fmtPeriod } from "@/lib/format";
import { SourceLink } from "@/components/ui";
import StatusChip from "@/components/brief/StatusChip";
import { metricLabel } from "@/components/brief/model";

const JUDGED: LedgerStatus[] = ["missed", "kept", "revised", "gone_quiet", "too_early"];
const CHECKABLE: LedgerStatus[] = ["kept", "missed"];
const KNOWN_KINDS = new Set(["revenue_growth", "ebitda_margin", "ebit_margin", "pat_margin", "ebitda_exit_margin"]);

/**
 * The older guidance scorecard, expressed as ledger rows, so there is one
 * Promise ledger on the page. Used only when the ledger has nothing checkable.
 */
export function rowsFromScorecard(sc?: GuidanceScorecard | null): LedgerRow[] {
  if (!sc?.claims?.length) return [];
  const status: Record<GuidanceClaim["verdict"], LedgerStatus> = {
    ahead: "kept",
    on_track: "kept",
    behind: "missed",
    pending: "too_early",
    unverifiable: "not_checkable",
  };
  return sc.claims.map((c) => ({
    period: c.claim_period,
    kind: c.kind,
    metric: c.kind,
    band: c.claimed.lo === c.claimed.hi ? `${c.claimed.lo}${c.claimed.unit}` : `${c.claimed.lo} to ${c.claimed.hi}${c.claimed.unit}`,
    horizon: "",
    quote: c.claimed.quote || c.source.excerpt,
    speaker: "",
    status: status[c.verdict],
    delivered: c.delivered ?? null,
    delivered_period: c.delivered_period ?? null,
    note: "",
    promise_source: { source_id: `S${c.source.chunk_id}`, doc_title: c.source.doc_title, doc_type: "transcript", period: c.source.period, url: c.source.url },
    delivered_source: c.delivered_period ? { provider: "Reported quarterly numbers", period: c.delivered_period } : null,
  }));
}

/** Credibility line, computed here from the graded rows. */
export function credibilityLine(rows: LedgerRow[]): { headline: string; checkable: number; kept: number } {
  const checkable = rows.filter((r) => CHECKABLE.includes(r.status)).length;
  const kept = rows.filter((r) => r.status === "kept").length;
  if (!rows.length) return { headline: "No numeric guidance found in recent calls", checkable, kept };
  if (!checkable) return { headline: "No promise can be checked against reported numbers yet", checkable, kept };
  return {
    headline: `Kept ${kept} of ${checkable} checkable ${checkable === 1 ? "promise" : "promises"}`,
    checkable,
    kept,
  };
}

export default function PromiseLedger({ ledger, fallback }: { ledger: Ledger | null; fallback?: GuidanceScorecard | null }) {
  const [showAll, setShowAll] = useState(false);
  const ledgerRows = ledger?.rows ?? [];
  const useFallback = !ledgerRows.some((r) => JUDGED.includes(r.status)) && (fallback?.claims?.length ?? 0) > 0;
  const rows = useFallback ? rowsFromScorecard(fallback) : ledgerRows;

  const judged = rows
    .filter((r) => JUDGED.includes(r.status))
    .sort((a, b) => JUDGED.indexOf(a.status) - JUDGED.indexOf(b.status));
  const tracked = rows.filter((r) => r.status === "not_checkable");
  const cred = credibilityLine(rows);
  const count = (s: LedgerStatus) => rows.filter((r) => r.status === s).length;
  const calls = ledger?.calls ?? [];
  const periods = calls.map((c) => fmtPeriod(c.period));

  return (
    <section aria-labelledby="ledger-title">
      <div className="card p-4">
        <h2 id="ledger-title" className="label">
          Promise ledger
        </h2>
        <p className="display num mt-1.5 text-[22px] leading-tight">{cred.headline}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-[#4B5563]">
          {calls.length
            ? `Management's numeric commitments from ${calls.length} ${calls.length === 1 ? "call" : "calls"} (${periods[periods.length - 1]} to ${periods[0]}), graded in code against reported quarterly numbers.`
            : "Management's numeric commitments from recent calls, graded in code against reported quarterly numbers."}
        </p>
        {rows.length ? (
          <div className="num mt-3 grid grid-cols-4 border-t border-[#E5E7EB] pt-2 text-[12px] text-[#4B5563]">
            {[
              { label: "Kept", n: count("kept"), color: "#1E6B4F" },
              { label: "Missed", n: count("missed"), color: "#B4442C" },
              { label: "Open", n: count("too_early") + count("revised") + count("gone_quiet"), color: "#000000" },
              { label: "Tracked", n: tracked.length, color: "#000000" },
            ].map((c) => (
              <p key={c.label}>
                <span className="block text-[20px] font-bold leading-none" style={{ color: c.n ? c.color : "#6B7280" }}>
                  {c.n}
                </span>
                {c.label}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {judged.length ? (
        <ul className="mt-1">
          {judged.map((r, i) => (
            <LedgerItem key={`j${i}`} row={r} />
          ))}
        </ul>
      ) : null}

      {tracked.length ? (
        <div className="mt-2 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            aria-expanded={showAll}
            aria-controls="tracked-targets"
            className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-[14px] font-semibold">Other stated targets · {tracked.length}</span>
              <span className="block text-[12.5px] text-[#4B5563]">Not checkable from reported quarterly numbers yet.</span>
            </span>
            <span className="text-[13px] font-semibold">{showAll ? "Hide" : "Show"}</span>
          </button>
          {showAll ? (
            <ul id="tracked-targets">
              {tracked.map((r, i) => (
                <LedgerItem key={`t${i}`} row={r} compact />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {ledger?.numbers_source && !useFallback ? (
        <p className="mt-3 text-[12.5px] text-[#4B5563]">Delivered figures: {ledger.numbers_source}.</p>
      ) : null}
    </section>
  );
}

function LedgerItem({ row, compact }: { row: LedgerRow; compact?: boolean }) {
  const src = row.promise_source;
  const name = KNOWN_KINDS.has(row.kind) ? metricLabel(row.kind) : metricLabel(row.metric);
  const graded = row.status === "kept" || row.status === "missed";
  return (
    <li className={`border-t border-[#E5E7EB] ${compact ? "py-2.5" : "py-3.5"}`}>
      <div className="flex items-start gap-2">
        <StatusChip status={row.status} />
        <p className="num min-w-0 flex-1 text-[14.5px] font-bold leading-snug">
          {name} <span className="font-normal text-[#4B5563]">·</span> {row.band}
        </p>
      </div>
      {graded && row.delivered != null ? (
        <p className="num mt-1.5 text-[14px]">
          Delivered{" "}
          <b style={{ color: row.status === "missed" ? "#B4442C" : "#1E6B4F" }}>{fmtPctPlain(row.delivered)}</b>
          {row.delivered_period ? ` in ${fmtPeriod(row.delivered_period)}` : ""}, against {row.band} guided on the {fmtPeriod(row.period)} call.
        </p>
      ) : row.note ? (
        <p className="mt-1.5 text-[13.5px] text-[#4B5563]">{row.note}</p>
      ) : null}
      {row.quote ? (
        <blockquote className={`mt-1.5 text-[13.5px] leading-snug text-[#374151] ${compact ? "line-clamp-2" : ""}`}>
          &ldquo;{row.quote}&rdquo;{row.speaker ? <span className="text-[#4B5563]"> ({row.speaker})</span> : null}
        </blockquote>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-x-5 text-[13px]">
        <SourceLink href={src?.url} className="min-h-11">
          {src?.url ? `Promise: ${fmtPeriod(row.period)} call` : `${fmtPeriod(row.period)} call, no link`}
        </SourceLink>
        {row.delivered_source ? (
          <SourceLink href={row.delivered_source.url} className="min-h-11">
            Delivered: {row.delivered_source.provider.split(",")[0]}
            {row.delivered_source.period ? `, ${fmtPeriod(row.delivered_source.period)}` : ""}
          </SourceLink>
        ) : null}
      </div>
    </li>
  );
}
