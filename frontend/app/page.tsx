"use client";

import { useMemo, useState } from "react";
import type { Alert, DigestResponse } from "@/lib/types";
import { api } from "@/lib/api";
import { fetchers, useApi } from "@/lib/useApi";
import Header from "@/components/Header";
import AlertRow from "@/components/AlertRow";
import DigestCard from "@/components/DigestCard";
import DetailSheet from "@/components/DetailSheet";
import { ListSkeleton, ErrorRow } from "@/components/Skeleton";

const WINDOWS = [
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
] as const;

export default function FeedPage() {
  const [hours, setHours] = useState(24);
  const [openAlert, setOpenAlert] = useState<Alert | null>(null);

  const feed = useApi(useMemo(() => fetchers.feed(hours), [hours]), [hours]);
  const digest = useApi(fetchers.digest, []);

  const alerts = feed.data?.alerts ?? [];
  const attention = alerts.filter((a) => a.priority <= 2);
  const rest = alerts.filter((a) => a.priority > 2);

  const runDemo = async () => {
    try {
      await api.runDemo();
      feed.reload();
      digest.reload();
    } catch {
      /* backend offline — leave the empty state visible */
    }
  };

  return (
    <main className="pb-[92px]">
      <Header />

      {/* Window selector — Swiss segmented row, black underline marks selection */}
      <div className="no-scrollbar flex gap-5 border-b border-[#E5E7EB] px-4 pt-3" role="tablist" aria-label="Feed window">
        {WINDOWS.map((w) => (
          <button
            key={w.hours}
            role="tab"
            aria-selected={hours === w.hours}
            onClick={() => setHours(w.hours)}
            className={`num press relative pb-2 text-[12px] font-semibold tracking-[0.08em] transition-colors ${
              hours === w.hours ? "text-black" : "text-[#808080]"
            }`}
          >
            {w.label}
            {hours === w.hours && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-black" />}
          </button>
        ))}
      </div>

      {/* Hero digest */}
      <section className="px-4 pt-3.5" aria-label="Latest digest">
        {digest.loading ? (
          <div className="card p-4">
            <div className="skel h-3.5 w-24" />
            <div className="skel mt-3 h-5 w-[85%]" />
            <div className="skel mt-2 h-3.5 w-1/2" />
            <div className="skel mt-4 h-3 w-[90%]" />
            <div className="skel mt-2 h-3 w-[70%]" />
          </div>
        ) : digest.data ? (
          <DigestCard digest={(digest.data as DigestResponse).rendered} windowEnd={(digest.data as DigestResponse).window_end} />
        ) : null}
      </section>

      {/* Alert feed */}
      <section className="px-4 pt-4" aria-label="Alerts">
        {feed.loading ? (
          <ListSkeleton rows={5} />
        ) : feed.error ? (
          <ErrorRow message={`Couldn't load the feed — ${feed.error}. Is the backend running?`} onRetry={feed.reload} />
        ) : alerts.length === 0 ? (
          <EmptyState onRun={runDemo} />
        ) : (
          <div className="space-y-4">
            {attention.length > 0 && (
              <div>
                <SectionTitle>Needs attention</SectionTitle>
                <div className="space-y-2.5">
                  {attention.map((a) => (
                    <AlertRow key={a.id} alert={a} onOpen={setOpenAlert} />
                  ))}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <SectionTitle>Rest of the day</SectionTitle>
                <div className="space-y-2.5">
                  {rest.map((a) => (
                    <AlertRow key={a.id} alert={a} onOpen={setOpenAlert} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <DetailSheet alert={openAlert} onClose={() => setOpenAlert(null)} />
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4B5563]">{children}</h2>
  );
}

function EmptyState({ onRun }: { onRun: () => void }) {
  return (
    <div className="card mt-2 flex flex-col items-center px-6 py-10 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth={1.5} className="h-9 w-9" aria-hidden="true">
        <path d="M3 12h4l2.5-7 4 14 2.5-7H21" strokeLinecap="square" strokeLinejoin="miter" />
      </svg>
      <p className="display mt-3 text-[17px] text-black">A quiet day in your portfolio</p>
      <p className="mt-1.5 max-w-[260px] text-[12.5px] leading-relaxed text-[#4B5563]">
        No filings or anomalies crossed your thresholds in this window. Generate a demo day to see how FINN ranks a busy one.
      </p>
      <button
        onClick={onRun}
        className="press mt-4 bg-black px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-white hover:bg-[#1F2937]"
      >
        Run demo pipeline
      </button>
    </div>
  );
}
