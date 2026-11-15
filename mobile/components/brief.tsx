/**
 * Brief building blocks: the focus card for one material item, the verdict bar,
 * compact rows for the rest, and the ledger status chip.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, type } from '../lib/theme';
import { fmtCr, relTime } from '../lib/format';
import type {
  AnnouncementPayload,
  BriefItem,
  LedgerStatus,
  MetricPayload,
  Verdict,
} from '../lib/types';
import { CategoryChip, TickerBadge } from './ui';

export const VERDICT_LABEL: Record<Verdict, string> = {
  no_impact: 'No impact',
  watch: 'Watch closer',
  changes_story: 'Changes the story',
};

/** One-line headline in plain words, whatever kind of alert it is. */
export function headlineOf(item: { kind: string; ticker: string; payload: unknown }): string {
  const p = item.payload as Partial<AnnouncementPayload & MetricPayload>;
  if (item.kind === 'announcement') return cleanHeadline(p.headline ?? 'Filing');
  if (item.kind === 'volume_spike') return `Volume ${(p.value ?? 0).toFixed(1)}x the 20-day average`;
  if (item.kind === 'price_move') {
    const v = p.change_pct ?? p.value ?? 0;
    return `Price ${v > 0 ? 'up' : 'down'} ${Math.abs(v).toFixed(1)}% in a day`;
  }
  return 'Alert';
}

