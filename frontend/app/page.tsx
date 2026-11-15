"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AnnouncementPayload, Brief, BriefItem, Verdict } from "@/lib/types";
import { api } from "@/lib/api";
import { catLabel, todayLabel } from "@/lib/format";
import Header from "@/components/Header";
import { ErrorRow, Skeleton } from "@/components/Skeleton";
import { SampleNote, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/Toast";
import FocusCard from "@/components/brief/FocusCard";
import VerdictBar from "@/components/brief/VerdictBar";
import SwipeCard from "@/components/brief/SwipeCard";
import CompactRow from "@/components/brief/CompactRow";
import DoneCard from "@/components/brief/DoneCard";
import { VERDICT_LABEL, spokenBrief } from "@/components/brief/model";
import { useSpeech } from "@/components/brief/useSpeech";

const WINDOWS = [
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
] as const;

export default function BriefPage() {
  return (
    <Suspense fallback={null}>
      <BriefScreen />
    </Suspense>
  );
}

function BriefScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const [hours, setHours] = useState(24);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [showBackground, setShowBackground] = useState(false);
  const [today, setToday] = useState("");
  const toast = useToast();
  const speech = useSpeech();
  const seenSent = useRef(false);

  const load = useCallback(async (h: number, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setBrief(await api.brief(h));
    } catch {
      setError("FINN could not load your brief. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  useEffect(() => setToday(todayLabel()), []);

  // Old notification links used /?alert=ID; send them to the evidence screen.
  useEffect(() => {
    const id = search.get("alert");
    if (id) router.replace(`/alert/${id}`);
  }, [search, router]);

  const queue = useMemo(() => brief?.material ?? [], [brief]);
  const focus = queue.find((i) => i.id === focusId) ?? queue[0] ?? null;
  const waiting = queue.filter((i) => i.id !== focus?.id);
  const decidedMaterial = brief?.done.filter((d) => d.priority <= 1).length ?? 0;
  const total = queue.length + decidedMaterial;
  const position = decidedMaterial + 1;

  // Reaching the end of the brief counts as having looked.
  useEffect(() => {
    if (brief && queue.length === 0 && !seenSent.current) {
      seenSent.current = true;
      void api.briefSeen().catch(() => undefined);
    }
  }, [brief, queue.length]);

  const decide = async (item: BriefItem, verdict: Verdict, note?: string) => {
    if (busy) return;
    setBusy(true);
    // Clear it from the queue straight away; the server call confirms it.
    setBrief((b) =>
      b && {
        ...b,
        material: b.material.filter((i) => i.id !== item.id),
        done: [{ ...item, verdict }, ...b.done],
      },
    );
    setFocusId(null);
    try {
      await api.verdict(item.id, verdict, { note });
      const category = (item.payload as Partial<AnnouncementPayload>).category;
      if (verdict === "no_impact" && category && item.kind === "announcement") {
        toast.show({
          text: `${item.ticker} marked No impact.`,
          action: {
            label: `Show fewer ${catLabel(category).toLowerCase()} filings`,
            run: async () => {
              try {
                await api.verdict(item.id, "no_impact", { muteCategory: true });
                toast.show({ text: `${catLabel(category)} filings now rank lower. Change this in Settings.` });
                void load(hours, true);
              } catch {
                toast.show({ text: "Could not change that. Try again from Settings." });
              }
            },
          },
        });
      } else {
        toast.show({ text: `${item.ticker} marked ${VERDICT_LABEL[verdict]}${note ? ", with your reason" : ""}.` });
      }
    } catch {
      toast.show({ text: "Could not save that decision. It is back in the queue." });
      void load(hours, true);
    } finally {
      setBusy(false);
    }
  };

  const listen = () => {
    if (speech.speaking) speech.stop();
    else if (brief) speech.speak(spokenBrief(brief));
  };

  return (
    <main className="pb-[calc(var(--tabbar-h)+var(--safe-bottom)+24px)]">
      <Header right={<span className="num text-[13px] text-[#4B5563]">{today}</span>} />

      <div className="flex items-center gap-1 border-b border-[#E5E7EB] px-2">
        <h1 className="sr-only">Your brief</h1>
        <div role="group" aria-label="Brief window" className="flex">
          {WINDOWS.map((w) => {
            const active = w.hours === hours;
            return (
              <button
                key={w.hours}
                aria-pressed={active}
                aria-label={`Last ${w.label}`}
                onClick={() => setHours(w.hours)}
                className="num relative min-h-12 min-w-12 px-2.5 text-[14px] font-semibold"
                style={{ color: active ? "#000000" : "#4B5563" }}
              >
                {w.label}
                <span
                  className="absolute inset-x-2 bottom-0 h-[2px]"
                  style={{ background: active ? "#000000" : "transparent" }}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
        {speech.supported ? (
          <button
            type="button"
            onClick={listen}
            disabled={!brief}
            aria-pressed={speech.speaking}
            className={`btn ml-auto mr-2 min-h-11 gap-1.5 px-3 text-[13px] ${speech.speaking ? "btn-primary" : "btn-secondary"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
              {speech.speaking ? (
                <path d="M7 7h10v10H7z" fill="currentColor" stroke="none" />
              ) : (
                <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" strokeLinecap="square" />
              )}
            </svg>
            {speech.speaking ? "Stop" : "Listen"}
          </button>
        ) : null}
      </div>

      <div className="px-4 pt-3">
        {error ? (
          <ErrorRow message={error} onRetry={() => void load(hours)} />
        ) : loading && !brief ? (
          <BriefSkeleton />
        ) : brief ? (
          <>
            <Summary brief={brief} queueLength={queue.length} />
            {brief.is_sample ? (
              <div className="mt-2">
                <SampleNote>Sample day for the demo. Filings and numbers are illustrative; live NSE filings replace them on the evening run.</SampleNote>
              </div>
            ) : null}

            <section className="mt-6" aria-label="Decide">
              {focus ? (
                <>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="num text-[13px] font-bold uppercase tracking-[0.1em]">
                      Decide {Math.min(position, total)} of {total}
                    </h2>
                    <span className="text-[12px] text-[#4B5563] [@media(pointer:fine)]:hidden">Swipe: left no impact, right watch</span>
                  </div>
                  <SwipeCard
                    key={focus.id}
                    disabled={busy}
                    onLeft={() => void decide(focus, "no_impact")}
                    onRight={() => void decide(focus, "watch")}
                  >
                    <FocusCard item={focus} />
                  </SwipeCard>
                  <VerdictBar key={`v${focus.id}`} busy={busy} onVerdict={(v, note) => void decide(focus, v, note)} />
                </>
              ) : (
                <DoneCard brief={brief} onLookBack={() => setHours(168)} />
              )}
            </section>

            {waiting.length ? (
              <section className="mt-8">
                <SectionHeader title="Up next" hint={waiting.length} />
                {waiting.map((i) => (
                  <CompactRow key={i.id} item={i} onSelect={() => {
                    setFocusId(i.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }} />
                ))}
              </section>
            ) : null}

            {brief.worth_a_look.length ? (
              <section className="mt-8">
                <SectionHeader title="Worth a look" hint={brief.worth_a_look.length} />
                {brief.worth_a_look.map((i) => (
                  <CompactRow key={i.id} item={i} />
                ))}
              </section>
            ) : null}

            {brief.background.length ? (
              <section className="mt-8">
                <button
                  type="button"
                  onClick={() => setShowBackground((s) => !s)}
                  aria-expanded={showBackground}
                  aria-controls="background-list"
                  className="flex min-h-11 w-full items-center justify-between"
                >
                  <span className="label">Background</span>
                  <span className="num flex items-center gap-1.5 text-[13px] font-semibold">
                    {showBackground ? "Hide" : `Show ${brief.background.length}`}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3.5 w-3.5 transition-transform ${showBackground ? "rotate-180" : ""}`} aria-hidden="true">
                      <path d="m6 9 6 6 6-6" strokeLinecap="square" />
                    </svg>
                  </span>
                </button>
                <div id="background-list">
                  {showBackground ? (
                    brief.background.map((i) => <CompactRow key={i.id} item={i} />)
                  ) : (
                    <p className="border-t border-[#E5E7EB] pt-2 text-[13px] text-[#4B5563]">
                      Dividends, notices and smaller moves that do not need a decision.
                    </p>
                  )}
                </div>
              </section>
            ) : null}

            {brief.done.length ? (
              <section id="decided" className="mt-8 scroll-mt-16">
                <SectionHeader title="Decided" hint={brief.done.length} />
                {brief.done.map((i) => (
                  <CompactRow key={i.id} item={i} />
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
      {toast.node}
    </main>
  );
}

/** One line that tells the investor how big today's job is. */
function Summary({ brief, queueLength }: { brief: Brief; queueLength: number }) {
  const parts: { n: number; text: string }[] = [
    { n: queueLength, text: "to decide" },
    ...(brief.new_since_last_look ? [{ n: brief.new_since_last_look, text: "new since you last looked" }] : []),
    { n: brief.worth_a_look.length, text: "worth a look" },
    { n: brief.routine_count, text: "routine filings hidden" },
  ];
  return (
    <p className="num text-[15px] leading-relaxed text-[#4B5563]">
      {parts.map((p, i) => (
        <span key={p.text}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          <span className="whitespace-nowrap">
            {i === 0 && p.n === 0 ? (
              <b className="font-bold text-black">Nothing left to decide</b>
            ) : (
              <>
                <b className="font-bold text-black">{p.n}</b> {p.text}
              </>
            )}
          </span>
        </span>
      ))}
    </p>
  );
}

function BriefSkeleton() {
  return (
    <div aria-label="Loading your brief" role="status">
      <Skeleton className="h-4 w-[85%]" />
      <Skeleton className="mt-2 h-4 w-[50%]" />
      <Skeleton className="mt-7 h-3 w-24" />
      <div className="card mt-2 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="mt-3 h-5 w-[90%]" />
        <Skeleton className="mt-2 h-5 w-[60%]" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="mt-4 h-4 w-[70%]" />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Skeleton className="h-[52px]" />
        <Skeleton className="h-[52px]" />
        <Skeleton className="h-[52px]" />
      </div>
    </div>
  );
}
