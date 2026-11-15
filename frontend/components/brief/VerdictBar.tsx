"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Verdict } from "@/lib/types";
import { VERDICT_LABEL } from "./model";

const ORDER: Verdict[] = ["no_impact", "watch", "changes_story"];

/**
 * Three decisions, each a full-height target. "Changes the story" asks for an
 * optional one-line reason before it saves, so the decision record says why.
 */
export default function VerdictBar({
  onVerdict,
  busy,
  current,
}: {
  onVerdict: (v: Verdict, note?: string) => void;
  busy?: boolean;
  current?: Verdict | null;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const storyRef = useRef<HTMLButtonElement | null>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    if (asking) inputRef.current?.focus();
    else if (wasAsking.current) storyRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  const cancel = () => {
    setNote("");
    setAsking(false);
  };

  if (asking) {
    return (
      <form
        className="mt-2.5 border border-black p-3"
        onSubmit={(e) => {
          e.preventDefault();
          wasAsking.current = false;
          setAsking(false);
          onVerdict("changes_story", note.trim());
          setNote("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      >
        <label htmlFor={inputId} className="block text-[14px] font-semibold">
          What changed? <span className="font-normal text-[#4B5563]">One line, optional.</span>
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          enterKeyHint="done"
          autoComplete="off"
          placeholder="e.g. Margin miss looks structural, not temporary"
          className="field mt-2"
        />
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={cancel} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn btn-primary flex-[2]">
            Save verdict
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2.5 grid grid-cols-3 gap-2" role="group" aria-label="Your verdict">
      {ORDER.map((v) => {
        const primary = v === "changes_story";
        const selected = current === v;
        return (
          <button
            key={v}
            ref={v === "changes_story" ? storyRef : undefined}
            type="button"
            disabled={busy}
            aria-pressed={current ? selected : undefined}
            onClick={() => (v === "changes_story" ? setAsking(true) : onVerdict(v))}
            className={`btn press min-h-[52px] px-2 text-[13.5px] leading-tight ${
              (current ? selected : primary) ? "btn-primary" : "btn-secondary"
            }`}
          >
            {VERDICT_LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}
