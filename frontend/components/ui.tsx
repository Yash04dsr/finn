import type { ReactNode } from "react";
import { catLabel } from "@/lib/format";

export function TickerBadge({ ticker }: { ticker: string }) {
  return (
    <span className="num inline-flex items-center bg-black px-1.5 py-[3px] text-[11.5px] font-bold leading-none tracking-[0.04em] text-white">
      {ticker}
    </span>
  );
}

export function CategoryChip({ category }: { category?: string | null }) {
  return <span className="chip border border-black text-black">{catLabel(category)}</span>;
}

/** A section heading with an optional count or hint on the right. */
export function SectionHeader({ title, hint, id }: { title: string; hint?: ReactNode; id?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-3">
      <h2 id={id} className="label">
        {title}
      </h2>
      {hint != null ? <span className="num text-[12px] text-[#4B5563]">{hint}</span> : null}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#000" strokeWidth="3" />
    </svg>
  );
}

export function ArrowRight({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path d="M9 5l7 7-7 7" strokeLinecap="square" />
    </svg>
  );
}

export function ExternalIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" strokeLinecap="square" />
    </svg>
  );
}

/** Opens a primary source in a new tab; renders plain text when there is no URL. */
export function SourceLink({ href, children, className = "" }: { href?: string | null; children: ReactNode; className?: string }) {
  if (!href) return <span className={`inline-flex items-center text-[#4B5563] ${className}`}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`link inline-flex items-center gap-1 ${className}`}>
      {children}
      <ExternalIcon className="h-3 w-3 shrink-0" />
    </a>
  );
}

/** Shown wherever numbers are from the labelled sample day. */
export function SampleNote({ children }: { children: ReactNode }) {
  return <p className="bg-[#F5F1E8] px-3 py-2 text-[12.5px] leading-snug text-black">{children}</p>;
}
