"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ChatEvent, SourceMap } from "@/lib/types";
import { api, splitSources } from "@/lib/api";
import Header from "@/components/Header";
import MarkdownLite from "@/components/MarkdownLite";
import CitationChip from "@/components/CitationChip";
import ToolActivity from "@/components/ToolActivity";
import { ListSkeleton } from "@/components/Skeleton";

interface Msg {
  id: string;
  role: "user" | "finn";
  text: string;
  sources?: SourceMap;
  streaming?: boolean;
  tools?: string[];
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatSkeletonShell />}>
      <ChatInner />
    </Suspense>
  );
}

function ChatSkeletonShell() {
  return (
    <main className="flex h-dvh flex-col pb-[92px]">
      <Header />
      <div className="flex-1 px-4 pt-4">
        <ListSkeleton rows={2} />
      </div>
    </main>
  );
}

function ChatInner() {
  const search = useSearchParams();
  const ticker = search.get("ticker") || undefined;
  const filingId = search.get("filing") || undefined;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const sessionRef = useRef<string>(search.get("session") || newId());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Prefill from a filing deep-link, but never auto-send. Uses the seed saved
  // by the detail sheet when present, else the default contextual question.
  useEffect(() => {
    if (!ticker) return;
    let seed: string | null = null;
    try {
      seed = sessionStorage.getItem(`finn-seed-${filingId || ticker}`);
      if (seed) sessionStorage.removeItem(`finn-seed-${filingId || ticker}`);
    } catch {
      /* ignore */
    }
    const prefill = seed || (filingId ? `What does this filing mean for ${ticker}?` : null);
    if (!prefill) return;
    setInput((cur) => cur || prefill);
    try {
      sessionStorage.setItem("finn-chat-draft", prefill);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoscroll while streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || streaming) return;
      setInput("");
      try {
        sessionStorage.removeItem("finn-chat-draft");
      } catch {
        /* ignore */
      }

      const userMsg: Msg = { id: newId(), role: "user", text };
      const finnMsg: Msg = { id: newId(), role: "finn", text: "", streaming: true, tools: [] };
      setMessages((m) => [...m, userMsg, finnMsg]);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const patch = (fn: (m: Msg) => Msg) =>
        setMessages((all) => all.map((m) => (m.id === finnMsg.id ? fn(m) : m)));

      try {
        for await (const ev of api.chatStream(
          { message: text, session_id: sessionRef.current, ticker, filing_id: filingId },
          ctrl.signal
        )) {
          const e = ev as ChatEvent;
          if (e.type === "tool" && e.tool_name) {
            patch((m) => ({ ...m, tools: [...(m.tools || []), e.tool_name!] }));
          } else if (e.type === "model" && e.content) {
            patch((m) => ({ ...m, text: m.text + e.content }));
          } else if (e.type === "final") {
            const finalText = e.content || "";
            patch((m) => {
              const merged = finalText.length >= m.text.length ? finalText : m.text;
              const { text: body, sources } = splitSources(merged);
              return { ...m, text: body, sources, streaming: false };
            });
          } else if (e.type === "error") {
            patch((m) => ({
              ...m,
              text: m.text || `Sorry — FINN hit an error${e.content ? `: ${e.content}` : ""}.`,
              streaming: false,
            }));
          }
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        patch((m) => ({
          ...m,
          text: m.text || (aborted ? "Stopped." : "Connection to FINN failed. Try again."),
          streaming: false,
        }));
      } finally {
        patch((m) => ({ ...m, streaming: false }));
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, ticker, filingId]
  );

  const stop = () => abortRef.current?.abort();

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; // cap ≈ 5 rows
  };

  return (
    <main className="flex h-dvh flex-col">
      <Header />

      {/* Suggested prompts */}
      {messages.length === 0 && (
        <div className="px-4 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4B5563]">
            {ticker ? `Researching ${ticker}` : "Try asking"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions(ticker).map((s) => (
              <button
                key={s.label}
                onClick={() => void send(s.prompt)}
                className="press border border-[#000000]/[0.12] bg-[#FFFFFF] px-3 py-1.5 text-[12px] font-medium text-[#000000]"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 pb-3 pt-4">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
      </div>

      {/* Composer */}
      <div
        className="sticky bottom-0 border-t border-[#000000]/[0.12] bg-[#FFFFFF]/94 backdrop-blur-md"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
      >
        <div className="mx-auto flex w-full max-w-[480px] items-end gap-2 px-3 pt-2.5">
          <textarea
            ref={taRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            placeholder={ticker ? `Ask FINN about ${ticker}…` : "Ask FINN anything…"}
            className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-none border border-[#000000]/[0.12] bg-[#FFFFFF] px-3.5 py-2.5 text-[14px] leading-snug outline-none placeholder:text-[#808080] focus:border-black"
          />
          {streaming ? (
            <button
              onClick={stop}
              aria-label="Stop generating"
              className="press flex h-[40px] w-[40px] items-center justify-center rounded-none border border-[#B4442C]/40 bg-[#B4442C]/10"
            >
              <span className="h-3 w-3 rounded-none bg-[#B4442C]" />
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              aria-label="Send message"
              className="press flex h-[40px] w-[40px] items-center justify-center rounded-none bg-black disabled:opacity-35"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} className="h-4.5 w-4.5" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function suggestions(ticker?: string): { label: string; prompt: string }[] {
  const t = ticker || "your stocks";
  return [
    { label: "Narrative vs numbers", prompt: `Narrative vs numbers for ${t}` },
    { label: "Bull vs bear case", prompt: `Give me the bull vs bear case for ${t}` },
    { label: "Guidance", prompt: `What did management guide for ${t}?` },
    { label: "Cash quality", prompt: `Cash quality check on ${t}` },
  ];
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-none  bg-black px-3.5 py-2.5 text-[13.5px] font-medium leading-relaxed text-white">
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-none  border border-[#000000]/[0.12] bg-[#FFFFFF] px-3.5 py-3">
        <MarkdownLite text={msg.text} />
        <ToolActivity tools={msg.tools || []} active={!!msg.streaming} />
        {msg.streaming && !msg.text && !(msg.tools || []).length && (
          <p className="flex items-center gap-1.5 text-[11.5px] italic text-[#4B5563]">
            <span className="pulse-dot" aria-hidden="true" /> thinking
          </p>
        )}
        {msg.sources && Object.keys(msg.sources).length > 0 && <SourceRow sources={msg.sources} body={msg.text} />}
      </div>
    </div>
  );
}

/** Renders [S1]/[S2] markers in the body as tappable chips + the source list. */
function SourceRow({ sources, body }: { sources: SourceMap; body: string }) {
  const ids = useMemo(() => {
    const found = new Set<string>();
    for (const m of body.matchAll(/\[(S?\d+)\]/g)) {
      const id = m[1].replace(/^S/, "");
      if (sources[id]) found.add(id);
    }
    return Array.from(found).sort((a, b) => Number(a) - Number(b));
  }, [body, sources]);

  const withMarkers = useMemo(() => body.split(/(\[(?:S?\d+)\])/g), [body]);

  return (
    <div className="mt-2 border-t border-[#000000]/[0.08] pt-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4B5563]">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <CitationChip key={id} id={id} title={sources[id]} />
        ))}
      </div>
      {/* body kept for marker matching; actual marker glyphs stay inline in text */}
      <span className="hidden">{withMarkers.length}</span>
    </div>
  );
}
