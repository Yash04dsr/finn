"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "FEED", icon: "M3 11.25 12 3.75l9 7.5M5.25 10.5V20.25H10.5v-6h3v6h5.25V10.5" },
  { href: "/chat", label: "CHAT", icon: "M4.5 5.25h15a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75H12l-4.5 3.75V15.75H4.5a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75Z" },
  { href: "/companies", label: "COMPANIES", icon: "M4.5 20.25V6.75a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v13.5M13.5 10.5h4.5a1.5 1.5 0 0 1 1.5 1.5v8.25M3 20.25h18M7.5 9h1.5M7.5 12.75H9M7.5 16.5H9" },
  { href: "/settings", label: "SETTINGS", icon: "M10.34 3.94a1.5 1.5 0 0 1 2.32 0l.9 1.1c.32.4.83.58 1.32.47l1.4-.31a1.5 1.5 0 0 1 1.64.68l.1.18a1.5 1.5 0 0 1-.1 1.72l-.87 1.1a1.5 1.5 0 0 0-.3 1.08l.13 1.43a1.5 1.5 0 0 1-.87 1.5l-.17.08a1.5 1.5 0 0 1-1.7-.32l-.98-1a1.5 1.5 0 0 0-2.12 0l-.98 1a1.5 1.5 0 0 1-1.7.32l-.17-.08a1.5 1.5 0 0 1-.87-1.5l.13-1.43a1.5 1.5 0 0 0-.3-1.08l-.87-1.1a1.5 1.5 0 0 1-.1-1.72l.1-.18a1.5 1.5 0 0 1 1.64-.68l1.4.31c.49.11 1-.07 1.32-.47l.9-1.1ZM12 15.75V21" },
] as const;

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#000000] bg-white"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <div className="mx-auto flex w-full max-w-[480px] items-stretch justify-around pt-1.5 pb-1">
        {TABS.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="press flex w-full flex-col items-center gap-1 py-1 outline-none focus-visible:outline-2 focus-visible:outline-black"
            >
              <span className="relative">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={active ? "#000000" : "#808080"}
                  strokeWidth={active ? 2 : 1.5}
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  className="h-[22px] w-[22px] transition-colors duration-150"
                  aria-hidden="true"
                >
                  <path d={t.icon} />
                </svg>
                {active && <span className="absolute -top-[9px] left-1/2 h-[3px] w-6 -translate-x-1/2 bg-black" />}
              </span>
              <span
                className="text-[9px] font-semibold tracking-[0.12em] transition-colors duration-150"
                style={{ color: active ? "#000000" : "#6B7280" }}
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
