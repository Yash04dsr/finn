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
  ahead: { label: "Ahead", color: "#04120C", bg: "#10B981" },
  on_track: { label: "On track", color: "#34D399", bg: "rgba(16,185,129,0.12)" },
  behind: { label: "Behind", color: "#FECDD3", bg: "rgba(244,63,94,0.14)" },
  pending: { label: "Pending", color: "#8B93A3", bg: "rgba(255,255,255,0.06)" },
  unverifiable: { label: "N/A", color: "#8B93A3", bg: "rgba(255,255,255,0.06)" },
};

const KIND_LABEL: Record<GuidanceClaim["kind"], string> = {
  revenue_growth: "Revenue growth",
  ebitda_margin: "EBITDA margin",
  ebitda_exit_margin: "Exit EBITDA margin",
};

const CRED_META: Record<Scorecard["credibility"], { color: string; note: string }> = {
  Strong: { color: "#10B981", note: "delivered at or ahead of every graded commitment" },
  Watch: { color: "#F59E0B", note: "mixed or limited delivery record so far" },
  Challenged: { color: "#F43F5E", note: "delivered behind committed numbers" },
};

export default function GuidanceScorecard({ data }: { data: Scorecard }) {
  if (!data.claims.length) return null;
  const cred = CRED_META[data.credibility];

  return (
    <section className="card p-4" aria-label="Guidance scorecard">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-[#E8ECF3]">Promises vs delivery</h2>
        <span
          className="chip"
          style={{ backgroundColor: `${cred.color}1f`, color: cred.color }}
          title={`Credibility: ${cred.note}`}
        >
          {data.credibility}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[#8B93A3]">
        Management's committed numbers, extracted from concalls and graded against delivered
        results for <span className="num font-semibold text-[#C6CDD9]">{data.delivered_period}</span>.
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
    <div className="overflow-hidden rounded-xl border border-white/[0.06]">
      <button onClick={() => setOpen((o) => !o)} className="press w-full bg-white/[0.02] px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#C6CDD9]">{KIND_LABEL[claim.kind]}</span>
          <span className="chip ml-auto" style={{ backgroundColor: v.bg, color: v.color }}>
            {v.label}
          </span>
        </div>
        <p className="num mt-1 text-[11.5px] text-[#8B93A3]">
          <span className="text-[#C6CDD9]">{claim.claim_period}</span> committed{" "}
          <b className="text-[#E8ECF3]">{band}{claim.claimed.unit}</b>
          {claim.delivered != null && (
            <>
              {" "}→ delivered <b style={{ color: claim.verdict === "behind" ? "#FB7185" : "#34D399" }}>{fmt(claim.delivered)}</b>
              {" "}in <span className="text-[#C6CDD9]">{claim.delivered_period}</span>
            </>
          )}
        </p>
      </button>
      {open && (
        <div className="border-t border-white/[0.06] bg-[#0D1420] px-3 py-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B93A3]">
            In management's words · {claim.source.doc_title}
          </p>
          <p className="text-[12px] leading-relaxed text-[#C6CDD9]">“{claim.source.excerpt}”</p>
          {claim.source.url && (
            <a
              href={claim.source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block text-[11px] font-medium text-[#34D399] underline-offset-2 hover:underline"
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
