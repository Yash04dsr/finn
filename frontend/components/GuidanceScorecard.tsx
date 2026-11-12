"use client";

import { useState } from "react";
import type { GuidanceClaim, GuidanceScorecard as Scorecard } from "@/lib/types";

/**
 * Guidance Scorecard — management's committed numbers vs what they delivered.
 * Verdicts are computed server-side from stored filings (deterministic);
 * this view only renders them. Tap a row to read the claim in management's
 * own words (the cited transcript passage).
 * Swiss styling: verdict chips are typographic (black/border), not colored pills.
 */

const VERDICT_META: Record<GuidanceClaim["verdict"], { label: string; solid: boolean; fg: string; border: string }> = {
  ahead: { label: "Ahead", solid: true, fg: "#FFFFFF", border: "#000000" },
  on_track: { label: "On track", solid: false, fg: "#000000", border: "#000000" },
  behind: { label: "Behind", solid: true, fg: "#FFFFFF", border: "#B4442C" },
  pending: { label: "Pending", solid: false, fg: "#4B5563", border: "#E5E7EB" },
  unverifiable: { label: "N/A", solid: false, fg: "#4B5563", border: "#E5E7EB" },
};

const KIND_LABEL: Record<GuidanceClaim["kind"], string> = {
  revenue_growth: "Revenue growth",
  ebitda_margin: "EBITDA margin",
  ebitda_exit_margin: "Exit EBITDA margin",
};

const CRED_META: Record<Scorecard["credibility"], { note: string }> = {
  Strong: { note: "delivered at or ahead of every graded commitment" },
  Watch: { note: "mixed or limited delivery record so far" },
  Challenged: { note: "delivered behind committed numbers" },
};

export default function GuidanceScorecard({ data }: { data: Scorecard }) {
  if (!data.claims.length) return null;
  const cred = CRED_META[data.credibility];

  return (
    <section className="card p-4" aria-label="Guidance scorecard">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-black">Promises vs delivery</h2>
        <span
          className="chip border border-black"
          style={data.credibility === "Challenged" ? { backgroundColor: "#000", color: "#fff", borderColor: "#000" } : { backgroundColor: "#fff", color: "#000" }}
          title={`Credibility: ${cred.note}`}
        >
          {data.credibility}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[#4B5563]">
        Management's committed numbers, extracted from concalls and graded against delivered
        results for <span className="num font-semibold text-black">{data.delivered_period}</span>.
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
      <button onClick={() => setOpen((o) => !o)} className="press w-full bg-[#F5F1E8]/60 px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-black">{KIND_LABEL[claim.kind]}</span>
          <span
            className="chip ml-auto border"
            style={{ backgroundColor: v.solid ? v.border : "#FFFFFF", color: v.fg, borderColor: v.border }}
          >
            {v.label}
          </span>
        </div>
        <p className="num mt-1 text-[11.5px] text-[#4B5563]">
          <span className="text-black">{claim.claim_period}</span> committed{" "}
          <b className="text-black">{band}{claim.claimed.unit}</b>
          {claim.delivered != null && (
            <>
              {" "}→ delivered <b style={{ color: claim.verdict === "behind" ? "#B4442C" : "#1E6B4F" }}>{fmt(claim.delivered)}</b>
              {" "}in <span className="text-black">{claim.delivered_period}</span>
            </>
          )}
        </p>
      </button>
      {open && (
        <div className="border-t border-[#E5E7EB] bg-white px-3 py-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
            In management's words · {claim.source.doc_title}
          </p>
          <p className="text-[12px] leading-relaxed text-black">“{claim.source.excerpt}”</p>
          {claim.source.url && (
            <a
              href={claim.source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block text-[11px] font-medium text-black underline underline-offset-2 hover:border-b hover:border-[#B38B6D]"
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
