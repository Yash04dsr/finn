"use client";

import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./api";
import type { Settings } from "./types";

export interface UseApiState<T> {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  reload: () => void;
}

/** Tiny GET hook: loading/error states, 404→notFound, abort on unmount/reload. */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[]): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetcherRef
      .current(ctrl.signal)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : "Something went wrong");
        setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, setData, loading, error, notFound, reload: () => setNonce((n) => n + 1) };
}

export const fetchers = {
  brief: (hours: number) => (signal: AbortSignal) => api.brief(hours, signal),
  alert: (id: number) => (signal: AbortSignal) => api.alert(id, signal),
  verdicts: (signal: AbortSignal) => api.verdicts(signal),
  company: (ticker: string) => (signal: AbortSignal) => api.company(ticker, signal),
  ledger: (ticker: string) => (signal: AbortSignal) => api.ledger(ticker, signal),
  companies: (signal: AbortSignal) => api.companies(signal),
  costs: (signal: AbortSignal) => api.costs(signal),
  settings: (signal: AbortSignal) => api.getSettings(signal),
};

/** Load settings once; fall back to sane defaults if backend is down. */
export const DEFAULT_SETTINGS: Settings = {
  volume_multiplier: 2.5,
  price_move_pct: 4,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  categories_watch: ["results", "M&A", "fund_raise", "management_change", "litigation", "earnings_call"],
};
