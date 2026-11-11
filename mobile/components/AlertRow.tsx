/**
 * AlertRow — single feed row: ticker badge, kind glyph, headline,
 * category chip, relative time, thin priority bar on the left edge.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, type } from '../lib/theme';
import { relTime, catLabel, fmtPrice, fmtX, fmtPct } from '../lib/format';
import type { Alert, AnnouncementPayload, MetricPayload, DigestPayload } from '../lib/types';
import { CategoryChip, ChevronRight } from './ui';

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
    alert.priority <= 1 ? colors.red : alert.priority === 2 ? colors.amber : colors.faint;
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
      android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.82 : 1,
        flexDirection: 'row',
        alignItems: 'stretch',
      })}
    >
      {/* priority bar */}
      <View style={{ width: 3, borderRadius: 2, backgroundColor: prioColor, marginRight: 12 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingVertical: 13 }}>
        {/* ticker badge */}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.surface2,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 11,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 10.5, letterSpacing: 0.2 }} numberOfLines={2}>
            {alert.ticker}
          </Text>
        </View>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[type.h3, { fontSize: 13.5, lineHeight: 18, marginBottom: 3 }]} numberOfLines={2}>
            {alertHeadline(alert)}
          </Text>
          {sub ? (
            <Text style={[type.small, { fontSize: 12, lineHeight: 16 }]} numberOfLines={2}>
              {sub}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
            {category ? <CategoryChip label={category} small /> : null}
            <Text style={type.micro}>{relTime(alert.created_at)}</Text>
          </View>
        </View>
        <ChevronRight />
      </View>
    </Pressable>
  );
}
