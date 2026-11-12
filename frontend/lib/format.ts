// ─── Formatting helpers ──────────────────────────────────────────────────────

/** "2026-11-11T09:30:00" → "2h ago" / "just now" / "3d ago" */
export function relTime(iso?: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < -60_000) return "soon"; // future timestamp, clock skew
  const mins = Math.floor(Math.abs(diff) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/** Absolute short date: 2026-11-11 → 11 Nov '26 */
export function shortDate(iso?: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  const d = new Date(t);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** ₹ crore formatting: 32070000000 → ₹3,207 Cr (input assumed already in Cr) */
export function crore(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  const s =
    abs >= 100000
      ? (abs / 100000).toFixed(2).replace(/\.0+$/, "") + " L Cr"
      : abs.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `${sign}₹${s} Cr`;
}

/** Signed percent: 2.41 → +2.4% ; -3.05 → −3.1% */
export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)}%`;
}

export function toneFor(v: number | null | undefined): "pos" | "neg" | "flat" {
  if (v === null || v === undefined || Number.isNaN(v) || v === 0) return "flat";
  return v > 0 ? "pos" : "neg";
}

/** Prices quoted in ₹, compact: 1234.5 → ₹1,234.50 */
export function rupees(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Big token counts: 1285400 → 12.9L ; 94500 → 94.5k */
export function compactNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "0";
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

/** "volume_multiple" → "Volume" ; "move_pct" → "Move" */
export function humanMetric(m?: string | null): string {
  switch ((m || "").toLowerCase()) {
    case "volume_multiple":
    case "volume":
      return "Volume";
    case "move_pct":
    case "move":
    case "price_move":
      return "Move";
    default:
      return m ? m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Metric";
  }
}

/** Category chips — Swiss: white bg, 1px black border, uppercase text. */
export function categoryColor(cat?: string | null): { bg: string; fg: string } {
  const c = (cat || "unclassified").toLowerCase();
  if (["results", "earnings_call"].includes(c)) return { bg: "#FFFFFF", fg: "#000000" };
  if (["m&a", "fund_raise"].includes(c)) return { bg: "#FFFFFF", fg: "#000000" };
  if (["litigation", "insider_trading", "pledging"].includes(c)) return { bg: "#000000", fg: "#FFFFFF" };
  if (["management_change"].includes(c)) return { bg: "#F5F1E8", fg: "#000000" };
  if (["credit_rating", "dividend", "bonus_split"].includes(c)) return { bg: "#FFFFFF", fg: "#000000" };
  if (["capex"].includes(c)) return { bg: "#F5F1E8", fg: "#000000" };
  return { bg: "#FFFFFF", fg: "#4B5563" };
}

export function priorityColor(p: number): string {
  if (p <= 1) return "#000000";
  if (p === 2) return "#B38B6D";
  return "#E5E7EB";
}

/** × formatting: 3.2 → "3.2×" */
export function times(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}×`;
}
