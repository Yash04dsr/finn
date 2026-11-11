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

export function FactsTable({ facts }: { facts: Facts }) {
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
            borderRadius: 17,
            backgroundColor: colors.accentDim,
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
    </View>
  );
}
