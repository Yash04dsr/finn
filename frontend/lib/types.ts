// ─── FINN shared API + UI types ──────────────────────────────────────────────
// Mirrors the FastAPI backend contract exactly.

export type Priority = 1 | 2 | 3 | 4;

export type AlertKind =
  | "announcement"
  | "volume_spike"
  | "price_move"
  | "digest";

export interface AnnouncementPayload {
  category?: string;
  headline: string;
  summary?: string;
  filed_at?: string;
  filing_url?: string;
  facts?: FactsTable | null;
  bio?: BioInfo | null;
}

export interface VolumeOrPricePayload {
  metric?: string; // e.g. "volume_multiple" | "move_pct"
  value?: number;
  threshold?: number;
  close?: number;
  change_pct?: number;
  closes?: number[]; // optional recent closes for sparkline
}

export interface DigestItem {
  ticker: string;
  category: string;
  headline: string;
  one_liner?: string;
  priority: Priority;
}

export interface DigestPayload {
  title: string;
  window_hours: number;
  items: DigestItem[];
  stats: { total: number; shown: number; hidden: number };
}

export interface Alert {
  id: string;
  ticker: string;
  kind: AlertKind;
  priority: Priority;
  why: string;
  created_at: string;
  read?: boolean;
  payload: AnnouncementPayload | VolumeOrPricePayload | DigestPayload;
}

export interface FeedResponse {
  alerts: Alert[];
}

export interface DigestResponse {
  id: string;
  window_start: string;
  window_end: string;
  rendered: DigestPayload;
}

export interface FactRow {
  label: string;
  value: string;
  qoq?: number | null;
  yoy?: number | null;
}

export interface FactsTable {
  rows: FactRow[];
}

export interface BioInfo {
  name: string;
  most_recent_role?: string;
  background?: string;
}

export interface QuarterlyRow {
  period: string;
  revenue: number | null;
  ebitda: number | null;
  pbt: number | null;
  pat: number | null;
}

export interface FilingSummary {
  id: string;
  category: string;
  headline: string;
  filed_at: string;
  summary?: string | null;
}

export interface ChunkStats {
  transcripts?: number;
  annual_reports?: number;
  results?: number;
}

export interface CompanyResponse {
  ticker: string;
  snapshot?: { close: number; change_pct: number; date: string } | null;
  quarterly: QuarterlyRow[];
  filings: FilingSummary[];
  chunk_stats: ChunkStats;
}

export interface TickerQuote {
  ticker: string;
  close: number | null;
  change_pct: number | null;
}

export interface CompaniesResponse {
  portfolio: TickerQuote[];
  adhoc: TickerQuote[];
}

export interface Settings {
  volume_multiplier: number;
  price_move_pct: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  categories_watch: string[];
}

export interface CostsResponse {
  total_tokens: number;
  by_tier: { fast: number; reasoning: number };
  by_scope_model: {
    scope: string;
    model: string;
    pt: number;
    ct: number;
    calls: number;
  }[];
}

export interface DemoRunResponse {
  ok: boolean;
  mode?: "live" | "snapshot";
  digested?: number;
  alerts?: number;
}

// ─── Chat SSE ────────────────────────────────────────────────────────────────

export type ChatEventType = "model" | "tool" | "final" | "error";

export interface ChatEvent {
  type: ChatEventType;
  content?: string;
  tool_name?: string;
  done?: boolean;
}

// Parsed SOURCES block: S1 → title
export type SourceMap = Record<string, string>;

export const CATEGORIES = [
  "results",
  "M&A",
  "fund_raise",
  "management_change",
  "litigation",
  "insider_trading",
  "earnings_call",
  "investor_meetings",
  "credit_rating",
  "dividend",
  "bonus_split",
  "capex",
  "press_release",
  "postal_ballot",
  "agm_egm",
  "pledging",
  "unclassified",
] as const;
