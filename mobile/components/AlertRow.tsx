/**
 * AlertRow — single feed row: ticker badge, kind glyph, headline,
 * category chip, relative time, thin priority bar on the left edge.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, type } from '../lib/theme';
import { relTime, catLabel, fmtPrice, fmtX, fmtPct } from '../lib/format';
import type { Alert, AnnouncementPayload, MetricPayload, DigestPayload } from '../lib/types';
import { CategoryChip, ChevronRight, TickerBadge } from './ui';

interface Props {
  alert: Alert;
  onPress: (alert: Alert) => void;
}

export function alertHeadline(alert: Alert): string {
  const p = alert.payload as Partial<AnnouncementPayload & MetricPayload & DigestPayload>;
  if (alert.kind === 'announcement') return p.headline ?? 'Filing';
  if (alert.kind === 'digest') return p.title ?? 'Digest';
  if (alert.kind === 'volume_spike') return `Unusual volume in ${alert.ticker}`;
  if (alert.kind === 'price_move') return `Sharp price move in ${alert.ticker}`;
  return 'Alert';
}

export function AlertRow({ alert, onPress }: Props) {
  const p = alert.payload as Partial<AnnouncementPayload & MetricPayload & DigestPayload>;
  const prioColor =
    alert.priority <= 1 ? '#000000' : alert.priority === 2 ? colors.tan : colors.border;
  const category = alert.kind === 'announcement' ? p.category ?? '' : alert.kind;

  let sub = '';
  if (alert.kind === 'volume_spike') {
    sub = `${fmtX(p.value)} 20-day avg (thr ${fmtX(p.threshold)}) · ${fmtPrice(p.close)}`;
  } else if (alert.kind === 'price_move') {
    sub = `${fmtPct(p.change_pct ?? p.value)} today (thr ±${(p.threshold ?? 0).toFixed(1)}%) · ${fmtPrice(p.close)}`;
  } else if (alert.kind === 'announcement') {
    sub = p.summary ?? '';
  } else if (alert.kind === 'digest') {
    sub = `${p.items?.length ?? 0} items · ${p.stats?.hidden ?? 0} routine collapsed`;
  }

  return (
    <Pressable
      onPress={() => onPress(alert)}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.82 : 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 14,
        marginBottom: 10,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderTopWidth: 2,
        borderTopColor: '#000000',
      })}
    >
      <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: prioColor }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TickerBadge ticker={alert.ticker} />
          {alert.kind === 'announcement' && category ? <CategoryChip label={category} small /> : null}
          <Text style={[type.micro, { marginLeft: 'auto' }]}>{relTime(alert.created_at)}</Text>
        </View>
        <Text style={[type.h3, { fontSize: 13.5, lineHeight: 18, marginTop: 6, fontWeight: '500' }]} numberOfLines={2}>
          {alertHeadline(alert)}
        </Text>
        {sub ? (
          <Text style={[type.small, { fontSize: 12, lineHeight: 16, marginTop: 4 }]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      <ChevronRight color="#808080" />
    </Pressable>
  );
}
