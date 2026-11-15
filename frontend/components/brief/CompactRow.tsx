import Link from "next/link";
import type { BriefItem } from "@/lib/types";
import { relTime } from "@/lib/format";
import { ArrowRight } from "@/components/ui";
import StatusChip from "./StatusChip";
import { VERDICT_LABEL, headlineOf } from "./model";

/**
 * Dense two-line row for items waiting their turn or already decided.
 * `onSelect` brings an item into focus on the brief; otherwise the row opens the evidence.
 */
export default function CompactRow({ item, onSelect }: { item: BriefItem; onSelect?: () => void }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3">
          <span className="num text-[13px] font-bold tracking-[0.02em]">{item.ticker}</span>
          <span className="num shrink-0 text-[12.5px] text-[#4B5563]">
            {item.verdict ? (
              <span className="font-semibold text-black">{VERDICT_LABEL[item.verdict]}</span>
            ) : (
              relTime(item.event_at || item.created_at)
            )}
          </span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-snug">{headlineOf(item)}</p>
        <p className="mt-1 flex items-center gap-2 text-[12.5px] text-[#4B5563]">
          {item.promise_check && (item.promise_check.status === "kept" || item.promise_check.status === "missed") ? (
            <StatusChip status={item.promise_check.status} />
          ) : null}
          <span className="truncate">{item.touches}</span>
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
    </>
  );
  const cls = "flex min-h-[56px] w-full items-center gap-3 border-t border-[#E5E7EB] py-2.5 text-left hover:bg-black/[0.02]";
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={cls} aria-label={`Decide next: ${item.ticker}, ${headlineOf(item)}`}>
        {body}
      </button>
    );
  }
  return (
    <Link href={`/alert/${item.id}`} className={cls}>
      {body}
    </Link>
  );
}
