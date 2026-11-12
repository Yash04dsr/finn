/**
 * Shared API types — derived from live backend payloads
 * (GET /api/feed, /api/digest/latest, /api/companies, /api/company/{ticker},
 *  /api/settings, /api/costs, POST /api/chat SSE frames).
 */

export type Priority = 1 | 2 | 3 | 4;
export type AlertKind = 'announcement' | 'volume_spike' | 'price_move' | 'digest';

export interface FactRow {
  label: string;
  value: number;
  qoq_pct: number | null;
  yoy_pct: number | null;
}

export interface Facts {
  period: string;
  rows: FactRow[];
}

export interface Bio {
  name: string;
  role: string;
  background: string;
}

export interface AnnouncementPayload {
  category: string;
  headline: string;
  summary: string;
  filed_at: string;
  filing_url?: string | null;
  facts?: Facts;
  bio?: Bio;
}

export interface MetricPayload {
  metric: string;
  value: number;
  threshold: number;
  close: number;
  change_pct?: number | null;
  spark?: number[];
}

export interface DigestItem {
  ticker: string;
  category: string;
  headline: string;
  one_liner: string;
  priority: number;
}

export interface DigestPayload {
  title: string;
  window_hours: number;
  items: DigestItem[];
  stats: { total: number; shown: number; hidden: number; held_back?: number };
}

export interface Alert {
  id: number;
  ticker: string;
  kind: AlertKind;
  priority: number;
  why: string;
  created_at: string; // "2026-11-11 12:12:44"
  read: number;
  payload: AnnouncementPayload | MetricPayload | DigestPayload;
}

export interface FeedResponse {
  alerts: Alert[];
}

export interface Digest {
  id: number;
  window_start: string;
  window_end: string;
  rendered: DigestPayload;
}

export interface QuoteRow {
  ticker: string;
  close: number;
  change_pct: number;
}

export interface CompaniesResponse {
  portfolio: QuoteRow[];
  adhoc: QuoteRow[];
}

export interface Quarter {
  ticker: string;
  period: string;
  period_end?: string;
  revenue: number;
  ebitda: number;
  pbt: number;
  pat: number;
  source?: string;
}

export interface FilingRef {
  id: number;
  category: string;
  headline: string;
  filed_at: string;
}

export interface CompanyDetail {
  ticker: string;
  tracked?: boolean;
  available?: boolean;
  snapshot: { ticker: string; date: string; close: number; change_pct: number } | null;
  quarterly: Quarter[];
  filings: FilingRef[];
  chunk_stats: { transcripts: number; annual_reports: number; results: number };
}

export interface Settings {
  volume_multiplier: number;
  price_move_pct: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  categories_watch: string[];
}

export interface Costs {
  total_tokens: number;
  by_tier: { fast: number; reasoning: number };
  by_scope_model: { scope: string; model: string; pt: number; ct: number; calls: number }[];
}

export interface ChatFrame {
  type: 'thinking' | 'model' | 'tool' | 'final' | 'error';
  content?: string;
  tool_name?: string;
  done?: boolean;
  session_id?: string;
}

export interface DemoRunResult {
  ok: boolean;
  mode?: string;
  new_filings?: number;
  digest_stats?: { total: number; shown: number; hidden: number };
  [k: string]: unknown;
}
