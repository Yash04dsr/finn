/**
 * DigestCard — hero card at the top of the feed. Title, stats line,
 * top items with priority dots; tap to expand the full list.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, type } from '../lib/theme';
import type { Digest } from '../lib/types';
import { catLabel } from '../lib/format';

export function DigestCard({ digest }: { digest: Digest | null }) {
  const [open, setOpen] = useState(false);
  if (!digest) return null;
  const r = digest.rendered;
  const items = r.items ?? [];
  const shown = r.stats?.shown ?? items.length;
  const hidden = r.stats?.hidden ?? 0;
  const visible = open ? items : items.slice(0, 4);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View
            style={{
              backgroundColor: colors.accentDim,
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2.5,
              marginRight: 8,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 }}>
              FINN BRIEF
            </Text>
          </View>
          <Text style={type.micro}>last {r.window_hours}h</Text>
        </View>
        <Text style={[type.title, { fontSize: 18, marginBottom: 3 }]}>{r.title}</Text>
        <Text style={type.small}>
          {shown} shown · {hidden} routine collapsed
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border }} />

      <View style={{ paddingVertical: 4 }}>
        {visible.map((it, i) => (
          <View key={`${it.ticker}-${i}`} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                marginTop: 5,
                marginRight: 10,
                backgroundColor:
                  it.priority <= 1 ? colors.red : it.priority === 2 ? colors.amber : colors.faint,
              }}
            />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12, letterSpacing: 0.2 }}>
                  {it.ticker}
                </Text>
                <Text style={type.micro}>{catLabel(it.category)}</Text>
              </View>
              <Text style={[type.small, { color: colors.text, fontSize: 12.5, lineHeight: 17 }]} numberOfLines={2}>
                {it.one_liner}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {items.length > 4 ? (
        <Pressable
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            alignItems: 'center',
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          })}
        >
          <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '600' }}>
            {open ? 'Collapse' : `Show all ${items.length} items`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
