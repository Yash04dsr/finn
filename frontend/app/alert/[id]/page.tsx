"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnnouncementPayload, Verdict, VerdictLogRow, VolumeOrPricePayload } from "@/lib/types";
import { api } from "@/lib/api";
import { fetchers, useApi } from "@/lib/useApi";
import { fmtPeriod, relTime, shortDate } from "@/lib/format";
import Header from "@/components/Header";
import BioCard from "@/components/BioCard";
import FactsTable from "@/components/FactsTable";
import Sparkline from "@/components/Sparkline";
import { ErrorRow, Skeleton } from "@/components/Skeleton";
import { ArrowRight, CategoryChip, SampleNote, SectionHeader, SourceLink, TickerBadge } from "@/components/ui";
import KeyNumbers from "@/components/brief/KeyNumbers";
import VerdictBar from "@/components/brief/VerdictBar";
import { PromiseCheckPanel } from "@/components/brief/PromiseCheck";
import { VERDICT_LABEL, categoryOf, headlineOf, questionsFor } from "@/components/brief/model";

export default function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = Number(raw);
  const router = useRouter();
  const { data: alert, loading, error, notFound, reload } = useApi(
    useCallback((s: AbortSignal) => fetchers.alert(id)(s), [id]),
    [id],
  );
  const [past, setPast] = useState<VerdictLogRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ verdict: Verdict; note?: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .verdicts(ctrl.signal)
      .then((r) => setPast(r.verdicts.find((v) => v.alert_id === id) ?? null))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [id]);

  const decide = async (verdict: Verdict, note?: string) => {
    setBusy(true);
    setSaveError(null);
    try {
      await api.verdict(id, verdict, { note });
      setSaved({ verdict, note });
      window.setTimeout(() => (window.history.length > 1 ? router.back() : router.push("/")), 900);
    } catch {
      setSaveError("Could not save that decision. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const p = (alert?.payload ?? {}) as Partial<AnnouncementPayload & VolumeOrPricePayload>;
  const isFiling = alert?.kind === "announcement";
  const current = saved?.verdict ?? past?.verdict ?? null;

  return (
    <main className="pb-[calc(var(--safe-bottom)+150px)]">
      <Header back={{ href: "/", label: "Brief" }} title="Evidence" />

      <div className="space-y-7 px-4 pt-4">
        {loading ? (
          <EvidenceSkeleton />
        ) : notFound ? (
          <div className="card p-5">
            <h1 className="text-[18px] font-bold">This alert is no longer on file</h1>
            <p className="mt-1.5 text-[14px] text-[#4B5563]">It may have been cleared by a newer run. Your brief has everything current.</p>
            <Link href="/" className="btn btn-primary mt-4 w-full">
              Open the brief
            </Link>
          </div>
        ) : error || !alert ? (
          <ErrorRow message="FINN could not load this alert. Check the connection and try again." onRetry={reload} />
        ) : (
          <>
            <section>
              <div className="flex items-center gap-2">
                <TickerBadge ticker={alert.ticker} />
                <CategoryChip category={categoryOf(alert)} />
                <span className="num ml-auto text-[12px] text-[#4B5563]">{relTime(alert.event_at || alert.created_at)}</span>
              </div>
              <h1 className="display mt-3 text-[22px] leading-[1.2]">{headlineOf(alert)}</h1>
              {p.summary && p.summary !== p.headline ? (
                <p className="mt-2 text-[15px] leading-relaxed text-[#4B5563]">{p.summary}</p>
              ) : null}
              {p.is_sample ? (
                <div className="mt-3">
                  <SampleNote>Sample-day filing used for the demo. Its numbers are illustrative.</SampleNote>
                </div>
              ) : null}
              {past && !saved ? (
                <p className="mt-3 text-[13.5px] text-[#4B5563]">
                  You marked this <b className="text-black">{VERDICT_LABEL[past.verdict]}</b> on {shortDate(past.created_at)}
                  {past.note ? <>: &ldquo;{past.note}&rdquo;</> : "."}
                </p>
              ) : null}
            </section>

            {alert.promise_check ? <PromiseCheckPanel pc={alert.promise_check} /> : null}

            {p.facts?.rows?.length ? (
              <section>
                <SectionHeader title={`First cut${p.facts.period ? ` · ${fmtPeriod(p.facts.period)}` : ""}`} />
                <FactsTable facts={p.facts} />
                {p.facts.source && !p.facts.is_illustrative ? (
                  <p className="mt-1.5 text-[12.5px] text-[#4B5563]">Numbers from {p.facts.source.replace(/_/g, " ")}.</p>
                ) : null}
              </section>
            ) : null}

            {p.bio ? (
              <section>
                <SectionHeader title="Who is coming in" />
                <BioCard bio={p.bio} />
              </section>
            ) : null}

            {!isFiling ? (
              <section>
                <SectionHeader title={alert.kind === "volume_spike" ? "Trading" : "Price"} />
                <KeyNumbers item={alert} />
                {p.spark && p.spark.length > 1 ? (
                  <div className="mt-3">
                    <Sparkline data={p.spark} width={358} height={56} className="w-full" />
                    <p className="mt-1 text-[12px] text-[#4B5563]">Last {p.spark.length} closes, end-of-day prices from Yahoo Finance.</p>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section>
              <SectionHeader title="Touches" />
              <p className="text-[16px] font-semibold leading-snug">{alert.touches}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-[#4B5563]">{alert.why}</p>
            </section>

            {isFiling ? (
              <section>
                <SectionHeader title="Source" />
                {p.filing_url ? (
                  <SourceLink href={p.filing_url} className="min-h-11 text-[15px]">
                    Open the exchange filing
                  </SourceLink>
                ) : (
                  <p className="text-[14px] text-[#4B5563]">
                    {p.is_sample ? "Sample filings have no document attached." : "The exchange did not attach a document."}
                  </p>
                )}
              </section>
            ) : null}

            <section>
              <SectionHeader title="Ask about this" />
              <ul>
                {questionsFor(alert).map((q) => (
                  <li key={q}>
                    <Link
                      href={`/chat?ticker=${encodeURIComponent(alert.ticker)}&filing=${alert.id}&q=${encodeURIComponent(q)}`}
                      className="flex min-h-12 items-center justify-between gap-3 border-t border-[#E5E7EB] text-[15px] hover:bg-black/[0.02]"
                    >
                      {q}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={`/company/${encodeURIComponent(alert.ticker)}`}
                    className="flex min-h-12 items-center justify-between gap-3 border-y border-[#E5E7EB] text-[15px] font-semibold hover:bg-black/[0.02]"
                  >
                    {alert.ticker}&apos;s promise ledger and your decisions
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                </li>
              </ul>
            </section>
          </>
        )}
      </div>

      {alert ? (
        <div className="fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto w-full max-w-[480px] border-t border-black bg-white px-4 pb-[calc(var(--safe-bottom)+10px)] pt-1 md:border-x md:border-x-[#E5E7EB]">
            {saved ? (
              <p className="flex min-h-[62px] items-center justify-center text-[15px] font-semibold" role="status">
                Marked {VERDICT_LABEL[saved.verdict]}
                {saved.note ? " with your reason" : ""}. Back to the brief.
              </p>
            ) : (
              <>
                {saveError ? <p className="pt-2 text-[13px] font-semibold text-black">{saveError}</p> : null}
                <VerdictBar busy={busy} current={current} onVerdict={(v, note) => void decide(v, note)} />
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function EvidenceSkeleton() {
  return (
    <div role="status" aria-label="Loading the evidence">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="mt-4 h-6 w-[92%]" />
      <Skeleton className="mt-2 h-6 w-[60%]" />
      <Skeleton className="mt-8 h-40 w-full" />
      <Skeleton className="mt-8 h-24 w-full" />
    </div>
  );
}
