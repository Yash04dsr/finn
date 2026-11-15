"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Sticky top bar. Top-level screens show the FINN wordmark; detail screens show
 * a back control instead. `right` holds at most one quiet control or fact.
 */
export default function Header({
  title,
  back,
  right,
}: {
  title?: string;
  back?: { href: string; label: string };
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header
      className="sticky top-0 z-30 border-b border-black bg-white"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex min-h-[52px] items-center gap-3 px-4">
        {back ? (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push(back.href))}
            className="-ml-2 flex min-h-11 min-w-11 items-center gap-1 px-2 text-[14px] font-semibold"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" strokeLinecap="square" />
            </svg>
            {back.label}
          </button>
        ) : (
          <Link href="/" className="display text-[22px] leading-none" aria-label="FINN, back to the brief">
            FINN
          </Link>
        )}
        {title ? <span className="label ml-auto">{title}</span> : null}
        {right ? <div className={title ? "" : "ml-auto"}>{right}</div> : null}
      </div>
    </header>
  );
}
