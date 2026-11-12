// ─── API client ──────────────────────────────────────────────────────────────
// Always relative paths — Next rewrites proxy /api/* to the FastAPI backend.

import type {
  ChatEvent,
  CompaniesResponse,
  CompanyResponse,
  CostsResponse,
  DemoRunResponse,
  DigestResponse,
  FeedResponse,
  Settings,
  SourceInfo,
  SourceMap,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  feed: (hours: number, includeRead = false, signal?: AbortSignal) =>
    jsonFetch<FeedResponse>(`/api/feed?hours=${hours}&include_read=${includeRead}`, { signal }),

  digestLatest: (signal?: AbortSignal) => jsonFetch<DigestResponse>(`/api/digest/latest`, { signal }),

  company: (ticker: string, signal?: AbortSignal) =>
    jsonFetch<CompanyResponse>(`/api/company/${encodeURIComponent(ticker)}`, { signal }),

  companies: (signal?: AbortSignal) => jsonFetch<CompaniesResponse>(`/api/companies`, { signal }),

  getSettings: (signal?: AbortSignal) => jsonFetch<Settings>(`/api/settings`, { signal }),

  saveSettings: (s: Settings, signal?: AbortSignal) =>
    jsonFetch<Settings>(`/api/settings`, {
      method: "POST",
      body: JSON.stringify(s),
      signal,
    }),

  costs: (signal?: AbortSignal) => jsonFetch<CostsResponse>(`/api/costs`, { signal }),

  runDemo: (signal?: AbortSignal) =>
    jsonFetch<DemoRunResponse>(`/api/demo/run`, { method: "POST", body: "{}", signal }),

  pushSubscribe: (subscription: unknown, signal?: AbortSignal) =>
    fetch(`/api/push/subscribe`, {
      method: "POST",
      body: JSON.stringify(subscription),
      headers: { "Content-Type": "application/json" },
      signal,
    }),

  chatStream: async function* (
    body: { message: string; session_id?: string; ticker?: string; filing_id?: string },
    signal: AbortSignal
  ): AsyncGenerator<ChatEvent> {
    const res = await fetch(`/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try {
        const j = await res.json();
        if (j?.detail) detail = String(j.detail);
      } catch {
        /* ignore */
      }
      yield { type: "error", content: detail };
      yield { type: "final", content: "", done: true };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // SSE frames are separated by a blank line; frames may split across chunks.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
        const ev = parseSseFrame(frame);
        if (ev) yield ev;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const ev = parseSseFrame(buffer);
      if (ev) yield ev;
    }
  },
};

function parseSseFrame(frame: string): ChatEvent | null {
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const obj = JSON.parse(raw) as ChatEvent;
      if (obj && typeof obj.type === "string") return obj;
    } catch {
      // Partial JSON — the double-newline split guarantees complete frames in
      // practice, so a failure here means a malformed event; skip silently.
      continue;
    }
  }
  return null;
}

/** Extract the agent's trailing SOURCES block into structured source metadata. */
export function splitSources(text: string): { text: string; sources: SourceMap } {
  const headings = Array.from(text.matchAll(/^#{0,6}\s*SOURCES\s*:?\s*$/gim));
  const heading = headings.at(-1);
  if (!heading || heading.index == null) return { text, sources: {} };

  const main = text.slice(0, heading.index).trimEnd();
  const block = text.slice(heading.index + heading[0].length);
  const sources: SourceMap = {};
  let current: SourceInfo | null = null;

  for (const rawLine of block.split(/\r?\n/)) {
    const parsed = parseSourceLine(rawLine);
    if (parsed) {
      sources[parsed.id] = parsed;
      current = parsed;
      continue;
    }
    if (!current) continue;

    const url = rawLine.match(/^\s*(?:url|source)\s*[:=-]\s*(https?:\/\/\S+)\s*$/i);
    if (url) {
      current.url = trimUrl(url[1]);
      continue;
    }
    const excerpt = rawLine.match(/^\s*(?:excerpt|quote)\s*[:=-]\s*(.+?)\s*$/i);
    if (excerpt) current.excerpt = unquote(excerpt[1]);
  }

  return { text: main, sources };
}

function parseSourceLine(line: string): SourceInfo | null {
  const match = line.match(/^\s*(?:[-*]\s*)?\[?S?(\d+)\]?\s*(?:(?:[:\-–—])\s*)?(.+?)\s*$/i);
  if (!match) return null;

  const id = match[1];
  const parts = match[2].split(/\s+\|\s+/).map((part) => part.trim()).filter(Boolean);
  let label = parts.shift() ?? `Source ${id}`;
  const source: SourceInfo = { id, title: label };

  const metadata = label.match(/^(.*?)\s+\(([^,()]+),\s*([^)]+)\)\s*$/);
  if (metadata) {
    source.title = metadata[1].trim();
    source.doc_type = metadata[2].trim();
    source.period = metadata[3].trim();
  }

  for (const part of parts) {
    const url = part.match(/^(?:url|source)?\s*[:=]?\s*(https?:\/\/\S+)$/i);
    if (url) {
      source.url = trimUrl(url[1]);
      continue;
    }
    const excerpt = part.match(/^(?:excerpt|quote)\s*[:=]\s*(.+)$/i);
    if (excerpt) {
      source.excerpt = unquote(excerpt[1]);
      continue;
    }
    if (!source.excerpt) source.excerpt = unquote(part);
  }

  if (!source.url) {
    const inlineUrl = label.match(/\bhttps?:\/\/\S+/i);
    if (inlineUrl) {
      source.url = trimUrl(inlineUrl[0]);
      label = label.replace(inlineUrl[0], "").replace(/\s*[-–—|]\s*$/, "").trim();
      source.title = label || source.title;
    }
  }

  return source;
}

function trimUrl(value: string): string {
  return value.replace(/[),.;]+$/, "");
}

function unquote(value: string): string {
  return value.trim().replace(/^["“‘']|["”’']$/g, "");
}
