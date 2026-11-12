/**
 * COMPANY DETAIL — snapshot header, revenue chart + EBITDA margin line,
 * grounded-docs badges, filings list, fixed bottom research CTA.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, getBaseUrl, ApiError } from '../../../lib/api';
import { colors, radius, type } from '../../../lib/theme';
import type { CompanyDetail } from '../../../lib/types';
import { RevenueChart } from '../../../components/charts';
import {
  CategoryChip,
  ChangeBadge,
  ErrorCard,
  ListSkeleton,
  SectionHeader,
} from '../../../components/ui';
import { clockTime, dayLabel, fmtPrice } from '../../../lib/format';

export default function CompanyDetailScreen() {
  const params = useLocalSearchParams<{ ticker: string }>();
  const ticker = String(params.ticker ?? '');
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const d = await api.company(ticker);
        if (mounted.current) {
          setData(d);
          setLoading(false);
        }
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof ApiError ? e.message : 'Network request failed');
        setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [ticker]);

  const cs = data?.chunk_stats;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* header */}
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginBottom: 10, alignSelf: 'flex-start' })}
        >
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>‹ Back</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 11 }} numberOfLines={2}>
              {ticker}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.title}>{ticker}</Text>
            {data?.snapshot ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <Text style={[type.h3, { fontVariant: ['tabular-nums'] }]}>
                  {fmtPrice(data.snapshot.close)}
                </Text>
                <ChangeBadge pct={data.snapshot.change_pct} small />
                <Text style={type.micro}>{dayLabel(data.snapshot.date)}</Text>
              </View>
            ) : (
              <Text style={type.small}>No market snapshot</Text>
            )}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 20 }}>
        {error ? (
          <ErrorCard
            message={error}
            hint={`Backend: ${getBaseUrl()}\nStart it: cd backend && uv run uvicorn finn.api.main:app --port 8000`}
          />
        ) : loading || !data ? (
          <ListSkeleton rows={6} />
        ) : data.available === false ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
            }}
          >
            <Text style={type.h2}>Research unavailable for {ticker}</Text>
            <Text style={[type.body, { color: colors.muted, marginTop: 8 }]}>
              FINN does not have a listed quote or primary-source coverage for this ticker, so it will not generate an ungrounded company page.
            </Text>
          </View>
        ) : (
          <>
            {/* grounded docs badges */}
            {cs ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <GroundBadge n={cs.transcripts} label="transcripts" />
                <GroundBadge n={cs.annual_reports} label="annual reports" />
                <GroundBadge n={cs.results} label="results" />
              </View>
            ) : null}

            {/* chart */}
            {data.quarterly.length > 0 ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 14,
                }}
              >
                <SectionHeader title="Revenue & EBITDA margin" hint="last 8 quarters" />
                <RevenueChart quarterly={data.quarterly} />
              </View>
            ) : (
              <Text style={type.small}>No quarterly financials on file.</Text>
            )}

            {/* filings */}
            <View>
              <SectionHeader title="Recent filings" hint={`${data.filings.length}`} />
              {data.filings.length === 0 ? (
                <Text style={type.small}>No filings in the current window.</Text>
              ) : (
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: 'hidden',
                  }}
                >
                  {data.filings.map((f, i) => (
                    <View
                      key={f.id}
                      style={{
                        paddingHorizontal: 13,
                        paddingVertical: 11,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <CategoryChip label={f.category} small />
                        <Text style={type.micro}>
                          {dayLabel(f.filed_at)} · {clockTime(f.filed_at)}
                        </Text>
                      </View>
                      <Text style={[type.body, { fontSize: 13, lineHeight: 18 }]} numberOfLines={3}>
                        {f.headline}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* fixed bottom CTA */}
      {data && !loading ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: insets.bottom + 12,
            backgroundColor: 'rgba(10,14,20,0.96)',
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={() => router.push({ pathname: '/chat', params: { ticker } })}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              backgroundColor: colors.accent,
              borderRadius: radius.md,
              paddingVertical: 13,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: '#04130C', fontWeight: '700', fontSize: 14.5 }}>
              {data.available === false ? `Ask FINN about ${ticker} coverage` : `Research ${ticker} with FINN`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function GroundBadge({ n, label }: { n: number; label: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12.5, fontVariant: ['tabular-nums'] }}>
        {n}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 10.5 }}>{label}</Text>
    </View>
  );
}
