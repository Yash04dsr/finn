/**
 * FactsTable — quarterly results table (label, ₹ Cr value, QoQ/YoY chips)
 * and BioCard for management_change filings.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { colors, radius, type } from '../lib/theme';
import { fmtCr } from '../lib/format';
import type { Bio, Facts } from '../lib/types';
import { PctChip } from './ui';
import { openSource } from '../lib/open';

export function FactsTable({ facts, sample }: { facts: Facts; sample?: boolean }) {
  if (!facts?.rows?.length) return null;
  return (
    <View
      style={{
        backgroundColor: colors.surface2,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={[type.micro, { flex: 1.4, fontWeight: '700', color: colors.text, letterSpacing: 0.3 }]}>
          {facts.period}
        </Text>
        <Text style={[type.micro, { flex: 1, fontWeight: '700', color: colors.text, letterSpacing: 0.3 }]}>₹ Cr</Text>
        <Text style={[type.micro, { width: 132, fontWeight: '700', color: colors.text, letterSpacing: 0.3, textAlign: 'right' }]}>
          QoQ · YoY
        </Text>
      </View>
      <SourceLine facts={sample ? { ...facts, is_illustrative: true } : facts} />
      {facts.rows.map((row, i) => (
        <View
          key={`${row.label}-${i}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}
        >
          <Text style={[type.body, { flex: 1.4, fontSize: 13.5 }]}>{row.label}</Text>
          <Text style={[type.body, { flex: 1, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>
            {fmtCr(row.value)}
          </Text>
          <View style={{ width: 132, flexDirection: 'row', justifyContent: 'flex-end', gap: 5 }}>
            <PctChip label="QoQ" value={row.qoq_pct} />
            <PctChip label="YoY" value={row.yoy_pct} />
          </View>
        </View>
      ))}
    </View>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  illustrative_snapshot: 'Illustrative numbers for the demo, not reported figures',
  screener_live: 'Source: Screener.in (secondary)',
  screener: 'Source: Screener.in (secondary)',
  results_filing: 'Source: company results filing',
};

/** Where the numbers came from, shown on every table so nothing illustrative passes as reported. */
export function SourceLine({ facts }: { facts: { source?: string; is_illustrative?: boolean } }) {
  const key = facts.is_illustrative ? 'illustrative_snapshot' : facts.source ?? '';
  const label = SOURCE_LABEL[key];
  if (!label) return null;
  const warn = key === 'illustrative_snapshot';
  return (
    <Text
      style={[
        type.micro,
        {
          paddingHorizontal: 12,
          paddingVertical: 6,
          color: warn ? colors.neg : colors.muted,
          backgroundColor: warn ? colors.redDim : 'transparent',
        },
      ]}
    >
      {label}
    </Text>
  );
}

export function BioCard({ bio }: { bio: Bio }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface2,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 0,
            backgroundColor: colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
            {(bio.name ?? '?')
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.h3, { fontSize: 14 }]}>{bio.name}</Text>
          <Text style={type.small}>{bio.role}</Text>
        </View>
      </View>
      <Text style={[type.small, { lineHeight: 18 }]}>{bio.background}</Text>
      {bio.source ? (
        <Text
          onPress={bio.source_url ? () => openSource(bio.source_url) : undefined}
          accessibilityRole={bio.source_url ? 'link' : 'text'}
          style={[type.micro, { marginTop: 6, textDecorationLine: bio.source_url ? 'underline' : 'none' }]}
        >
          Source: {bio.source}
        </Text>
      ) : null}
    </View>
  );
}
