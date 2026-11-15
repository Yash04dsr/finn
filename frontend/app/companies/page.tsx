"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TickerQuote } from "@/lib/types";
import { ApiError, api } from "@/lib/api";
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
  const [resolving, setResolving] = useState(false);

  const rows: TickerQuote[] = [...(data?.portfolio ?? []), ...(data?.adhoc ?? [])];
  const portfolioCount = data?.portfolio?.length ?? 0;
  const adhocCount = data?.adhoc?.length ?? 0;

  const openResearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = ticker.trim();
    if (!query) {
      setValidation("Enter a symbol or company name.");
      return;
    }
    const asSymbol = query.toUpperCase();
    const symbolLike = /^[A-Z0-9&.-]{1,20}$/.test(asSymbol);
    setValidation("");
    setResolving(true);
    try {
      const { ticker: found } = await api.resolve(query);
      router.push(`/company/${encodeURIComponent(found)}`);
    } catch (err) {
      // An unlisted symbol still opens: the company page says plainly if nothing covers it.
      if (symbolLike && !(err instanceof ApiError && err.status === 400)) {
        router.push(`/company/${encodeURIComponent(asSymbol)}`);
      } else {
        setValidation("No listed company matches that. Try the NSE symbol, such as DIXON.");
      }
    } finally {
      setResolving(false);
    }
  };

  return (
    <main className="pb-[calc(var(--tabbar-h)+var(--safe-bottom)+24px)]">
      <Header />

      <div className="space-y-7 px-4 pt-4">
        <section aria-labelledby="ticker-search-title">
          <h1 id="ticker-search-title" className="display text-[22px] leading-tight">Open any listed company</h1>
          <p className="mt-1 max-w-[65ch] text-[14px] leading-relaxed text-[#4B5563]">
            Enter an NSE or BSE symbol, or the company&apos;s name. For a company FINN has not read, it fetches the newest calls and grades management&apos;s promises, or says plainly that primary sources do not cover it.
          </p>
          <form className="mt-3" onSubmit={openResearch} noValidate>
            <label htmlFor="ticker-search" className="text-[13px] font-semibold text-[#000000]">
              Symbol or company name
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="ticker-search"
                name="ticker"
                value={ticker}
                onChange={(event) => {
                  setTicker(event.target.value);
                  if (validation) setValidation("");
                }}
                autoComplete="off"
                autoCapitalize="words"
                spellCheck={false}
                maxLength={80}
                list="tracked-tickers"
                aria-describedby={validation ? "ticker-error" : "ticker-hint"}
                aria-invalid={Boolean(validation)}
                className="field min-w-0 flex-1 font-semibold tracking-wide placeholder:font-normal placeholder:tracking-normal"
                placeholder="e.g. DIXON or Dixon Technologies"
              />
              <datalist id="tracked-tickers">
                {rows.map((row) => <option key={row.ticker} value={row.ticker} />)}
              </datalist>
              <button
                type="submit"
                className="btn btn-primary shrink-0"
                disabled={resolving}
                aria-busy={resolving}
              >
                {resolving ? "Finding" : "Open"}
              </button>
            </div>
            {validation ? (
              <p id="ticker-error" role="alert" className="mt-1.5 text-[13px] font-semibold text-black">{validation}</p>
            ) : (
              <p id="ticker-hint" className="mt-1.5 text-[13px] text-[#4B5563]">Or pick one of your holdings below.</p>
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
            {portfolioCount > 0 && <Section label="Your portfolio" count={portfolioCount} rows={data!.portfolio} />}
            {adhocCount > 0 && <Section label="Also opened" count={adhocCount} rows={data!.adhoc} />}
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
        <h2 className="label">{label}</h2>
        <span className="num text-[12px] text-[#4B5563]">{count}</span>
      </div>
      <div className="border-b border-[#E5E7EB]">
        {rows.map((q) => (
          <Link
            key={q.ticker}
            href={`/company/${encodeURIComponent(q.ticker)}`}
            className="flex min-h-12 items-center gap-3 border-t border-[#E5E7EB] py-2.5 hover:bg-black/[0.02]"
          >
            <span className="num min-w-0 flex-1 truncate text-[15px] font-bold tracking-[0.02em] text-[#000000]">{q.ticker}</span>
            <span className="num shrink-0 text-[14px] text-[#4B5563]">{rupees(q.close)}</span>
            <span
              className="num min-w-[64px] shrink-0 text-right text-[14px] font-semibold"
              style={changeStyle(q.change_pct)}
            >
              {pct(q.change_pct)}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#808080" strokeWidth={2} className="h-4 w-4 shrink-0" aria-hidden="true">
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
    color: t === "pos" ? "#1E6B4F" : t === "neg" ? "#B4442C" : "#4B5563",
  };
}
