/**
 * COMPANIES — Portfolio (17) and Ad-hoc research (4) quote lists.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, getBaseUrl, ApiError } from '../../../lib/api';
import { colors, radius, type } from '../../../lib/theme';
import type { CompaniesResponse, QuoteRow } from '../../../lib/types';
import { ChangeBadge, ChevronRight, ErrorCard, ListSkeleton, SectionHeader } from '../../../components/ui';
import { fmtPrice } from '../../../lib/format';

export default function CompaniesScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CompaniesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticker, setTicker] = useState('');
  const [validation, setValidation] = useState('');
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.companies();
      if (mounted.current) {
        setData(d);
        setLoading(false);
      }
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof ApiError ? e.message : 'Network request failed');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (data) void load(); // silent refresh
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 110 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={type.title}>Companies</Text>
          <Text style={type.micro}>
            {data ? `${data.portfolio.length} portfolio · ${data.adhoc.length} ad-hoc` : ''}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 14,
            marginBottom: 18,
          }}
        >
          <Text style={type.h3}>Research a company</Text>
          <Text style={[type.small, { marginTop: 4, marginBottom: 10 }]}>
            Enter an NSE or BSE ticker. FINN loads a quote when the symbol is listed, and refuses analysis when primary documents are missing.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={ticker}
              onChangeText={(value) => {
                setTicker(value.toUpperCase());
                if (validation) setValidation('');
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              placeholder="e.g. PERSISTENT"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Ticker symbol"
              style={{
                flex: 1,
                minHeight: 44,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                borderRadius: radius.sm,
                paddingHorizontal: 12,
                color: colors.text,
                fontSize: 16,
                fontWeight: '700',
                letterSpacing: 0.4,
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const normalized = ticker.trim().toUpperCase();
                if (!normalized) {
                  setValidation('Enter a ticker symbol.');
                  return;
                }
                if (!/^[A-Z0-9&.-]{1,20}$/.test(normalized)) {
                  setValidation('Use letters, numbers, ampersands, dots, or hyphens.');
                  return;
                }
                setValidation('');
                router.push({ pathname: '/company/[ticker]', params: { ticker: normalized } });
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderRadius: radius.sm,
                backgroundColor: colors.accent,
              })}
            >
              <Text style={{ color: '#04130C', fontWeight: '700', fontSize: 13 }}>Open</Text>
            </Pressable>
          </View>
          {validation ? (
            <Text style={{ color: colors.red, fontSize: 12, marginTop: 8 }}>{validation}</Text>
          ) : null}
        </View>

        {error ? (
          <ErrorCard
            message={error}
            hint={`Backend: ${getBaseUrl()}\nStart it: cd backend && uv run uvicorn finn.api.main:app --port 8000`}
          />
        ) : loading && !data ? (
          <ListSkeleton rows={9} />
        ) : data ? (
          <>
            <View style={{ marginBottom: 20 }}>
              <SectionHeader title="Portfolio" hint={`${data.portfolio.length}`} />
              <QuoteList rows={data.portfolio} />
            </View>
            <View>
              <SectionHeader title="Ad-hoc research" hint={`${data.adhoc.length}`} />
              <QuoteList rows={data.adhoc} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function QuoteList({ rows }: { rows: QuoteRow[] }) {
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
      {rows.map((r, i) => (
        <Pressable
          key={r.ticker}
          onPress={() => router.push({ pathname: '/company/[ticker]', params: { ticker: r.ticker } })}
          android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
          style={({ pressed }) => ({
            opacity: pressed ? 0.8 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 13,
            paddingVertical: 12,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
          })}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 11,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 10, letterSpacing: 0.2 }} numberOfLines={2}>
              {r.ticker}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.h3, { fontSize: 13.5 }]}>{r.ticker}</Text>
            <Text style={[type.small, { fontVariant: ['tabular-nums'], fontSize: 12 }]}>
              {fmtPrice(r.close)}
            </Text>
          </View>
          <ChangeBadge pct={r.change_pct} small />
          <View style={{ marginLeft: 10 }}>
            <ChevronRight />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
