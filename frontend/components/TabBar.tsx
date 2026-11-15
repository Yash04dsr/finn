"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "Brief",
    match: (p: string) => p === "/",
    icon: "M5 6.5h14M5 12h14M5 17.5h8",
  },
  {
    href: "/companies",
    label: "Companies",
    match: (p: string) => p.startsWith("/companies") || p.startsWith("/company/"),
    icon: "M4 20V8l6-3v15M10 20V10l10 3v7M3 20h18M13.5 15h3M13.5 17.5h3",
  },
  {
    href: "/chat",
    label: "Ask",
    match: (p: string) => p.startsWith("/chat"),
    icon: "M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3Z",
  },
  {
    href: "/settings",
    label: "Settings",
    match: (p: string) => p.startsWith("/settings"),
    icon: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  },
] as const;

/** Four destinations, never actions. Hidden on the evidence screen, which has its own verdict bar. */
export default function TabBar() {
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/alert/")) return null;

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40">
      <div
        className="mx-auto flex w-full max-w-[480px] items-stretch border-t border-black bg-white md:border-x md:border-x-[#E5E7EB]"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="relative flex min-h-[var(--tabbar-h)] flex-1 flex-col items-center justify-center gap-1"
            >
              {active && <span className="absolute inset-x-5 top-0 h-[3px] bg-black" aria-hidden="true" />}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? 2 : 1.6}
                strokeLinecap="square"
                strokeLinejoin="miter"
                className="h-[22px] w-[22px]"
                style={{ color: active ? "#000000" : "#6B7280" }}
                aria-hidden="true"
              >
                <path d={t.icon} />
              </svg>
              <span
                className="text-[11px] font-semibold tracking-[0.02em]"
                style={{ color: active ? "#000000" : "#4B5563" }}
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
