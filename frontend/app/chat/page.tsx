"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChatEvent, Receipt, SourceMap } from "@/lib/types";
import { api, splitSources } from "@/lib/api";
import { fmtTokens } from "@/lib/format";
import Header from "@/components/Header";
import MarkdownLite from "@/components/MarkdownLite";
import CitationChip from "@/components/CitationChip";
import StagedProgress, { type Stage } from "@/components/StagedProgress";
import { ArrowRight } from "@/components/ui";

interface Msg {
  id: string;
  role: "user" | "finn";
  text: string;
  sources?: SourceMap;
  streaming?: boolean;
  tools: string[];
  lane?: "research" | "assistant";
  ticker?: string | null;
  receipt?: Receipt;
  failed?: boolean;
  startedAt: number;
  seconds?: number;
}

const STARTERS = [
  "Did PERSISTENT deliver what management promised?",
  "What did CROMPTON guide for this year?",
  "What changed in my portfolio this week?",
  "Bull and bear case for VEDL from its filings",
];

const NOT_COVERED = /isn't covered in the available primary sources/i;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatInner />
    </Suspense>
  );
}

function ChatInner() {
  const search = useSearchParams();
  const [ticker, setTicker] = useState<string | undefined>(search.get("ticker")?.toUpperCase() || undefined);
  const [filingId, setFilingId] = useState<number | undefined>(search.get("filing") ? Number(search.get("filing")) : undefined);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(search.get("q") ?? "");
  const [streaming, setStreaming] = useState(false);
  const sessionRef = useRef<string>(newId());
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const mic = useDictation((text) => setInput((cur) => (cur ? `${cur} ${text}` : text)));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`;
  }, [input]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || streaming) return;
      setInput("");
      const finnId = newId();
      const now = Date.now();
      setMessages((m) => [
        ...m,
        { id: newId(), role: "user", text, tools: [], startedAt: now },
        { id: finnId, role: "finn", text: "", streaming: true, tools: [], startedAt: now },
      ]);
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (fn: (m: Msg) => Msg) => setMessages((all) => all.map((m) => (m.id === finnId ? fn(m) : m)));

      try {
        for await (const e of api.chatStream(
          { message: text, session_id: sessionRef.current, ticker, filing_id: filingId },
          ctrl.signal,
        ) as AsyncGenerator<ChatEvent>) {
          if (e.type === "route") {
            patch((m) => ({ ...m, lane: e.lane, ticker: e.ticker }));
            if (e.lane === "research" && e.ticker) setTicker(e.ticker);
          } else if (e.type === "tool" && e.tool_name) {
            patch((m) => (m.tools.at(-1) === e.tool_name ? m : { ...m, tools: [...m.tools, e.tool_name!] }));
          } else if (e.type === "final") {
            patch((m) => {
              const finalText = e.content || m.text;
              let sources: SourceMap = {};
              let body = finalText;
              if (e.citations?.length) {
                sources = Object.fromEntries(
                  e.citations.map((c) => [
                    String(c.n),
                    { id: String(c.n), title: c.title, doc_type: c.doc_type, period: c.period, url: c.url || undefined, excerpt: c.excerpt || undefined, provider: c.provider },
                  ]),
                );
              } else {
                ({ text: body, sources } = splitSources(finalText));
              }
              return { ...m, text: body, sources, receipt: e.receipt, streaming: false, seconds: Math.round((Date.now() - m.startedAt) / 1000) };
            });
          } else if (e.type === "error") {
            patch((m) => ({ ...m, failed: true, streaming: false, text: e.content || "FINN could not answer that. Try again." }));
          }
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        patch((m) => ({
          ...m,
          failed: !aborted,
          text: m.text || (aborted ? "Stopped." : "FINN could not be reached. Check the connection and try again."),
        }));
      } finally {
        patch((m) => (m.streaming ? { ...m, streaming: false, failed: m.failed || !m.text, text: m.text || "No answer came back. Try again." } : m));
        setStreaming(false);
        setFilingId(undefined);
        abortRef.current = null;
      }
    },
    [input, streaming, ticker, filingId],
  );

  const stop = () => abortRef.current?.abort();

  const reset = () => {
    stop();
    setMessages([]);
    setTicker(undefined);
    setFilingId(undefined);
    sessionRef.current = newId();
  };

  const starters = ticker
    ? [`Did ${ticker} deliver what management promised?`, `What changed in ${ticker}'s latest results?`, `Bull and bear case for ${ticker} from its filings`]
    : STARTERS;

  return (
    <main className="flex h-[calc(100dvh-var(--tabbar-h)-var(--safe-bottom))] flex-col">
      <Header
        right={
          <div className="flex items-center gap-1">
            {ticker ? (
              <button
                type="button"
                onClick={() => setTicker(undefined)}
                aria-label={`Asking about ${ticker}. Clear the company.`}
                className="num flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-bold"
              >
                <span className="border border-black px-1.5 py-0.5">{ticker}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="square" />
                </svg>
              </button>
            ) : null}
            {messages.length ? (
              <button type="button" onClick={reset} className="min-h-11 px-2 text-[14px] font-semibold">
                New
              </button>
            ) : null}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4" aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <h1 className="display text-[22px] leading-tight">{ticker ? `Ask about ${ticker}` : "Ask about any listed company"}</h1>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#4B5563]">
              Answers come only from call transcripts, annual reports and results filings. Every point links to the page it came from, and FINN says so when the documents do not cover a question.
            </p>
            <ul className="mt-4">
              {starters.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void send(s)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 border-t border-[#E5E7EB] text-left text-[15px] hover:bg-black/[0.02]"
                  >
                    {s}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.text} /> : <Answer key={m.id} msg={m} />))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-black bg-white px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (streaming) stop();
          else void send();
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="ask-input" className="sr-only">
            Question
          </label>
          <textarea
            id="ask-input"
            ref={taRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={ticker ? `Ask about ${ticker}` : "Ask about a company"}
            className="field max-h-[132px] min-h-12 flex-1 resize-none py-3 leading-snug"
          />
          {mic.supported && !streaming ? (
            <button
              type="button"
              onClick={mic.listening ? mic.stop : mic.start}
              aria-pressed={mic.listening}
              aria-label={mic.listening ? "Stop dictation" : "Dictate a question"}
              className={`btn h-12 w-12 shrink-0 px-0 ${mic.listening ? "btn-primary" : "btn-secondary"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]" aria-hidden="true">
                <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3ZM6 11.5a6 6 0 0 0 12 0M12 17.5V21" strokeLinecap="square" />
              </svg>
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!streaming && !input.trim()}
            aria-label={streaming ? "Stop the answer" : "Send the question"}
            className="btn btn-primary h-12 w-12 shrink-0 px-0"
          >
            {streaming ? (
              <span className="h-3.5 w-3.5 bg-white" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-[18px] w-[18px]" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="square" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </main>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap bg-black px-3.5 py-2.5 text-[15px] leading-snug text-white">{text}</p>
    </div>
  );
}

function Answer({ msg }: { msg: Msg }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  if (msg.streaming) return <Working msg={msg} />;
  const setOpen = (id: string, open: boolean) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const notCovered = NOT_COVERED.test(msg.text);
  const sources = msg.sources ?? {};
  const ids = Object.keys(sources).sort((a, b) => Number(a) - Number(b));

  if (notCovered) {
    return (
      <div className="card p-4">
        <h2 className="text-[16px] font-bold">Not covered by primary sources</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed">{msg.text}</p>
        <p className="mt-1.5 text-[13.5px] text-[#4B5563]">FINN does not answer from model memory. Try a specific period, or check what is on file.</p>
        {msg.ticker ? (
          <Link href={`/company/${encodeURIComponent(msg.ticker)}`} className="btn btn-secondary mt-3 w-full justify-between">
            What FINN has on file for {msg.ticker}
            <ArrowRight />
          </Link>
        ) : null}
        <Receipt msg={msg} />
      </div>
    );
  }

  return (
    <article>
      <div className="text-[15.5px] leading-[1.6]">
        <MarkdownLite
          text={msg.text}
          cite={(n, key) =>
            sources[String(n)] ? (
              <a
                key={key}
                href={`#src-${msg.id}-${n}`}
                onClick={() => setOpen(String(n), true)}
                className="cite"
                aria-label={`Source ${n}`}
              >
                {n}
              </a>
            ) : (
              <span key={key} className="cite text-[#6B7280]">
                {n}
              </span>
            )
          }
        />
      </div>
      {ids.length ? (
        <div className="mt-3 border-b border-[#E5E7EB]">
          <h3 className="label mb-1">Sources</h3>
          {ids.map((id) => (
            <CitationChip
              key={id}
              source={sources[id]}
              anchorId={`src-${msg.id}-${id}`}
              open={openIds.has(id)}
              onOpenChange={(o) => setOpen(id, o)}
            />
          ))}
        </div>
      ) : null}
      <Receipt msg={msg} />
    </article>
  );
}

/** Staged progress built from the stream's own route and tool events. */
function Working({ msg }: { msg: Msg }) {
  const fetching = msg.tools.some((t) => /^Fetching/i.test(t));
  const stages: Stage[] = [
    {
      label: msg.lane ? (msg.lane === "research" ? `Answering from ${msg.ticker ?? "the company"}'s filings` : "Looking across your portfolio") : "Reading the question",
      state: msg.lane ? "done" : "active",
    },
    ...msg.tools.map((t, i) => ({ label: t, state: (i === msg.tools.length - 1 ? "active" : "done") as Stage["state"] })),
  ];
  if (msg.lane && !msg.tools.some((t) => /^Writing/i.test(t))) {
    stages.push({ label: "Writing a cited answer", state: msg.tools.length ? "pending" : "active" });
  }
  return (
    <div className="border-y border-[#E5E7EB] py-3">
      <StagedProgress
        stages={stages}
        note={fetching ? `First question about ${msg.ticker ?? "this company"}: FINN is fetching its newest call. This can take up to a minute.` : undefined}
      />
      {msg.text ? <p className="mt-2 text-[14px] text-[#4B5563]">{msg.text}</p> : null}
    </div>
  );
}

function Receipt({ msg }: { msg: Msg }) {
  const r = msg.receipt;
  if (!r) return null;
  const cached = r.cached ?? r.tier === "cache";
  const tokens = r.prompt_tokens + r.completion_tokens;
  const parts = [
    cached ? "Saved answer, documents unchanged" : r.tier === "reasoning" ? "Reasoning model" : "Fast model",
    `${fmtTokens(tokens)} tokens`,
    r.cost_usd != null ? `$${r.cost_usd < 0.01 && r.cost_usd > 0 ? r.cost_usd.toFixed(4) : r.cost_usd.toFixed(2)}` : null,
    cached ? "cached" : "not cached",
    msg.seconds != null ? `${msg.seconds}s` : null,
  ].filter(Boolean);
  return (
    <p className="num mt-2 text-[12px] text-[#6B7280]" title={r.model}>
      {parts.join(" · ")}
    </p>
  );
}

/* ─── Optional dictation, only where the browser supports it ─────────────── */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<RecognitionLike | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    // Home-screen web apps on iOS expose the API but do not deliver results reliably.
    const standaloneIOS = (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!Ctor || standaloneIOS) return;
    const r = new Ctor();
    r.lang = "en-IN";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) cb.current(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setSupported(true);
    return () => r.stop();
  }, []);

  return {
    supported,
    listening,
    start: () => {
      try {
        rec.current?.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    stop: () => rec.current?.stop(),
  };
}
