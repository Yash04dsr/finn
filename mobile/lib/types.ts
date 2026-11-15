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
  source?: string;
  is_illustrative?: boolean;
}

export interface Bio {
  name: string;
  role: string;
  background: string;
  source?: string;
  source_url?: string;
}

export interface AnnouncementPayload {
  category: string;
  headline: string;
  summary: string;
  filed_at: string;
  filing_url?: string | null;
  facts?: Facts;
  bio?: Bio;
  source?: string;
  is_sample?: boolean;
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
  is_sample?: boolean;
}

export interface Alert {
  id: number;
  ticker: string;
  kind: AlertKind;
  priority: number;
  why: string;
  created_at: string; // "2026-11-11 12:12:44"
  event_at?: string;
  read: number;
  payload: AnnouncementPayload | MetricPayload | DigestPayload;
}

export interface FeedResponse {
  alerts: Alert[];
}

export interface Digest {
  id?: number;
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
  coverage?: Coverage;
  preparing?: Preparing | null;
  watching?: boolean;
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

export interface Citation {
  n: number;
  id: string;
  title: string;
  doc_type: string;
  period: string;
  url: string;
  excerpt: string;
  provider?: string;
}

export interface Receipt {
  lane: 'research' | 'assistant';
  tier: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatFrame {
  type: 'thinking' | 'model' | 'tool' | 'final' | 'error' | 'route';
  content?: string;
  tool_name?: string;
  done?: boolean;
  session_id?: string;
  citations?: Citation[];
  receipt?: Receipt;
  lane?: 'research' | 'assistant';
  ticker?: string | null;
}

export type Verdict = 'no_impact' | 'watch' | 'changes_story';

export interface BriefItem extends Alert {
  touches: string;
  is_new: boolean;
  past_verdict: { verdict: Verdict; created_at: string } | null;
  verdict: Verdict | null;
}

export interface Brief {
  hours: number;
  last_look: string | null;
  new_since_last_look: number;
  material: BriefItem[];
  worth_a_look: BriefItem[];
  background: BriefItem[];
  done: BriefItem[];
  routine_count: number;
  is_sample: boolean;
}

export type LedgerStatus = 'kept' | 'missed' | 'revised' | 'gone_quiet' | 'too_early' | 'not_checkable';

export interface LedgerRow {
  period: string;
  kind: string;
  metric: string;
  band: string;
  horizon: string;
  quote: string;
  speaker: string;
  status: LedgerStatus;
  delivered: number | null;
  delivered_period: string | null;
  note: string;
  promise_source: { source_id: string; doc_title: string; doc_type: string; period: string; url: string } | null;
  delivered_source: { provider: string; period: string } | null;
}

export interface Watchpoint {
  id: number;
  ticker: string;
  text: string;
  kind: string;
  origin: 'drafted' | 'investor';
}

export interface Ledger {
  ticker: string;
  calls: { period: string; url: string }[];
  rows: LedgerRow[];
  counts: Partial<Record<LedgerStatus, number>>;
  summary: string;
  numbers_source: string | null;
  watchpoints: Watchpoint[];
}

export interface Coverage {
  level: 'research_ready' | 'numbers_only' | 'quote_only' | 'unavailable';
  chunks: { transcripts: number; annual_reports: number; results: number };
  verified_quarters: number;
}

export interface Preparing {
  state: 'running' | 'done' | 'failed';
  message: string;
  documents?: { doc_type: string; title: string; period: string; url: string; status: string }[];
}

export interface VerdictLogRow {
  alert_id: number;
  ticker: string;
  verdict: Verdict;
  created_at: string;
  headline: string;
}

export interface DemoRunResult {
  ok: boolean;
  mode?: string;
  new_filings?: number;
  digest_stats?: { total: number; shown: number; hidden: number };
  [k: string]: unknown;
}
