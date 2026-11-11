"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CostsResponse, Settings } from "@/lib/types";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { compactNum } from "@/lib/format";
import { CATEGORIES } from "@/lib/types";
import Header from "@/components/Header";
import { ListSkeleton, ErrorRow } from "@/components/Skeleton";

export default function SettingsPage() {
  return (
    <main className="pb-[92px]">
      <Header />
      <div className="px-4 pt-3">
        <AlertSettings />
        <PushCard />
        <CostDashboard />
        <OpsCard />
        <p className="mt-6 text-center text-[11px] leading-relaxed text-[#5A6373]">
          FINN · investment intelligence agent · ENAM assignment build
        </p>
      </div>
      <ToastHost />
    </main>
  );
}

/* ─── Alerts ─────────────────────────────────────────────────────────────── */

function AlertSettings() {
  const { data, loading, error, reload } = useSettings();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (loading && !draft) {
    return (
      <div className="card mb-4 p-4">
        <ListSkeleton rows={2} />
      </div>
    );
  }
  if (error && !draft) {
    return (
      <div className="mb-4">
        <ErrorRow message={`Couldn't load settings — ${error}`} onRetry={reload} />
      </div>
    );
  }
  if (!draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSettings(draft);
      reload();
    } catch {
      alert("Could not save settings — is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card mb-4 p-4" aria-label="Alert settings">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-[#E8ECF3]">Alerts</h2>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="press rounded-full bg-[#10B981] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#04120C] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      {/* Volume multiplier */}
      <label className="block">
        <span className="num text-[12.5px] text-[#C6CDD9]">
          Volume &gt; <b className="text-[#10B981]">{draft.volume_multiplier.toFixed(1)}×</b> 20-day avg
        </span>
        <input
          type="range"
          min={1.5}
          max={5}
          step={0.1}
          value={draft.volume_multiplier}
          onChange={(e) => setDraft({ ...draft, volume_multiplier: Number(e.target.value) })}
          className="mt-2.5"
        />
        <span className="mt-1 flex justify-between text-[10px] text-[#5A6373]">
          <span>1.5×</span>
          <span>5×</span>
        </span>
      </label>

      {/* Price move % */}
      <label className="mt-4 block">
        <span className="num text-[12.5px] text-[#C6CDD9]">
          |move| &gt; <b className="text-[#10B981]">{draft.price_move_pct.toFixed(1)}%</b> in a day
        </span>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={draft.price_move_pct}
          onChange={(e) => setDraft({ ...draft, price_move_pct: Number(e.target.value) })}
          className="mt-2.5"
        />
        <span className="mt-1 flex justify-between text-[10px] text-[#5A6373]">
          <span>1%</span>
          <span>10%</span>
        </span>
      </label>

      {/* Category watchlist */}
      <p className="mb-2 mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8B93A3]">
        Category watchlist · {draft.categories_watch.length}/{CATEGORIES.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => {
          const on = draft.categories_watch.includes(cat);
          return (
            <button
              key={cat}
              onClick={() =>
                setDraft({
                  ...draft,
                  categories_watch: on
                    ? draft.categories_watch.filter((x) => x !== cat)
                    : [...draft.categories_watch, cat],
                })
              }
              aria-pressed={on}
              className="press rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors"
              style={
                on
                  ? { borderColor: "rgba(16,185,129,0.45)", background: "rgba(16,185,129,0.13)", color: "#34D399" }
                  : { borderColor: "rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", color: "#8B93A3" }
              }
            >
              {cat.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>

      {/* Quiet hours */}
      <p className="mb-2 mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8B93A3]">Quiet hours</p>
      <div className="flex items-center gap-2.5">
        <TimeInput value={draft.quiet_hours_start} onChange={(v) => setDraft({ ...draft, quiet_hours_start: v })} />
        <span className="text-[12px] text-[#8B93A3]">to</span>
        <TimeInput value={draft.quiet_hours_end} onChange={(v) => setDraft({ ...draft, quiet_hours_end: v })} />
      </div>
    </section>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="num rounded-lg border border-white/[0.09] bg-[#0D131D] px-3 py-2 text-[13px] outline-none focus:border-[#10B981]/40"
    />
  );
}

/* ─── Push notifications ─────────────────────────────────────────────────── */

function PushCard() {
  const [state, setState] = useState<"idle" | "working" | "on" | "denied" | "unsupported">("idle");

  const enable = async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }
    setState("working");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, userVisibleKey: undefined } as PushSubscriptionOptionsInit).catch(async () => {
          // Some browsers require an applicationServerKey; retry bare.
          return reg.pushManager.subscribe({ userVisibleOnly: true } as PushSubscriptionOptionsInit);
        });
      }
      await api.pushSubscribe(sub.toJSON());
      setState("on");
    } catch {
      setState("idle"); // non-blocking: push is best-effort
    }
  };

  const label =
    state === "working" ? "Enabling…" :
    state === "on" ? "Push notifications enabled" :
    state === "denied" ? "Permission denied — enable in browser settings" :
    state === "unsupported" ? "Push not supported on this browser" :
    "Enable push notifications";

  return (
    <section className="card mb-4 p-4" aria-label="Push notifications">
      <h2 className="text-[13px] font-semibold text-[#E8ECF3]">Push notifications</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[#8B93A3]">
        Priority-1 alerts ping your phone the moment they fire. Quiet hours still apply.
      </p>
      <button
        onClick={enable}
        disabled={state === "working" || state === "on"}
        className="press mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 py-2.5 text-[13px] font-semibold text-[#34D399] disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6ZM10 19a2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
    </section>
  );
}

/* ─── Cost dashboard ─────────────────────────────────────────────────────── */

function CostDashboard() {
  const { data, error } = useApiSafe<CostsResponse>(useCallback((s: AbortSignal) => api.costs(s), []));

  return (
    <section className="card mb-4 p-4" aria-label="Cost dashboard">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-[#E8ECF3]">Cost dashboard</h2>
        {data && (
          <span className="num text-[12px] font-semibold text-[#E8ECF3]">{compactNum(data.total_tokens)} tokens</span>
        )}
      </div>

      {error && <p className="mt-2 text-[11.5px] text-[#8B93A3]">Cost data unavailable — backend offline.</p>}

      {data && (
        <>
          {/* two-segment tier bar */}
          <div className="mt-3">
            <TierBar costs={data} />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07]">
            <table className="num w-full text-[11.5px]">
              <thead>
                <tr className="bg-white/[0.03] text-left text-[10px] uppercase tracking-wider text-[#8B93A3]">
                  <th className="px-2.5 py-2 font-semibold">Scope</th>
                  <th className="px-2 py-2 font-semibold">Model</th>
                  <th className="px-2 py-2 text-right font-semibold">In</th>
                  <th className="px-2 py-2 text-right font-semibold">Out</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Calls</th>
                </tr>
              </thead>
              <tbody>
                {data.by_scope_model.map((r, i) => (
                  <tr key={`${r.scope}-${r.model}-${i}`} className="border-t border-white/[0.05]">
                    <td className="px-2.5 py-2 font-medium text-[#C6CDD9]">{r.scope}</td>
                    <td className="px-2 py-2 text-[#8B93A3]">{shortModel(r.model)}</td>
                    <td className="px-2 py-2 text-right text-[#C6CDD9]">{compactNum(r.pt)}</td>
                    <td className="px-2 py-2 text-right text-[#C6CDD9]">{compactNum(r.ct)}</td>
                    <td className="px-2.5 py-2 text-right text-[#C6CDD9]">{r.calls}</td>
                  </tr>
                ))}
                {data.by_scope_model.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2.5 py-3 text-center text-[#8B93A3]">
                      No model calls yet — run the demo pipeline.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-[#8B93A3]">
            Smart routing: fast tier for bulk work, reasoning tier only for analysis.
          </p>
        </>
      )}
    </section>
  );
}

function TierBar({ costs }: { costs: CostsResponse }) {
  const fast = Math.max(0, costs.by_tier?.fast ?? 0);
  const reasoning = Math.max(0, costs.by_tier?.reasoning ?? 0);
  const total = fast + reasoning;
  const fastPct = total > 0 ? (fast / total) * 100 : 50;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div style={{ width: `${fastPct}%`, background: "#10B981" }} />
        <div style={{ width: `${100 - fastPct}%`, background: "#F59E0B" }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-[#8B93A3]">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" /> fast {compactNum(fast)}
        </span>
        <span className="flex items-center gap-1">
          reasoning {compactNum(reasoning)} <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
        </span>
      </div>
    </div>
  );
}

function shortModel(m: string): string {
  return m.length > 18 ? `${m.slice(0, 17)}…` : m;
}

/* ─── Ops: demo pipeline ─────────────────────────────────────────────────── */

function OpsCard() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string>("");

  const run = async () => {
    setState("running");
    try {
      const r = await api.runDemo();
      setResult(`${r.mode === "snapshot" ? "Snapshot" : "Live"} run · ${r.digested ?? 0} filings digested · ${r.alerts ?? 0} alerts`);
      setState("done");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Pipeline failed");
      setState("error");
    }
  };

  return (
    <section className="card p-4" aria-label="Operations">
      <h2 className="text-[13px] font-semibold text-[#E8ECF3]">Operations</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[#8B93A3]">
        Trigger one end-of-day run: ingest → rank → digest. Useful for the live demo before walking through the feed.
      </p>
      <button
        onClick={run}
        disabled={state === "running"}
        className="press mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] py-2.5 text-[13px] font-semibold text-[#E8ECF3] disabled:opacity-60"
      >
        {state === "running" ? (
          <>
            <span className="pulse-dot" aria-hidden="true" /> Running pipeline…
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
              <path d="M5 4.5v15l13-7.5-13-7.5Z" strokeLinejoin="round" />
            </svg>
            Run demo pipeline
          </>
        )}
      </button>
      {state === "done" && <p className="mt-2 text-[11.5px] font-medium text-[#34D399]">{result}</p>}
      {state === "error" && <p className="mt-2 text-[11.5px] font-medium text-[#FB7185]">{result}</p>}
    </section>
  );
}

/* ─── Toast ──────────────────────────────────────────────────────────────── */

function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; error?: boolean }>).detail;
      setMsg(detail.message);
      setErr(!!detail.error);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), 3200);
    };
    window.addEventListener("finn-toast", handler);
    return () => {
      window.removeEventListener("finn-toast", handler);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!msg) return null;
  return (
    <div className={`toast ${err ? "toast-err" : ""}`} role="status">
      {msg}
    </div>
  );
}

/* ─── local hook shims ───────────────────────────────────────────────────── */

function useSettings() {
  return useApi((signal: AbortSignal) => api.getSettings(signal), []);
}

function useApiSafe<T>(fetcher: (signal: AbortSignal) => Promise<T>): ReturnType<typeof useApi<T>> {
  return useApi<T>(fetcher, []);
}
