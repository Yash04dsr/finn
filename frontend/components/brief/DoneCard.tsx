import Link from "next/link";
import type { Brief } from "@/lib/types";

/** The end state: the brief is finished, with the record of what was decided. */
export default function DoneCard({ brief, onLookBack }: { brief: Brief; onLookBack?: () => void }) {
  const decided = brief.done.length;
  const changes = brief.done.filter((d) => d.verdict === "changes_story").length;
  const watch = brief.done.filter((d) => d.verdict === "watch").length;
  const none = decided - changes - watch;
  return (
    <section className="card p-5" aria-labelledby="done-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden="true">
        <path d="M4.5 12.5l5 5L20 7" strokeLinecap="square" />
      </svg>
      <h2 id="done-title" className="display mt-2 text-[22px] leading-tight">
        You are done for this window.
      </h2>
      {decided ? (
        <div className="num mt-3 grid grid-cols-3 border-t border-[#E5E7EB]">
          {[
            { label: "Changes the story", n: changes },
            { label: "Watch closer", n: watch },
            { label: "No impact", n: none },
          ].map((c, i) => (
            <a
              key={c.label}
              href="#decided"
              className={`block min-h-11 pt-2 hover:underline ${i > 0 ? "pl-3" : ""}`}
              aria-label={`${c.n} ${c.label}. Show decided items.`}
            >
              <p className="text-[24px] font-bold leading-none">{c.n}</p>
              <p className="mt-1 text-[12px] leading-tight text-[#4B5563]">{c.label}</p>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[14px] leading-snug text-[#4B5563]">
          No filing or price move crossed your lines in this window.
        </p>
      )}
      <div className="mt-4 flex gap-2">
        {brief.hours < 168 && onLookBack ? (
          <button type="button" onClick={onLookBack} className="btn btn-secondary flex-1">
            Look back 7 days
          </button>
        ) : null}
        <Link href="/chat" className="btn btn-secondary flex-1">
          Ask about a company
        </Link>
      </div>
    </section>
  );
}
