"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Alert, AnnouncementPayload, DigestPayload, VolumeOrPricePayload } from "@/lib/types";
import { relTime, rupees, times, pct } from "@/lib/format";
import Sheet from "./Sheet";
import CategoryChip from "./CategoryChip";
import FactsTable from "./FactsTable";
import BioCard from "./BioCard";
import Sparkline from "./Sparkline";
import { TickerBadge } from "./AlertRow";
import { DigestItemRow } from "./DigestCard";

/** Slide-up detail for a feed alert, content varies by alert kind. */
export default function DetailSheet({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const router = useRouter();

  const askFinn = (ticker: string, filingId?: string, seed?: string) => {
    const params = new URLSearchParams({ ticker });
    if (filingId) params.set("filing", filingId);
    if (seed) {
      try {
        sessionStorage.setItem(`finn-seed-${filingId || ticker}`, seed);
      } catch {
        /* ignore */
      }
    }
    onClose();
    router.push(`/chat?${params.toString()}`);
  };

  return (
    <Sheet open={!!alert} onClose={onClose} title="Alert details">
      {alert && (
        <div className="px-4 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <TickerBadge ticker={alert.ticker} />
            <span className="num text-[11px] text-[#8B93A3]">{relTime(alert.created_at)}</span>
          </div>

          {alert.kind === "announcement" && (
            <AnnouncementBody p={alert.payload as AnnouncementPayload} filingId={alert.id} onAsk={askFinn} />
          )}
          {(alert.kind === "volume_spike" || alert.kind === "price_move") && (
            <AnomalyBody p={alert.payload as VolumeOrPricePayload} kind={alert.kind} />
          )}
          {alert.kind === "digest" && <DigestBody p={alert.payload as DigestPayload} />}

          <WhyDisclosure why={alert.why} />

          {alert.kind !== "digest" && (
            <button
              onClick={() =>
                askFinn(
                  alert.ticker,
                  alert.kind === "announcement" ? alert.id : undefined,
                  alert.kind === "announcement"
                    ? `What does this filing mean for ${alert.ticker}? ${(alert.payload as AnnouncementPayload).headline}`
                    : `Why is ${alert.ticker} moving like this, and is it noise or signal?`
                )
              }
              className="press mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] py-3 text-[14px] font-semibold text-[#04120C]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M12 2.5l1.9 5.1a2 2 0 0 0 1.2 1.2l5.1 1.9-5.1 1.9a2 2 0 0 0-1.2 1.2L12 18.9l-1.9-5.1a2 2 0 0 0-1.2-1.2L3.8 10.7l5.1-1.9a2 2 0 0 0 1.2-1.2L12 2.5Z" />
              </svg>
              Ask FINN about this {alert.kind === "announcement" ? "filing" : "move"}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8B93A3]">{children}</p>;
}

function AnnouncementBody({
  p,
  filingId,
  onAsk,
}: {
  p: AnnouncementPayload;
  filingId: string;
  onAsk: (ticker: string, filingId?: string, seed?: string) => void;
}) {
  const [clickedUrl, setClickedUrl] = useState<string | null>(null);
  void onAsk; // reserved for future inline actions

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CategoryChip category={p.category} />
        {p.filed_at && <span className="num text-[11px] text-[#8B93A3]">filed {relTime(p.filed_at)}</span>}
      </div>

      <h2 className="mt-2 text-[16px] font-bold leading-snug text-[#E8ECF3]">{p.headline}</h2>

      {p.summary && (
        <div className="mt-3 rounded-xl border border-[#10B981]/20 bg-[#10B981]/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#10B981]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
              <path d="M12 2.5l1.9 5.1a2 2 0 0 0 1.2 1.2l5.1 1.9-5.1 1.9a2 2 0 0 0-1.2 1.2L12 18.9l-1.9-5.1a2 2 0 0 0-1.2-1.2L3.8 10.7l5.1-1.9a2 2 0 0 0 1.2-1.2L12 2.5Z" />
            </svg>
            FINN's take
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#D7DEE9]">{p.summary}</p>
        </div>
      )}

      {p.facts && (
        <>
          <SectionLabel>Key numbers</SectionLabel>
          <FactsTable facts={p.facts} />
        </>
      )}

      {p.bio && (
        <>
          <SectionLabel>New leadership</SectionLabel>
          <BioCard bio={p.bio} />
        </>
      )}

      {p.filing_url && (
        <button
          onClick={() => {
            setClickedUrl(p.filing_url!);
            try {
              window.open(p.filing_url!, "_blank", "noopener");
            } catch {
              /* popup blocked */
            }
          }}
          className="press mt-3 w-full rounded-xl border border-white/[0.08] py-2.5 text-[12.5px] font-medium text-[#8B93A3]"
        >
          {clickedUrl ? "Opening source filing…" : "View source filing"}
        </button>
      )}
    </>
  );
}

function AnomalyBody({ p, kind }: { p: VolumeOrPricePayload; kind: "volume_spike" | "price_move" }) {
  const isVol = kind === "volume_spike";
  return (
    <>
      <h2 className="mt-2 text-[16px] font-bold leading-snug text-[#E8ECF3]">
        {isVol ? "Unusual volume" : "Sharp price move"}
      </h2>
      <div className="mt-3 flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8B93A3]">{isVol ? "Observed" : "Move"}</p>
          <p className="num mt-1 text-[22px] font-bold" style={{ color: isVol ? "#F59E0B" : (p.change_pct ?? 0) < 0 ? "#F43F5E" : "#10B981" }}>
            {isVol ? times(p.value, 2) : pct(p.change_pct ?? p.value)}
          </p>
        </div>
        <div className="border-l border-white/[0.07] pl-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8B93A3]">Your threshold</p>
          <p className="num mt-1 text-[22px] font-bold text-[#8B93A3]">
            {isVol ? times(p.threshold, 2) : `±${(p.threshold ?? 0).toFixed(1)}%`}
          </p>
        </div>
        {p.close != null && (
          <div className="ml-auto text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8B93A3]">Close</p>
            <p className="num mt-1 text-[15px] font-bold text-[#E8ECF3]">{rupees(p.close)}</p>
          </div>
        )}
      </div>
      {Array.isArray(p.closes) && p.closes.length > 2 && (
        <>
          <SectionLabel>Recent closes</SectionLabel>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <Sparkline data={p.closes} width={320} height={64} className="w-full" />
          </div>
        </>
      )}
    </>
  );
}

function DigestBody({ p }: { p: DigestPayload }) {
  return (
    <>
      <h2 className="mt-2 text-[16px] font-bold leading-snug text-[#E8ECF3]">{p.title}</h2>
      <p className="num mt-1 text-[11.5px] text-[#8B93A3]">
        {p.window_hours}h window · {p.stats.shown} shown · {p.stats.hidden} collapsed
      </p>
      <div className="mt-3 space-y-2.5">
        {p.items.map((it, i) => (
          <DigestItemRow key={`${it.ticker}-${i}`} item={it} />
        ))}
      </div>
    </>
  );
}

function WhyDisclosure({ why }: { why: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07]">
      <button onClick={() => setOpen((o) => !o)} className="press flex w-full items-center gap-2 bg-white/[0.02] px-3 py-2.5 text-left">
        <svg viewBox="0 0 24 24" fill="none" stroke="#8B93A3" strokeWidth={1.8} className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.5 2-2.5 3.4M12 16.6v.1" strokeLinecap="round" />
        </svg>
        <span className="text-[12px] font-medium text-[#8B93A3]">Why am I seeing this?</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8B93A3"
          strokeWidth={2}
          className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <p className="border-t border-white/[0.05] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#A8B0BF]">{why}</p>}
    </div>
  );
}
