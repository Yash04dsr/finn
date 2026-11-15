/**
 * COMPANIES — Portfolio (17) and Ad-hoc research (4) quote lists.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, getBaseUrl, ApiError } from '../../../lib/api';
import { colors, radius, type } from '../../../lib/theme';
import type { CompaniesResponse, QuoteRow } from '../../../lib/types';
import { Wordmark } from '../../../components/Wordmark';
import { ChangeBadge, ChevronRight, ErrorCard, ListSkeleton, SectionHeader } from '../../../components/ui';
import { fmtPrice } from '../../../lib/format';

export default function CompaniesScreen() {
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
      <Wordmark />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 110 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            borderTopWidth: 2,
            borderTopColor: '#000000',
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
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Open</Text>
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
              <SectionHeader title="Research list and watchlist" hint={`${data.adhoc.length}`} />
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
        borderTopWidth: 2,
        borderTopColor: '#000000',
        overflow: 'hidden',
      }}
    >
      {rows.map((r, i) => (
        <Pressable
          key={r.ticker}
          onPress={() => router.push({ pathname: '/company/[ticker]', params: { ticker: r.ticker } })}
          android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
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
          <Text style={{ flex: 1, color: colors.text, fontWeight: '700', fontSize: 13.5, letterSpacing: 0.4 }}>
            {r.ticker}
          </Text>
          <Text style={[type.small, { fontVariant: ['tabular-nums'], marginRight: 8 }]}>
            {fmtPrice(r.close)}
          </Text>
          <ChangeBadge pct={r.change_pct} small />
          <View style={{ marginLeft: 10 }}>
            <ChevronRight />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
