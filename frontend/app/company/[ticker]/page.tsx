"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CompanyResponse, Ledger, VerdictLogRow, Watchpoint } from "@/lib/types";
import { api } from "@/lib/api";
import { catLabel, pct, rupees, shortDate, toneFor } from "@/lib/format";
import Header from "@/components/Header";
import RevenueChart from "@/components/RevenueChart";
import StagedProgress, { type Stage } from "@/components/StagedProgress";
import { ErrorRow, Skeleton } from "@/components/Skeleton";
import { ArrowRight, SectionHeader } from "@/components/ui";
import PromiseLedger from "@/components/company/PromiseLedger";
import Watchpoints from "@/components/company/Watchpoints";
import { VERDICT_LABEL } from "@/components/brief/model";

const SOURCE_LABEL: Record<string, string> = {
  illustrative_snapshot: "Illustrative numbers for the demo, not reported figures.",
  screener_live: "Source: Screener.in quarterly table, compiled from exchange filings.",
  screener: "Source: Screener.in quarterly table, compiled from exchange filings.",
  results_filing: "Source: company results filings.",
};

export default function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = use(params);
  const ticker = decodeURIComponent(raw).toUpperCase();

  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [companyError, setCompanyError] = useState(false);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [ledgerState, setLedgerState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [points, setPoints] = useState<Watchpoint[]>([]);
  const [decisions, setDecisions] = useState<VerdictLogRow[] | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchError, setWatchError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const loadLedger = useCallback(async () => {
    setLedgerState("loading");
    try {
      const l = await api.ledger(ticker);
      setLedger(l);
      setPoints(l.watchpoints ?? []);
      setLedgerState("ready");
    } catch {
      setLedgerState("failed");
    }
  }, [ticker]);

  useEffect(() => {
    let live = true;
    setCompany(null);
    setCompanyError(false);
    api
      .company(ticker)
      .then((c) => {
        if (!live) return;
        setCompany(c);
        setWatching(Boolean(c.watching));
        const hasDocs = Boolean(c.coverage && (c.coverage.chunks.transcripts || c.coverage.chunks.annual_reports));
        if (c.available !== false && (hasDocs || c.preparing?.state !== "running")) void loadLedger();
      })
      .catch(() => live && setCompanyError(true));
    api
      .verdicts()
      .then((r) => live && setDecisions(r.verdicts.filter((v) => v.ticker === ticker)))
      .catch(() => live && setDecisions([]));
    return () => {
      live = false;
    };
  }, [ticker, loadLedger, attempt]);

  // While FINN fetches and reads newer transcripts, keep a request open so the backend keeps
  // working (a serverless instance pauses between requests), then grade once they land.
  const preparing = company?.preparing?.state === "running";
  useEffect(() => {
    if (!preparing) return;
    const ctrl = new AbortController();
    void (async () => {
      for (let attempt = 0; attempt < 20 && !ctrl.signal.aborted; attempt++) {
        try {
          const c = await api.coverage(ticker, ctrl.signal, true);
          setCompany((d) => (d ? { ...d, coverage: c.coverage, preparing: c.preparing } : d));
          if (c.preparing?.state !== "running") {
            void loadLedger();
            return;
          }
        } catch {
          if (ctrl.signal.aborted) return;
        }
        await new Promise((r) => window.setTimeout(r, 1000));
      }
    })();
    return () => ctrl.abort();
  }, [preparing, ticker, loadLedger]);

  const toggleWatch = async () => {
    const next = !watching;
    setWatching(next);
    setWatchError(false);
    try {
      await (next ? api.watch(ticker) : api.unwatch(ticker));
    } catch {
      setWatching(!next);
      setWatchError(true);
    }
  };

  const available = company && company.available !== false;
  const cover = company?.coverage;
  const noDocs = cover && cover.chunks.transcripts === 0 && cover.chunks.annual_reports === 0;
  const prepFailed = company?.preparing?.state === "failed";
  const illustrative = company?.quarterly.some((q) => q.source === "illustrative_snapshot");

  return (
    <main className="pb-[calc(var(--tabbar-h)+var(--safe-bottom)+32px)]">
      <Header
        back={{ href: "/companies", label: "Companies" }}
        right={
          available ? (
            <button
              type="button"
              onClick={() => void toggleWatch()}
              aria-pressed={watching}
              className={`btn min-h-11 px-3 ${watching ? "btn-primary" : "btn-secondary"}`}
            >
              {watching ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M4.5 12.5l5 5L20 7" strokeLinecap="square" />
                  </svg>
                  In your brief
                </>
              ) : (
                "Add to brief"
              )}
            </button>
          ) : null
        }
      />

      <div className="space-y-8 px-4 pt-4">
        {companyError ? (
          <ErrorRow message={`FINN could not load ${ticker}. Check the connection and try again.`} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !company ? (
          <ColdStart ticker={ticker} />
        ) : company.available === false ? (
          <NotCovered ticker={ticker} />
        ) : (
          <>
            <section>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="display num text-[30px] leading-none">{ticker}</h1>
                {company.snapshot ? (
                  <p className="num text-[16px] font-semibold">
                    {rupees(company.snapshot.close)}{" "}
                    <span style={{ color: toneColor(company.snapshot.change_pct) }}>{pct(company.snapshot.change_pct)}</span>
                  </p>
                ) : null}
              </div>
              <p className="num mt-1.5 text-[13px] text-[#4B5563]">
                {company.snapshot ? `Close on ${shortDate(company.snapshot.date)}. ` : "No recent quote. "}
                {cover ? coverageText(company) : null}
              </p>
              {watchError ? <p className="mt-1 text-[13px] font-semibold">Could not change your brief. Try again.</p> : null}
              <Link
                href={`/chat?ticker=${encodeURIComponent(ticker)}&q=${encodeURIComponent(`Did ${ticker} deliver what management promised?`)}`}
                className="btn btn-secondary mt-3 w-full justify-between"
              >
                Ask about {ticker}
                <ArrowRight />
              </Link>
            </section>

            {preparing && noDocs ? (
              <section className="card p-4" aria-label="Preparing research">
                <h2 className="text-[15px] font-bold">Reading {ticker}&apos;s primary documents</h2>
                <p className="mb-3 mt-0.5 text-[13px] text-[#4B5563]">First time for this company. This usually takes under a minute.</p>
                <StagedProgress stages={prepStages(company.preparing?.message ?? "", "running")} />
              </section>
            ) : ledgerState === "loading" && !ledger ? (
              <section className="card p-4" aria-label="Grading promises">
                <StagedProgress
                  stages={[
                    { label: "Finding call transcripts and annual report", state: "done" },
                    { label: "Reading the calls", state: "done" },
                    { label: "Grading promises against reported numbers", state: "active" },
                  ]}
                />
              </section>
            ) : noDocs && (prepFailed || ledgerState === "ready") && !ledger?.rows.length ? (
              <section className="card p-4">
                <h2 className="text-[16px] font-bold">Not covered by primary sources yet</h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[#4B5563]">
                  FINN found no call transcripts or annual report for {ticker}, so it cannot grade management&apos;s promises.
                  Research answers will say so rather than guess. The reported numbers below still come from filings.
                </p>
              </section>
            ) : ledgerState === "failed" ? (
              <ErrorRow message="The promise ledger could not be built right now." onRetry={() => void loadLedger()} />
            ) : (
              <PromiseLedger ledger={ledger} fallback={company.guidance_scorecard} />
            )}

            {company.quarterly.length ? (
              <section aria-labelledby="chart-title">
                <SectionHeader id="chart-title" title="Revenue and EBITDA margin" hint="last 8 quarters" />
                <div className="border border-[#E5E7EB] p-3">
                  <RevenueChart quarterly={company.quarterly} />
                </div>
                <p className={`mt-1.5 text-[12.5px] ${illustrative ? "bg-[#F5F1E8] px-3 py-2 text-black" : "text-[#4B5563]"}`}>
                  {illustrative
                    ? SOURCE_LABEL.illustrative_snapshot
                    : SOURCE_LABEL[company.quarterly[company.quarterly.length - 1].source] ?? `Source: ${company.quarterly[company.quarterly.length - 1].source}.`}
                </p>
                {company.portfolio_context?.revenue_yoy != null && company.portfolio_context.portfolio_median_yoy != null ? (
                  <p className="num mt-2 text-[13.5px]">
                    Latest revenue{" "}
                    <b style={{ color: toneColor(company.portfolio_context.revenue_yoy) }}>{pct(company.portfolio_context.revenue_yoy)} YoY</b>{" "}
                    against a portfolio median of {pct(company.portfolio_context.portfolio_median_yoy)}.
                  </p>
                ) : null}
              </section>
            ) : null}

            <section aria-labelledby="ask-title">
              <SectionHeader id="ask-title" title="Ask the filings" hint="annual reports and calls only" />
              <ul>
                {researchQuestions(ticker).map((q) => (
                  <li key={q}>
                    <Link
                      href={`/chat?ticker=${encodeURIComponent(ticker)}&q=${encodeURIComponent(q)}`}
                      className="flex min-h-12 items-center justify-between gap-3 border-t border-[#E5E7EB] text-[15px] hover:bg-black/[0.02]"
                    >
                      {q}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="history-title">
              <SectionHeader id="history-title" title="Your decisions" hint={decisions?.length || undefined} />
              {decisions === null ? (
                <Skeleton className="h-12 w-full" />
              ) : decisions.length ? (
                <ul>
                  {decisions.map((d) => (
                    <li key={d.alert_id}>
                      <Link href={`/alert/${d.alert_id}`} className="flex min-h-12 items-start gap-3 border-t border-[#E5E7EB] py-2.5 hover:bg-black/[0.02]">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14.5px] font-semibold leading-snug">
                            {VERDICT_LABEL[d.verdict]}
                            <span className="num font-normal text-[#4B5563]"> · {shortDate(d.created_at)}</span>
                          </p>
                          <p className="truncate text-[13px] text-[#4B5563]">{d.headline.replace(/^.{3,70}?\s+[-–]\s*/, "")}</p>
                          {d.note ? <p className="mt-1 text-[14px] leading-snug">&ldquo;{d.note}&rdquo;</p> : null}
                        </div>
                        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-[#E5E7EB] py-3 text-[14px] text-[#4B5563]">
                  No decisions on {ticker} yet. Verdicts you give in the brief are kept here with your reasons.
                </p>
              )}
            </section>

            <section aria-labelledby="wp-title">
              <SectionHeader id="wp-title" title="Your watchpoints" hint={points.length || undefined} />
              <Watchpoints ticker={ticker} points={points} onChange={setPoints} />
            </section>

            {company.filings.length ? (
              <section aria-labelledby="filings-title">
                <SectionHeader id="filings-title" title="Recent filings" hint={company.filings.length} />
                <ul>
                  {company.filings.map((f) => (
                    <li key={f.id} className="border-t border-[#E5E7EB] py-2.5">
                      <p className="line-clamp-2 text-[14px] leading-snug">{f.headline.replace(/^.{3,70}?\s+[-–]\s*/, "")}</p>
                      <p className="num mt-0.5 text-[12.5px] text-[#4B5563]">
                        {catLabel(f.category)} · {shortDate(f.filed_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function toneColor(v: number | null | undefined) {
  const t = toneFor(v);
  return t === "pos" ? "#1E6B4F" : t === "neg" ? "#B4442C" : "#4B5563";
}

/** The research views an investor reaches for, phrased so the answer must come from the company's own documents. */
function researchQuestions(t: string): string[] {
  return [
    `What does ${t} do, and how is its revenue split by segment?`,
    `What did ${t} guide on growth, margins and capex?`,
    `How much debt does ${t} carry, and how long is its working-capital cycle?`,
    `Does ${t} turn its profits into operating cash?`,
    `What is the bull case and the bear case for ${t}, from its own filings?`,
  ];
}

function coverageText(c: CompanyResponse): string {
  const ch = c.coverage!.chunks;
  const docs = [ch.transcripts ? "call transcripts" : null, ch.annual_reports ? "annual report" : null, ch.results ? "results presentation" : null].filter(Boolean);
  if (!docs.length) return c.preparing?.state === "running" ? "Fetching documents now." : "No primary documents on file.";
  if (c.preparing?.state === "running") return `On file: ${docs.join(", ")}. Checking for newer calls.`;
  return `On file: ${docs.join(", ")}.`;
}

/** Map the backend's progress message onto three plain stages. */
function prepStages(message: string, state: "running" | "done"): Stage[] {
  const reading = /^reading/i.test(message);
  return [
    {
      label: "Finding call transcripts and annual report",
      state: reading || state === "done" ? "done" : "active",
      detail: !reading && !/^finding/i.test(message) ? message : undefined,
    },
    { label: "Reading the calls", state: reading ? "active" : state === "done" ? "done" : "pending", detail: reading ? message.replace(/^Reading\s+/i, "") : undefined },
    { label: "Grading promises against reported numbers", state: "pending" },
  ];
}

/** Skeleton for a quick load; staged steps once it is clearly a live fetch. */
function ColdStart({ ticker }: { ticker: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <section aria-label={`Loading ${ticker}`}>
      <h1 className="display num text-[30px] leading-none">{ticker}</h1>
      {slow ? (
        <div className="card mt-4 p-4">
          <StagedProgress
            stages={[
              { label: "Looking up the quote and quarterly numbers", state: "active" },
              { label: "Finding call transcripts and annual report", state: "pending" },
              { label: "Grading promises against reported numbers", state: "pending" },
            ]}
            note="FINN fetches these live the first time a company is opened."
          />
        </div>
      ) : (
        <div role="status" aria-label="Loading">
          <Skeleton className="mt-3 h-4 w-[60%]" />
          <Skeleton className="mt-6 h-32 w-full" />
          <Skeleton className="mt-6 h-16 w-full" />
        </div>
      )}
    </section>
  );
}

function NotCovered({ ticker }: { ticker: string }) {
  return (
    <section className="card p-5" aria-labelledby="nc-title">
      <h1 id="nc-title" className="display text-[22px] leading-tight">
        {ticker} is not covered by primary sources
      </h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-[#4B5563]">
        FINN found no quote, filings, call transcripts or annual report for this symbol. It will not build a company page from model memory.
      </p>
      <p className="mt-2 text-[14.5px] leading-relaxed text-[#4B5563]">Check the NSE or BSE symbol. For example, Persistent Systems is PERSISTENT.</p>
      <Link href="/companies" className="btn btn-primary mt-4 w-full">
        Try another ticker
      </Link>
    </section>
  );
}
