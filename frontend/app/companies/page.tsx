"use client";

import Link from "next/link";
import type { TickerQuote } from "@/lib/types";
import { fetchers, useApi } from "@/lib/useApi";
import { pct, toneFor } from "@/lib/format";
import Header from "@/components/Header";
import { ListSkeleton, ErrorRow } from "@/components/Skeleton";

/** Portfolio (17) + Ad-hoc research (4) universe list. */
export default function CompaniesPage() {
  const { data, loading, error, reload } = useApi(fetchers.companies, []);

  const rows: TickerQuote[] = [...(data?.portfolio ?? []), ...(data?.adhoc ?? [])];
  const portfolioCount = data?.portfolio?.length ?? 0;
  const adhocCount = data?.adhoc?.length ?? 0;

  return (
    <main className="pb-[92px]">
      <Header />

      <div className="px-4 pt-3">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorRow message={`Couldn't load the universe — ${error}. Is the backend running?`} onRetry={reload} />
        ) : rows.length === 0 ? (
          <div className="card mt-2 flex flex-col items-center px-6 py-10 text-center">
            <p className="text-[15px] font-semibold text-[#E8ECF3]">No companies yet</p>
            <p className="mt-1.5 max-w-[260px] text-[12.5px] leading-relaxed text-[#8B93A3]">
              The universe loads once the backend has ingested the portfolio and ad-hoc tickers.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {portfolioCount > 0 && <Section label="Portfolio" count={portfolioCount} rows={data!.portfolio} />}
            {adhocCount > 0 && <Section label="Ad-hoc research" count={adhocCount} rows={data!.adhoc} />}
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ label, count, rows }: { label: string; count: number; rows: TickerQuote[] }) {
  return (
    <section aria-label={label}>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B93A3]">{label}</h2>
        <span className="num text-[11px] text-[#8B93A3]">{count}</span>
      </div>
      <div className="card overflow-hidden">
        {rows.map((q, i) => (
          <Link
            key={q.ticker}
            href={`/company/${encodeURIComponent(q.ticker)}`}
            className={`press flex items-center gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-white/[0.05]" : ""}`}
          >
            <span className="num w-24 shrink-0 text-[13.5px] font-bold tracking-wide text-[#E8ECF3]">{q.ticker}</span>
            <span
              className="num rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold"
              style={changeStyle(q.change_pct)}
            >
              {pct(q.change_pct)}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#3A4354" strokeWidth={2} className="ml-auto h-4 w-4" aria-hidden="true">
              <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
    </section>
  );
}

function changeStyle(v: number | null): React.CSSProperties {
  const t = toneFor(v);
  return {
    background: t === "pos" ? "rgba(16,185,129,0.12)" : t === "neg" ? "rgba(244,63,94,0.12)" : "rgba(139,147,163,0.12)",
    color: t === "pos" ? "#34D399" : t === "neg" ? "#FB7185" : "#8B93A3",
  };
}
