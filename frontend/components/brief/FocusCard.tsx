import Link from "next/link";
import type { AnnouncementPayload, BriefItem } from "@/lib/types";
import { relTime } from "@/lib/format";
import { ArrowRight, CategoryChip, TickerBadge } from "@/components/ui";
import KeyNumbers from "./KeyNumbers";
import { PromiseCheckRow } from "./PromiseCheck";
import { VERDICT_LABEL, categoryOf, headlineOf } from "./model";

/** Everything needed to decide on one item without leaving the screen. */
export default function FocusCard({ item }: { item: BriefItem }) {
  const p = item.payload as Partial<AnnouncementPayload>;
  const headline = headlineOf(item);
  const summary = p.summary && p.summary !== p.headline && cleanEq(p.summary, headline) ? p.summary : null;
  return (
    <article className="card px-4 pb-1 pt-3.5" aria-labelledby={`focus-${item.id}`}>
      <div className="flex items-center gap-2">
        <TickerBadge ticker={item.ticker} />
        <CategoryChip category={categoryOf(item)} />
        {item.is_new ? <span className="text-[11px] font-bold tracking-[0.08em] text-black">NEW</span> : null}
        <span className="num ml-auto text-[12px] text-[#4B5563]">{relTime(item.event_at || item.created_at)}</span>
      </div>

      <h2 id={`focus-${item.id}`} className="mt-2.5 text-[18px] font-bold leading-snug tracking-[-0.01em]">
        <Link href={`/alert/${item.id}`} className="hover:underline hover:decoration-1 hover:underline-offset-4">
          {headline}
        </Link>
      </h2>
      {summary ? <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-[#4B5563]">{summary}</p> : null}

      <KeyNumbers item={item} />
      {item.promise_check ? <PromiseCheckRow pc={item.promise_check} /> : null}

      <div className="mt-3 border-t border-[#E5E7EB] pt-2.5">
        <h3 className="label">Touches</h3>
        <p className="mt-0.5 text-[15px] font-semibold leading-snug">{item.touches}</p>
        {item.past_verdict ? (
          <p className="mt-1 text-[13px] leading-snug text-[#4B5563]">
            Last time a similar {item.ticker} filing came in, you marked it{" "}
            <span className="font-semibold text-black">{VERDICT_LABEL[item.past_verdict.verdict]}</span>{" "}
            ({relTime(item.past_verdict.created_at)}).
          </p>
        ) : null}
      </div>

      <Link
        href={`/alert/${item.id}`}
        className="mt-2 flex min-h-11 items-center justify-between border-t border-[#E5E7EB] text-[14px] font-semibold"
      >
        See the evidence
        <ArrowRight />
      </Link>
    </article>
  );
}

function cleanEq(summary: string, headline: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return !norm(summary).endsWith(norm(headline));
}
