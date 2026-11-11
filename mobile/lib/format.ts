/**
 * Formatters: ₹ crore, signed percents, relative time.
 */

export function fmtCr(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `₹${v.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Signed percent, e.g. "+4.1%" / "-0.7%" / "0.0%". */
export function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(1)}%`;
}

/** Ratio, e.g. "4.4x". */
export function fmtX(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)}x`;
}

/** Compact token counts: 12.4k / 3.2M. */
export function fmtTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Relative time for backend stamps.
 * Handles "2026-11-11 12:12:44" (naive UTC) and full ISO with offset.
 */
export function relTime(stamp: string | null | undefined): string {
  if (!stamp) return '';
  const d = parseStamp(stamp);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/** Clock time (HH:MM) for filings. */
export function clockTime(stamp: string | null | undefined): string {
  const d = stamp ? parseStamp(stamp) : null;
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Day label, e.g. "Tue, Nov 11". */
export function dayLabel(stamp: string | null | undefined): string {
  const d = stamp ? parseStamp(stamp) : null;
  if (!d) return '';
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Backend stamps are either ISO-with-offset ("...+00:00") or
 * naive "YYYY-MM-DD HH:MM:SS" which is UTC — interpret accordingly.
 */
function parseStamp(stamp: string): Date | null {
  if (!stamp) return null;
  const iso = stamp.includes('T') ? stamp : stamp.replace(' ', 'T');
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  try {
    const d = new Date(hasOffset ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Humanize a category slug: "management_change" -> "Management change". */
export function catLabel(cat: string): string {
  if (cat === 'M&A') return 'M&A';
  if (cat === 'agm_egm') return 'AGM/EGM';
  if (cat === 'bonus_split') return 'Bonus/split';
  return cat
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** HH:MM validation for quiet hours inputs. */
export function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim());
}
