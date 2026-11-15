/**
 * Typed fetch client for the FINN backend, plus SSE streaming for /api/chat
 * using `fetch` from 'expo/fetch' (ReadableStream-capable on native).
 */
import { fetch as expoFetch } from 'expo/fetch';
import type {
  Alert,
  Brief,
  ChatFrame,
  CompaniesResponse,
  CompanyDetail,
  Costs,
  Coverage,
  Digest,
  Ledger,
  Preparing,
  Settings,
  Verdict,
  VerdictLogRow,
  Watchpoint,
} from './types';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let baseUrl: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export function getBaseUrl(): string {
  return baseUrl;
}

export function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/+$/, '');
}

function withTimeout(ms: number): AbortSignal {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  // Release the timer if the signal is aborted early by the caller.
  (ctrl.signal as unknown as { _finnTimer?: ReturnType<typeof setTimeout> })._finnTimer = t;
  return ctrl.signal;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? withTimeout(timeoutMs),
    });
  } catch (e) {
    throw new ApiError(
      `Cannot reach backend at ${baseUrl}. ${e instanceof Error ? e.message : ''}`.trim(),
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 180);
    } catch {
      // ignore body read errors
    }
    throw new ApiError(`HTTP ${res.status} ${path}${detail ? ` — ${detail}` : ''}`, res.status);
  }
  return (await res.json()) as T;
}

// --- Endpoints -----------------------------------------------------------------

export const api = {
  feed: (hours: number, includeRead = false) =>
    request<{ alerts: Alert[] }>(`/api/feed?hours=${hours}&include_read=${includeRead}`, {
      method: 'GET',
    }),

  digestLatest: (hours = 24) => request<Digest>(`/api/digest/latest?hours=${hours}`),

  companies: () => request<CompaniesResponse>('/api/companies'),

  company: (ticker: string) =>
    request<CompanyDetail>(
      `/api/company/${encodeURIComponent(ticker)}`,
      { method: 'GET' },
      20000,
    ),

  getSettings: () => request<Settings>('/api/settings'),

  saveSettings: (s: Settings) =>
    request<Settings>('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    }),

  costs: () => request<Costs>('/api/costs'),

  demoRun: () =>
    request<{ ok: boolean; mode?: string; new_filings?: number } & Record<string, unknown>>(
      '/api/demo/run',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      60000,
    ),

  pushSubscribe: (token: string) =>
    request<{ ok: boolean }>('/api/push/subscribe-expo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),

  brief: (hours: number) => request<Brief>(`/api/brief?hours=${hours}`),

  briefSeen: () => post<{ last_look: string }>('/api/brief/seen', {}),

  verdict: (alertId: number, verdict: Verdict, muteCategory = false) =>
    post<{ alert_id: number; verdict: Verdict; muted_category: string | null }>(
      `/api/alerts/${alertId}/verdict`,
      { verdict, mute_category: muteCategory },
    ),

  verdicts: () => request<{ verdicts: VerdictLogRow[] }>('/api/verdicts'),

  alert: (alertId: number) => request<Alert>(`/api/alerts/${alertId}`),

  ledger: (ticker: string) =>
    request<Ledger>(`/api/company/${encodeURIComponent(ticker)}/ledger`, undefined, 90000),

  coverage: (ticker: string) =>
    request<{ coverage: Coverage; preparing: Preparing | null }>(
      `/api/company/${encodeURIComponent(ticker)}/coverage`,
    ),

  addWatchpoint: (ticker: string, text: string) =>
    post<Watchpoint>(`/api/company/${encodeURIComponent(ticker)}/watchpoints`, { text }),

  deleteWatchpoint: (ticker: string, id: number) =>
    request<{ ok: boolean }>(`/api/company/${encodeURIComponent(ticker)}/watchpoints/${id}`, {
      method: 'DELETE',
    }),

  watch: (ticker: string) => post<{ watchlist: string[] }>('/api/watchlist', { ticker }),

  unwatch: (ticker: string) =>
    request<{ watchlist: string[] }>(`/api/watchlist/${encodeURIComponent(ticker)}`, {
      method: 'DELETE',
    }),
};

function post<T>(path: string, body: unknown, timeoutMs = 15000): Promise<T> {
  return request<T>(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    timeoutMs,
  );
}

// --- Chat SSE ------------------------------------------------------------------

export interface ChatStreamHandlers {
  onFrame: (frame: ChatFrame) => void;
  signal?: AbortSignal;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  ticker?: string;
  filing_id?: number;
}

export type StreamResult = 'streamed' | 'fallback';

/**
 * Stream chat frames over SSE. Uses expo/fetch with ReadableStream body.
 * Returns 'streamed' if SSE worked, 'fallback' if the caller should redo
 * the request as a plain POST (streaming unavailable).
 */
export async function streamChat(
  req: ChatRequest,
  handlers: ChatStreamHandlers,
): Promise<StreamResult> {
  try {
    const res = await expoFetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(req),
      signal: handlers.signal,
    });
    if (!res.ok || !res.body) {
      throw new ApiError(`HTTP ${res.status} /api/chat`, res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let gotFinal = false;
    // Read loop — parses `data: {json}\n\n` frames.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const frame = parseSseFrame(raw);
        if (!frame) continue;
        if (frame.type === 'final') gotFinal = true;
        handlers.onFrame(frame);
      }
    }
    // Flush trailing frame without a trailing blank line, if any.
    const tail = parseSseFrame(buffer);
    if (tail) {
      if (tail.type === 'final') gotFinal = true;
      handlers.onFrame(tail);
    }
    return gotFinal ? 'streamed' : 'fallback';
  } catch {
    if (handlers.signal?.aborted) return 'streamed'; // user pressed stop — not an error
    // Graceful degradation: caller retries as a normal POST.
    return 'fallback';
  }
}

function parseSseFrame(raw: string): ChatFrame | null {
  const line = raw
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trimStart())
    .join('\n');
  if (!line) return null;
  try {
    return JSON.parse(line) as ChatFrame;
  } catch {
    return null;
  }
}

/** Plain (non-streaming) chat request used as fallback. */
export async function chatOnce(req: ChatRequest, signal?: AbortSignal): Promise<ChatFrame[]> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: signal ?? withTimeout(120000),
    });
  } catch (e) {
    throw new ApiError(
      `Cannot reach backend at ${baseUrl}. ${e instanceof Error ? e.message : ''}`.trim(),
    );
  }
  if (!res.ok) throw new ApiError(`HTTP ${res.status} /api/chat`, res.status);
  const text = await res.text();
  // FastAPI StreamingResponse awaited via fetch still yields the full SSE text.
  const frames: ChatFrame[] = [];
  for (const chunk of text.split('\n\n')) {
    const f = parseSseFrame(chunk);
    if (f) frames.push(f);
  }
  if (frames.length === 0 && text.trim()) {
    // Server replied plain JSON instead of SSE.
    try {
      const j = JSON.parse(text) as { content?: string };
      frames.push({ type: 'final', content: j.content ?? text, done: true });
    } catch {
      frames.push({ type: 'final', content: text, done: true });
    }
  }
  return frames;
}
