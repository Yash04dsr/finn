"use client";

import { useEffect, useState } from "react";

export type StageState = "done" | "active" | "pending" | "failed";
export interface Stage {
  label: string;
  detail?: string;
  state: StageState;
}

/** Ordered steps for work that takes longer than a few seconds, with elapsed time once it passes 3s. */
export default function StagedProgress({ stages, note }: { stages: Stage[]; note?: string }) {
  const running = stages.some((s) => s.state === "active");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  return (
    <div role="status" aria-live="polite">
      <ol className="space-y-2">
        {stages.map((s) => (
          <li key={s.label} className="flex items-start gap-2.5">
            <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
              {s.state === "done" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                  <path d="M4.5 12.5l5 5L20 7" strokeLinecap="square" />
                </svg>
              ) : s.state === "active" ? (
                <span className="pulse-dot" />
              ) : s.state === "failed" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth={2.5} className="h-4 w-4">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="square" />
                </svg>
              ) : (
                <span className="h-[6px] w-[6px] bg-[#9CA3AF]" />
              )}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[14.5px] leading-snug ${
                  s.state === "pending" ? "text-[#6B7280]" : s.state === "active" ? "font-semibold" : ""
                }`}
              >
                {s.label}
                <span className="sr-only">
                  {s.state === "done" ? ", done" : s.state === "active" ? ", in progress" : s.state === "failed" ? ", failed" : ", waiting"}
                </span>
              </span>
              {s.detail ? <span className="block truncate text-[12.5px] text-[#4B5563]">{s.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {running && (elapsed >= 3 || note) ? (
        <p className="num mt-3 text-[12.5px] text-[#4B5563]">
          {elapsed >= 3 ? `${elapsed}s. ` : ""}
          {note}
        </p>
      ) : null}
    </div>
  );
}
