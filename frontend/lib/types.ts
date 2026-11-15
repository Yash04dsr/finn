// ─── FINN shared API + UI types ──────────────────────────────────────────────
// Mirrors the FastAPI backend contract.

export type Priority = 1 | 2 | 3 | 4;

export type AlertKind = "announcement" | "volume_spike" | "price_move" | "digest";

export interface AnnouncementPayload {
  category?: string;
  headline: string;
  summary?: string;
  filed_at?: string;
  filing_url?: string | null;
  facts?: FactsTable | null;
  bio?: BioInfo | null;
  source?: string;
  is_sample?: boolean;
}

export interface VolumeOrPricePayload {
  metric?: string;
  value?: number;
  threshold?: number;
  close?: number;
  change_pct?: number | null;
  avg_volume?: number;
  spark?: number[];
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
  stats: { total: number; shown: number; hidden: number; held_back?: number };
}

/** Management's guided band checked against the delivered number, in code. */
export type PromiseCheck = {
  metric: string;
  guided_band: string;
  guided_lo: number | null;
  guided_hi: number | null;
  guided_period: string;
  guided_source: { source_id?: string; title?: string; url?: string; excerpt?: string } | null;
  delivered: number | null;
  delivered_period: string | null;
  delivered_source: { title?: string; url?: string } | null;
  status: "kept" | "missed" | "no_guidance" | "not_reported";
  note: string;
  is_illustrative: boolean;
  /** The filing is a sample-day stand-in; the numbers and guidance may still be real. */
  is_sample_filing?: boolean;
  numbers_source?: string | null;
};

export interface Alert {
  id: number;
  ticker: string;
  kind: AlertKind;
  priority: Priority;
  why: string;
  created_at: string;
  event_at?: string;
  read?: number | boolean;
  payload: AnnouncementPayload | VolumeOrPricePayload | DigestPayload;
  touches?: string;
  promise_check?: PromiseCheck | null;
}

export interface FactRow {
  label: string;
  value: number | null;
  qoq_pct?: number | null;
  yoy_pct?: number | null;
}

export interface FactsTable {
  period?: string;
  source?: string;
  is_illustrative?: boolean;
  rows: FactRow[];
}

export interface BioInfo {
  name: string;
  role?: string;
  background?: string;
  source?: string;
  source_url?: string;
}

export interface QuarterlyRow {
  period: string;
  period_end: string;
  revenue: number | null;
  ebitda: number | null;
  pbt: number | null;
  pat: number | null;
  source: string;
}

export interface FilingSummary {
  id: number;
  category: string;
  headline: string;
  filed_at: string;
}

export interface ChunkStats {
  transcripts: number;
  annual_reports: number;
  results: number;
}

export interface GuidanceClaim {
  kind: "revenue_growth" | "ebitda_margin" | "ebitda_exit_margin";
  claim_period: string;
  claimed: { lo: number; hi: number; quote: string; unit: string };
  delivered_period?: string | null;
  verdict: "ahead" | "on_track" | "behind" | "pending" | "unverifiable";
  delivered?: number | null;
  gap?: number | null;
  within?: [number, number] | null;
  source: { chunk_id: number; doc_title: string; period: string; url: string; excerpt: string };
}

export interface GuidanceScorecard {
  ticker: string;
  delivered_period?: string | null;
  claims: GuidanceClaim[];
  streak: { ahead: number; on_track: number; behind: number };
  credibility: "Strong" | "Watch" | "Challenged";
}

export interface Coverage {
  level: "research_ready" | "numbers_only" | "quote_only" | "unavailable";
  chunks: ChunkStats;
  verified_quarters: number;
}

export interface Preparing {
  state: "running" | "done" | "failed";
  message: string;
  documents?: { doc_type: string; title: string; period: string; url: string; status: string }[];
}

export interface CompanyResponse {
  ticker: string;
  tracked?: boolean;
  available?: boolean;
  snapshot?: { ticker: string; close: number; change_pct: number; date: string } | null;
  quarterly: QuarterlyRow[];
  filings: FilingSummary[];
  chunk_stats: ChunkStats;
  guidance_scorecard?: GuidanceScorecard;
  portfolio_context?: { revenue_yoy: number | null; portfolio_median_yoy: number | null };
  coverage?: Coverage;
  preparing?: Preparing | null;
  watching?: boolean;
}

export interface CoverageResponse {
  ticker: string;
  coverage: Coverage;
  preparing: Preparing | null;
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
  by_scope_model: { scope: string; model: string; pt: number; ct: number; calls: number }[];
}

export interface DemoRunResponse {
  ok: boolean;
  mode?: "live" | "sample" | "unavailable";
  filings_seen?: number;
  new_alerts?: number;
}

// ─── Brief, verdicts, ledger ─────────────────────────────────────────────────

export type Verdict = "no_impact" | "watch" | "changes_story";

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

export interface VerdictResult {
  alert_id: number;
  verdict: Verdict;
  muted_category: string | null;
}

export interface VerdictLogRow {
  alert_id: number;
  ticker: string;
  verdict: Verdict;
  note?: string;
  created_at: string;
  kind?: AlertKind;
  headline: string;
}

export type LedgerStatus = "kept" | "missed" | "revised" | "gone_quiet" | "too_early" | "not_checkable";

export interface LedgerRow {
  period: string;
  kind: string;
  metric: string;
  band: string;
  lo?: number | null;
  hi?: number | null;
  unit?: string;
  horizon: string;
  quote: string;
  speaker: string;
  status: LedgerStatus;
  delivered: number | null;
  delivered_period: string | null;
  note: string;
  promise_source: { source_id: string; doc_title: string; doc_type: string; period: string; url: string } | null;
  delivered_source: { provider: string; period: string; url?: string } | null;
}

export interface Watchpoint {
  id: number;
  ticker: string;
  text: string;
  kind: string;
  origin: "drafted" | "investor";
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

// ─── Chat SSE ────────────────────────────────────────────────────────────────

export type ChatEventType = "thinking" | "model" | "tool" | "final" | "error" | "route";

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
  lane: "research" | "assistant";
  tier: "fast" | "reasoning" | "cache" | string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached?: boolean;
  cost_usd?: number | null;
}

export interface ChatEvent {
  type: ChatEventType;
  content?: string;
  tool_name?: string;
  done?: boolean;
  session_id?: string;
  citations?: Citation[];
  receipt?: Receipt;
  lane?: "research" | "assistant";
  ticker?: string | null;
}

export interface SourceInfo {
  id: string;
  title: string;
  doc_type?: string;
  period?: string;
  url?: string;
  excerpt?: string;
  provider?: string;
}

// Parsed SOURCES block: numeric source id → source metadata
export type SourceMap = Record<string, SourceInfo>;

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
