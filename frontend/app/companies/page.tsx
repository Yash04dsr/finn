"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TickerQuote } from "@/lib/types";
import { fetchers, useApi } from "@/lib/useApi";
import { pct, rupees, toneFor } from "@/lib/format";
import Header from "@/components/Header";
import { ListSkeleton, ErrorRow } from "@/components/Skeleton";

/** Tracked portfolio plus a direct ticker-to-research entry point. */
export default function CompaniesPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi(fetchers.companies, []);
  const [ticker, setTicker] = useState("");
  const [validation, setValidation] = useState("");

  const rows: TickerQuote[] = [...(data?.portfolio ?? []), ...(data?.adhoc ?? [])];
  const portfolioCount = data?.portfolio?.length ?? 0;
  const adhocCount = data?.adhoc?.length ?? 0;

  const openResearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) {
      setValidation("Enter a ticker symbol.");
      return;
    }
    if (!/^[A-Z0-9&.-]{1,20}$/.test(normalized)) {
      setValidation("Use up to 20 letters, numbers, ampersands, dots, or hyphens.");
      return;
    }
    setValidation("");
    router.push(`/company/${encodeURIComponent(normalized)}`);
  };

  return (
    <main className="pb-[92px]">
      <Header />

      <div className="space-y-5 px-4 pt-3">
        <section className="card p-4" aria-labelledby="ticker-search-title">
          <h1 id="ticker-search-title" className="text-[15px] font-bold text-[#000000]">Research a company</h1>
          <p className="mt-1 max-w-[65ch] text-[12.5px] leading-relaxed text-[#4B5563]">
            Enter an NSE or BSE ticker. FINN loads a quote when the symbol is listed, and it refuses company analysis when primary documents are missing.
          </p>
          <form className="mt-3" onSubmit={openResearch} noValidate>
            <label htmlFor="ticker-search" className="text-[12px] font-semibold text-[#000000]">
              Ticker symbol
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="ticker-search"
                name="ticker"
                value={ticker}
                onChange={(event) => {
                  setTicker(event.target.value.toUpperCase());
                  if (validation) setValidation("");
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={20}
                list="tracked-tickers"
                aria-describedby={validation ? "ticker-error" : "ticker-hint"}
                aria-invalid={Boolean(validation)}
                className="min-h-11 min-w-0 flex-1 rounded-none border border-[#000000]/30 px-3 text-[16px] font-semibold uppercase tracking-wide placeholder:font-normal placeholder:tracking-normal placeholder:text-[#4B5563]"
                placeholder="e.g. PERSISTENT"
              />
              <datalist id="tracked-tickers">
                {rows.map((row) => <option key={row.ticker} value={row.ticker} />)}
              </datalist>
              <button
                type="submit"
                className="press min-h-11 shrink-0 rounded-none bg-black px-4 text-[12px] font-semibold text-white hover:bg-[#1F2937]"
              >
                Open research
              </button>
            </div>
            {validation ? (
              <p id="ticker-error" role="alert" className="mt-1.5 text-[12px] font-medium text-[#B4442C]">{validation}</p>
            ) : (
              <p id="ticker-hint" className="mt-1.5 text-[11.5px] text-[#4B5563]">You can also choose a tracked ticker below.</p>
            )}
          </form>
        </section>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorRow message="Couldn't load tracked companies. Check your connection and try again." onRetry={reload} />
        ) : rows.length === 0 ? (
          <div className="card mt-2 flex flex-col items-center px-6 py-10 text-center">
            <p className="text-[15px] font-semibold text-[#000000]">No tracked companies yet</p>
            <p className="mt-1.5 max-w-[260px] text-[12.5px] leading-relaxed text-[#4B5563]">
              Enter a ticker above to check whether company research is available.
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
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4B5563]">{label}</h2>
        <span className="num text-[11px] text-[#4B5563]">{count}</span>
      </div>
      <div className="card overflow-hidden">
        {rows.map((q, i) => (
          <Link
            key={q.ticker}
            href={`/company/${encodeURIComponent(q.ticker)}`}
            className={`press flex min-h-11 items-center gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-[#000000]/[0.08]" : ""}`}
          >
            <span className="num min-w-0 flex-1 truncate text-[13.5px] font-bold tracking-wide text-[#000000]">{q.ticker}</span>
            <span className="num shrink-0 text-[12px] font-medium text-[#4B5563]">{rupees(q.close)}</span>
            <span
              className="num min-w-[54px] shrink-0 rounded-none px-1.5 py-0.5 text-center text-[11.5px] font-semibold"
              style={changeStyle(q.change_pct)}
            >
              {pct(q.change_pct)}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#808080" strokeWidth={2} className="ml-auto h-4 w-4" aria-hidden="true">
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
    color: t === "pos" ? "#1E6B4F" : t === "neg" ? "#B4442C" : "#4B5563",
  };
}
