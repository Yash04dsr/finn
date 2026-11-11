"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CompanyResponse } from "@/lib/types";
import { fetchers, useApi } from "@/lib/useApi";
import { pct, rupees, shortDate } from "@/lib/format";
import Header from "@/components/Header";
import RevenueChart from "@/components/RevenueChart";
import CategoryChip from "@/components/CategoryChip";
import GuidanceScorecard from "@/components/GuidanceScorecard";
import { ListSkeleton, ErrorRow } from "@/components/Skeleton";
import { toneFor } from "@/lib/format";

export default function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = use(params);
  const ticker = decodeURIComponent(raw);
  const router = useRouter();
  const { data, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => fetchers.company(ticker)(signal), [ticker]),
    [ticker]
  );
  const [tab, setTab] = useState<"overview" | "filings">("overview");
  const c = data as CompanyResponse | null;

  return (
    <main className="pb-[92px]">
      <Header />

      {/* Back row */}
      <div className="flex items-center px-4 pt-3">
        <button
          onClick={() => router.push("/companies")}
          className="press -ml-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-[#8B93A3]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Companies
        </button>
      </div>

      {loading ? (
        <div className="px-4 pt-4">
          <ListSkeleton rows={3} />
        </div>
      ) : error || !c ? (
        <div className="px-4 pt-4">
          <ErrorRow message={error ? `Couldn't load ${ticker} — ${error}` : `No data for ${ticker} yet.`} onRetry={reload} />
        </div>
      ) : (
        <>
          {/* Ticker header */}
          <div className="px-4 pt-2">
            <div className="flex items-center gap-2.5">
              <span className="num rounded-md bg-white/[0.06] px-2 py-1 text-[15px] font-bold tracking-wide">{c.ticker}</span>
              <div>
                <span className="num block text-[20px] font-bold leading-none tabular-nums">{rupees(c.snapshot?.close)}</span>
                <span
                  className="num text-[12px] font-semibold"
                  style={{ color: toneFor(c.snapshot?.change_pct) === "pos" ? "#10B981" : toneFor(c.snapshot?.change_pct) === "neg" ? "#F43F5E" : "#8B93A3" }}
                >
                  {pct(c.snapshot?.change_pct)} · {shortDate(c.snapshot?.date)}
                </span>
              </div>
            </div>

            {/* Grounded docs badges */}
            <div className="mt-3 flex flex-wrap gap-2">
              <DocBadge label="transcripts" n={c.chunk_stats?.transcripts} />
              <DocBadge label="annual reports" n={c.chunk_stats?.annual_reports} />
              <DocBadge label="results filings" n={c.chunk_stats?.results} />
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 px-4" role="tablist">
            {(["overview", "filings"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="press rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-colors"
                style={
                  tab === t
                    ? { background: "rgba(16,185,129,0.14)", color: "#34D399" }
                    : { color: "#8B93A3" }
                }
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-3 px-4 pt-3.5">
            {tab === "overview" ? (
              <>
                <div className="card p-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-[12.5px] font-semibold text-[#E8ECF3]">Quarterly revenue · EBITDA margin</h2>
                    <span className="text-[10.5px] text-[#8B93A3]">last 8 quarters</span>
                  </div>
                  <RevenueChart quarterly={c.quarterly} />
                </div>
                {c.portfolio_context?.revenue_yoy != null && c.portfolio_context?.portfolio_median_yoy != null && (
                  <PortfolioContext
                    yoy={c.portfolio_context.revenue_yoy}
                    median={c.portfolio_context.portfolio_median_yoy}
                  />
                )}
                {c.guidance_scorecard && c.guidance_scorecard.claims.length > 0 && (
                  <GuidanceScorecard data={c.guidance_scorecard} />
                )}
              </>
            ) : (
              <FilingsList filings={c.filings} />
            )}
          </div>

          {/* Fixed research CTA */}
          <div className="fixed inset-x-0 bottom-[64px] z-30 border-t border-white/[0.07] bg-[#0A0E14]/92 px-4 backdrop-blur-md" style={{ paddingBottom: "8px", paddingTop: "10px" }}>
            <div className="mx-auto w-full max-w-[480px]">
              <button
                onClick={() => router.push(`/chat?ticker=${encodeURIComponent(ticker)}`)}
                className="press flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] py-3 text-[14px] font-semibold text-[#04120C]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M12 2.5l1.9 5.1a2 2 0 0 0 1.2 1.2l5.1 1.9-5.1 1.9a2 2 0 0 0-1.2 1.2L12 18.9l-1.9-5.1a2 2 0 0 0-1.2-1.2L3.8 10.7l5.1-1.9a2 2 0 0 0 1.2-1.2L12 2.5Z" />
                </svg>
                Research {ticker} with FINN
              </button>
            </div>
          </div>
          <div className="h-16" aria-hidden="true" />
        </>
      )}
    </main>
  );
}

/** Portfolio-relative growth line: how this quarter's YoY compares to the book. */
function PortfolioContext({ yoy, median }: { yoy: number; median: number }) {
  const delta = Math.round((yoy - median) * 10) / 10;
  const ahead = delta >= 0;
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={1.8} className="h-4 w-4 shrink-0" aria-hidden="true">
        <path d="M4 19h16M6 16V9m4 7V5m4 11v-4m4 4V8" strokeLinecap="round" />
      </svg>
      <p className="num text-[12px] leading-snug text-[#8B93A3]">
        Latest revenue <b className="text-[#E8ECF3]">{yoy > 0 ? "+" : ""}{yoy.toFixed(1)}% YoY</b> vs{" "}
        <b className="text-[#E8ECF3]">{median > 0 ? "+" : ""}{median.toFixed(1)}%</b> portfolio median —{" "}
        <b style={{ color: ahead ? "#34D399" : "#FB7185" }}>
          {ahead ? `${delta.toFixed(1)} pts ahead` : `${Math.abs(delta).toFixed(1)} pts behind`}
        </b>{" "}
        of your 17-company book.
      </p>
    </div>
  );
}

function DocBadge({ label, n }: { label: string; n?: number }) {
  if (!n && n !== 0) return null;
  return (
    <span className="chip" style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "#34D399" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {n} {label}
    </span>
  );
}

function FilingsList({ filings }: { filings: CompanyResponse["filings"] }) {
  if (!filings.length) {
    return <p className="card p-4 text-[12.5px] text-[#8B93A3]">No filings ingested yet.</p>;
  }
  return (
    <div className="space-y-2.5">
      {filings.slice(0, 8).map((f) => (
        <div key={f.id} className="card p-3.5">
          <div className="flex items-center gap-2">
            <CategoryChip category={f.category} />
            <span className="num ml-auto text-[11px] text-[#8B93A3]">{shortDate(f.filed_at)}</span>
          </div>
          <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-[#E8ECF3]">{f.headline}</p>
          {f.summary && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#8B93A3]">{f.summary}</p>}
        </div>
      ))}
      {filings.length > 8 && (
        <p className="text-center text-[11px] text-[#8B93A3]">+ {filings.length - 8} older filings grounded in FINN</p>
      )}
    </div>
  );
}
