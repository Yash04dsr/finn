/**
 * Sticky FINN wordmark. Same header as the web app: black rule, token chip.
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { fmtTokens } from '../lib/format';
import { colors, type } from '../lib/theme';

export function Wordmark({ trailing }: { trailing?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [tokens, setTokens] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api
      .costs()
      .then((costs) => {
        if (live) setTokens(costs.total_tokens);
      })
      .catch(() => {
        /* chip stays hidden when the backend is down */
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <View
      style={{
        paddingTop: Math.max(insets.top, 8),
        paddingHorizontal: 16,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderStrong,
        backgroundColor: colors.bg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <Text style={[type.title, { fontSize: 22 }]}>FINN</Text>
        {trailing}
      </View>
      {typeof tokens === 'number' && tokens > 0 ? (
        <Text
          style={{
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.2)',
            paddingHorizontal: 8,
            paddingVertical: 2,
            fontSize: 11,
            fontWeight: '500',
            color: colors.muted,
            fontVariant: ['tabular-nums'],
          }}
        >
          {fmtTokens(tokens)} TOK
        </Text>
      ) : null}
    </View>
  );
}
