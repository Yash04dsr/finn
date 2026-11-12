"use client";

import { useState } from "react";
import type { GuidanceClaim, GuidanceScorecard as Scorecard } from "@/lib/types";

/**
 * Guidance Scorecard — management's committed numbers vs what they delivered.
 * Verdicts are computed server-side from stored filings (deterministic);
 * this view only renders them. Tap a row to read the claim in management's
 * own words (the cited transcript passage).
 */

const VERDICT_META: Record<
  GuidanceClaim["verdict"],
  { label: string; color: string; bg: string }
> = {
  ahead: { label: "Ahead", color: "#FFFFFF", bg: "#000000" },
  on_track: { label: "On track", color: "#000000", bg: "#F5F1E8" },
  behind: { label: "Behind", color: "#FFFFFF", bg: "#B4442C" },
  pending: { label: "Pending", color: "#4B5563", bg: "#F5F1E8" },
  unverifiable: { label: "N/A", color: "#4B5563", bg: "#F5F1E8" },
};

const KIND_LABEL: Record<GuidanceClaim["kind"], string> = {
  revenue_growth: "Revenue growth",
  ebitda_margin: "EBITDA margin",
  ebitda_exit_margin: "Exit EBITDA margin",
};

const CRED_META: Record<Scorecard["credibility"], { color: string; bg: string; note: string }> = {
  Strong: { color: "#FFFFFF", bg: "#000000", note: "delivered at or ahead of every graded commitment" },
  Watch: { color: "#000000", bg: "#EDE3D3", note: "mixed or limited delivery record so far" },
  Challenged: { color: "#FFFFFF", bg: "#B4442C", note: "delivered behind committed numbers" },
};

export default function GuidanceScorecard({ data }: { data: Scorecard }) {
  if (!data.claims.length) return null;
  const cred = CRED_META[data.credibility];

  return (
    <section className="card p-4" aria-label="Guidance scorecard">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-[#000000]">Promises vs delivery</h2>
        <span
          className="chip"
          style={{
            backgroundColor: cred.bg,
            color: cred.color,
          }}
          title={`Credibility: ${cred.note}`}
        >
          {data.credibility}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[#4B5563]">
        Management's committed numbers, extracted from concalls and graded against delivered
        results for <span className="num font-semibold text-[#000000]">{data.delivered_period}</span>.
      </p>

      <div className="mt-3 space-y-2">
        {data.claims.map((c, i) => (
          <ClaimRow key={`${c.kind}-${c.claim_period}-${i}`} claim={c} />
        ))}
      </div>
    </section>
  );
}

function ClaimRow({ claim }: { claim: GuidanceClaim }) {
  const [open, setOpen] = useState(false);
  const v = VERDICT_META[claim.verdict];
  const band =
    claim.claimed.lo === claim.claimed.hi
      ? fmt(claim.claimed.lo)
      : `${fmt(claim.claimed.lo)}–${fmt(claim.claimed.hi)}`;

  return (
    <div className="overflow-hidden rounded-none border border-[#E5E7EB]">
      <button onClick={() => setOpen((o) => !o)} className="press w-full bg-[#000000]/[0.03] px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#000000]">{KIND_LABEL[claim.kind]}</span>
          <span className="chip ml-auto" style={{ backgroundColor: v.bg, color: v.color }}>
            {v.label}
          </span>
        </div>
        <p className="num mt-1 text-[11.5px] text-[#4B5563]">
          <span className="text-[#000000]">{claim.claim_period}</span> committed{" "}
          <b className="text-[#000000]">{band}{claim.claimed.unit}</b>
          {claim.delivered != null && (
            <>
              {" "}→ delivered <b style={{ color: claim.verdict === "behind" ? "#B4442C" : "#000000" }}>{fmt(claim.delivered)}</b>
              {" "}in <span className="text-[#000000]">{claim.delivered_period}</span>
            </>
          )}
        </p>
      </button>
      {open && (
        <div className="border-t border-[#E5E7EB] bg-[#F5F1E8] px-3 py-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
            In management's words · {claim.source.doc_title}
          </p>
          <p className="text-[12px] leading-relaxed text-[#000000]">“{claim.source.excerpt}”</p>
          {claim.source.url && (
            <a
              href={claim.source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block text-[11px] font-medium text-black underline-offset-2 hover:underline"
            >
              Open source filing ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(v: number | null | undefined): string {
  if (v == null) return "n/a";
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
}
