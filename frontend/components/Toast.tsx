"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastMessage {
  text: string;
  action?: { label: string; run: () => void };
}

/** Non-blocking confirmation that clears itself after five seconds. */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: ToastMessage) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const node = toast ? (
    <div className="toast" role="status" aria-live="polite">
      <p className="leading-snug">{toast.text}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            const run = toast.action?.run;
            setToast(null);
            run?.();
          }}
          className="-mb-2 mt-0.5 min-h-11 text-left text-[14px] font-bold underline underline-offset-4"
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  ) : null;

  return { show, node };
}
