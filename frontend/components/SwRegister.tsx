"use client";

import { useEffect } from "react";

/** Registers the minimal service worker (PWA install + offline shell) and wakes the backend. */
export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Load the chat agents now, so the first question does not wait for a cold backend.
    fetch("/api/healthz?warm=1", { cache: "no-store" }).catch(() => {
      /* best-effort */
    });
    if (!("serviceWorker" in navigator)) return;
    const t = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-blocking — offline support is best-effort */
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
