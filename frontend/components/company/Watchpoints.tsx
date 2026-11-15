"use client";

import { type FormEvent, useId, useState } from "react";
import type { Watchpoint } from "@/lib/types";
import { api } from "@/lib/api";

/** Conditions that would change the investor's view. New filings are tied to them in the brief. */
export default function Watchpoints({
  ticker,
  points,
  onChange,
}: {
  ticker: string;
  points: Watchpoint[];
  onChange: (next: Watchpoint[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = useId();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (text.length < 3) {
      setError("Write at least 3 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const wp = await api.addWatchpoint(ticker, text);
      onChange([...points, wp]);
      setDraft("");
    } catch {
      setError("Could not save the watchpoint. Your text is kept; try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (wp: Watchpoint) => {
    onChange(points.filter((p) => p.id !== wp.id));
    try {
      await api.deleteWatchpoint(ticker, wp.id);
    } catch {
      onChange(points);
      setError("Could not remove that watchpoint. Try again.");
    }
  };

  return (
    <div>
      {points.length ? (
        <ul>
          {points.map((w) => (
            <li key={w.id} className="flex min-h-12 items-center gap-2 border-t border-[#E5E7EB]">
              <p className="min-w-0 flex-1 py-2 text-[14.5px] leading-snug">
                {w.text}
                {w.origin === "drafted" ? <span className="ml-1.5 text-[12px] text-[#4B5563]">drafted from the call</span> : null}
              </p>
              <button
                type="button"
                onClick={() => void remove(w)}
                aria-label={`Remove watchpoint: ${w.text}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-[#4B5563] hover:text-black"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="square" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-[#E5E7EB] py-3 text-[14px] text-[#4B5563]">
          No watchpoints yet. Add the condition that would make you sell or buy more.
        </p>
      )}
      <form onSubmit={add} className="mt-3" noValidate>
        <label htmlFor={inputId} className="block text-[13px] font-semibold">
          Add a watchpoint
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={inputId}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            maxLength={160}
            placeholder="e.g. Net debt below 1x EBITDA"
            className="field min-w-0 flex-1"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-err` : undefined}
          />
          <button type="submit" disabled={saving} className="btn btn-primary shrink-0 px-5">
            Add
          </button>
        </div>
        {error ? (
          <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-[13px] font-semibold text-black">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