/** Exchange headlines start with the company name; the ticker badge already says that. */
export function cleanHeadline(raw: string): string {
  const m = raw.match(/^(.{3,70}?)\s+[-–]\s*(.{12,})$/);
  const text = m ? m[2] : raw;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The number that matters, laid out inline so nobody opens the PDF to find it. */
export function KeyNumbers({ item }: { item: BriefItem }) {
  const p = item.payload as Partial<AnnouncementPayload & MetricPayload>;
  if (item.kind === 'announcement' && p.facts?.rows?.length) {
    const rows = p.facts.rows.filter((r) => ['Revenue', 'EBITDA', 'PAT'].includes(r.label));
    return (
      <View style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border }}>
          {rows.map((r) => (
            <View key={r.label} style={{ flex: 1, paddingTop: 8 }}>
              <Text style={type.micro}>{r.label}</Text>
              <Text style={[type.body, { fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{fmtCr(r.value)}</Text>
              <Text style={[type.micro, { color: signed(r.yoy_pct), fontVariant: ['tabular-nums'] }]}>
                {r.yoy_pct == null ? 'YoY n/a' : `${r.yoy_pct > 0 ? '+' : ''}${r.yoy_pct.toFixed(1)}% YoY`}
              </Text>
            </View>
          ))}
        </View>
        {p.facts.is_illustrative || p.is_sample ? (
          <Text style={[type.micro, { color: colors.neg, marginTop: 6 }]}>
            Sample-day numbers for the demo, not reported figures
          </Text>
        ) : null}
      </View>
    );
  }
  if (item.kind === 'volume_spike' || item.kind === 'price_move') {
    const change = p.change_pct ?? (item.kind === 'price_move' ? p.value : null) ?? null;
    return (
      <View style={{ flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
        <Stat label="Close" value={p.close != null ? `₹${p.close.toLocaleString('en-IN')}` : 'n/a'} />
        <Stat
          label="Day"
          value={change == null ? 'n/a' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
          color={signed(change)}
        />
        <Stat label="Your line" value={`${p.threshold ?? '?'}${item.kind === 'volume_spike' ? 'x' : '%'}`} />
      </View>
    );
  }
  return null;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.micro}>{label}</Text>
      <Text style={[type.body, { fontWeight: '700', fontVariant: ['tabular-nums'], color: color ?? colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

function signed(v: number | null | undefined) {
  if (v == null || v === 0) return colors.muted;
  return v > 0 ? colors.pos : colors.neg;
}

/** The focus card: everything needed to decide on one item without leaving the screen. */
export function FocusCard({ item, onOpen }: { item: BriefItem; onOpen: () => void }) {
  const p = item.payload as Partial<AnnouncementPayload>;
  const category = item.kind === 'announcement' ? p.category ?? 'filing' : item.kind;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.ticker}. ${headlineOf(item)}. Opens the evidence.`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderTopWidth: 2,
        borderTopColor: '#000000',
        padding: 16,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TickerBadge ticker={item.ticker} />
        <CategoryChip label={category} small />
        {item.is_new ? (
          <Text style={[type.micro, { color: '#000000', fontWeight: '700' }]}>NEW</Text>
        ) : null}
        <Text style={[type.micro, { marginLeft: 'auto' }]}>{relTime(item.event_at || item.created_at)}</Text>
      </View>
      <Text style={[type.h2, { marginTop: 10, lineHeight: 23 }]}>{headlineOf(item)}</Text>
      {p.summary && p.summary !== p.headline ? (
        <Text style={[type.body, { marginTop: 6, color: colors.muted }]}>{p.summary}</Text>
      ) : null}
      <KeyNumbers item={item} />
      <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={type.micro}>TOUCHES</Text>
        <Text style={[type.body, { fontWeight: '600', marginTop: 2 }]}>{item.touches}</Text>
        {item.past_verdict ? (
          <Text style={[type.micro, { marginTop: 4 }]}>
            You marked a similar {item.ticker} filing "{VERDICT_LABEL[item.past_verdict.verdict]}" {relTime(item.past_verdict.created_at)}.
          </Text>
        ) : null}
      </View>
      <Text style={[type.micro, { marginTop: 10, color: '#000000', fontWeight: '600' }]}>See the evidence ›</Text>
    </Pressable>
  );
}

/** Three decisions, each a full-width 48pt target. */
export function VerdictBar({ onVerdict, busy }: { onVerdict: (v: Verdict) => void; busy?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      {(['no_impact', 'watch', 'changes_story'] as Verdict[]).map((v) => {
        const primary = v === 'changes_story';
        return (
          <Pressable
            key={v}
            disabled={busy}
            onPress={() => onVerdict(v)}
            accessibilityRole="button"
            accessibilityLabel={VERDICT_LABEL[v]}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 48,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 6,
              backgroundColor: primary ? '#000000' : '#FFFFFF',
              borderWidth: 1,
              borderColor: '#000000',
              opacity: busy ? 0.5 : pressed ? 0.8 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: '700',
                textAlign: 'center',
                color: primary ? '#FFFFFF' : '#000000',
              }}
            >
              {VERDICT_LABEL[v]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Dense two-line row for items waiting their turn or already decided. */
export function CompactRow({
  item,
  onPress,
  right,
}: {
  item: BriefItem;
  onPress: () => void;
  right?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.ticker}. ${headlineOf(item)}`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.8 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 52,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      })}
    >
      <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: item.priority <= 1 ? '#000000' : colors.tan }} />
      <View style={{ flex: 1 }}>
        <Text style={[type.small, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
          {item.ticker} · {headlineOf(item)}
        </Text>
        <Text style={type.micro} numberOfLines={1}>{item.touches}</Text>
      </View>
      {right ? <Text style={[type.micro, { color: '#000000', fontWeight: '600' }]}>{right}</Text> : null}
    </Pressable>
  );
}

const STATUS_STYLE: Record<LedgerStatus, { label: string; bg: string; fg: string }> = {
  kept: { label: 'Kept', bg: 'rgba(30,107,79,0.12)', fg: '#1E6B4F' },
  missed: { label: 'Missed', bg: 'rgba(180,68,44,0.12)', fg: '#B4442C' },
  revised: { label: 'Revised', bg: 'rgba(179,139,109,0.18)', fg: '#6B4F37' },
  gone_quiet: { label: 'Gone quiet', bg: '#000000', fg: '#FFFFFF' },
  too_early: { label: 'Too early', bg: 'rgba(0,0,0,0.05)', fg: '#4B5563' },
  not_checkable: { label: 'Track', bg: 'rgba(0,0,0,0.05)', fg: '#4B5563' },
};

export function StatusChip({ status }: { status: LedgerStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 7, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: s.fg }}>
        {s.label}
      </Text>
    </View>
  );
}
