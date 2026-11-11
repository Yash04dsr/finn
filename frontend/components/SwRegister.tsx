"use client";

import { useEffect } from "react";

/** Registers the minimal service worker (PWA install + offline shell). */
export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
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
