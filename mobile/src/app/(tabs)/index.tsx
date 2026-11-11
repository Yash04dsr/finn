/**
 * FEED — window chips, digest hero, grouped alerts, detail modal.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, getBaseUrl, ApiError } from '../../../lib/api';
import { colors, radius, type } from '../../../lib/theme';
import type { Alert, Bio, Digest, Facts, MetricPayload, AnnouncementPayload } from '../../../lib/types';
import { DigestCard } from '../../../components/DigestCard';
import { AlertRow } from '../../../components/AlertRow';
import { BioCard, FactsTable } from '../../../components/FactsTable';
import { Sparkline } from '../../../components/charts';
import {
  CategoryChip,
  ErrorCard,
  ListSkeleton,
  SectionHeader,
  Spinner,
  TickerBadge,
} from '../../../components/ui';
import { relTime } from '../../../lib/format';

const WINDOWS: { label: string; hours: number }[] = [
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
];

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [hours, setHours] = useState(24);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Alert | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (h: number) => {
    setLoading(true);
    setError(null);
    try {
      const [feed, dig] = await Promise.all([
        api.feed(h, false),
        api.digestLatest().catch(() => null), // digest is optional decoration
      ]);
      if (!mounted.current) return;
      setAlerts(feed.alerts);
      setDigest(dig);
    } catch (e) {
      if (!mounted.current) return;
      setAlerts([]);
      setError(e instanceof ApiError ? e.message : 'Network request failed');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  useFocusEffect(
    useCallback(() => {
      // refresh on tab focus; stale data stays visible while loading
      void load(hours);
    }, [hours, load]),
  );

  const attention = useMemo(() => (alerts ?? []).filter((a) => a.priority <= 2), [alerts]);
  const rest = useMemo(() => (alerts ?? []).filter((a) => a.priority >= 3), [alerts]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 16,
          paddingBottom: 110,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <Text style={type.title}>Feed</Text>
          <Text style={type.micro}>{alerts ? `${alerts.length} alerts` : ''}</Text>
        </View>

        {/* window chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {WINDOWS.map((w) => {
            const active = w.hours === hours;
            return (
              <Pressable
                key={w.hours}
                onPress={() => setHours(w.hours)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.borderStrong,
                  backgroundColor: active ? colors.accentDim : 'transparent',
                })}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: active ? colors.accent : colors.muted,
                  }}
                >
                  {w.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <ErrorCard
            message={error}
            hint={`Backend: ${getBaseUrl()}\nStart it: cd backend && uv run uvicorn finn.api.main:app --port 8000`}
          />
        ) : loading && alerts === null ? (
          <ListSkeleton rows={7} />
        ) : (
          <>
            <DigestCard digest={digest} />
            <View style={{ height: 18 }} />

            {alerts && alerts.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <Text style={[type.h3, { marginBottom: 4 }]}>All quiet</Text>
                <Text style={type.small}>No alerts in this window.</Text>
              </View>
            ) : (
              <>
                {attention.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <SectionHeader title="Needs attention" hint={`${attention.length}`} />
                    <View
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: colors.border,
                        overflow: 'hidden',
                      }}
                    >
                      {attention.map((a, i) => (
                        <View
                          key={a.id}
                          style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
                        >
                          <AlertRow alert={a} onPress={setSelected} />
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {rest.length > 0 && (
                  <View>
                    <SectionHeader title="Rest of the day" hint={`${rest.length}`} />
                    <View
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: colors.border,
                        overflow: 'hidden',
                      }}
                    >
                      {rest.map((a, i) => (
                        <View
                          key={a.id}
                          style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
                        >
                          <AlertRow alert={a} onPress={setSelected} />
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {loading && alerts !== null ? (
        <View style={{ position: 'absolute', top: insets.top + 12, right: 18 }}>
          <Spinner size={14} />
        </View>
      ) : null}

      {selected ? (
        <AlertDetailModal alert={selected} width={width} onClose={() => setSelected(null)} />
      ) : null}
    </View>
  );
}

// --- Detail modal (bottom-sheet-style overlay) -------------------------------------

function AlertDetailModal({
  alert,
  onClose,
}: {
  alert: Alert;
  width: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [showWhy, setShowWhy] = useState(false);
  const p = alert.payload as AnnouncementPayload & Partial<MetricPayload>;

  const category = p.category ?? alert.kind;
  const isAnnouncement = alert.kind === 'announcement';
  const change = p.change_pct ?? null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }}>
      {/* scrim */}
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,6,12,0.62)' }}
        onPress={onClose}
      />
      {/* sheet */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '88%',
          backgroundColor: colors.bg,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderTopWidth: 1,
          borderTopColor: colors.borderStrong,
          paddingBottom: insets.bottom + 12,
        }}
      >
        {/* grabber */}
        <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
          <View style={{ width: 38, height: 4.5, borderRadius: 3, backgroundColor: colors.borderStrong }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, gap: 14 }}>
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TickerBadge ticker={alert.ticker} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={[type.h3, { fontSize: 14 }]}>{alert.ticker}</Text>
              <Text style={type.micro}>{relTime(alert.created_at)}</Text>
            </View>
            <CategoryChip label={category} />
          </View>

          <Text style={[type.title, { fontSize: 18, lineHeight: 24 }]}>
            {isAnnouncement
              ? p.headline
              : `${alert.ticker}: ${alert.kind === 'volume_spike' ? 'unusual volume' : 'sharp price move'}`}
          </Text>

          {/* metric payload specifics */}
          {!isAnnouncement && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                }}
              >
                <Text style={type.micro}>{alert.kind === 'volume_spike' ? 'Volume' : 'Move'}</Text>
                <Text
                  style={[
                    type.title,
                    {
                      fontSize: 20,
                      marginTop: 2,
                      fontVariant: ['tabular-nums'],
                      color:
                        alert.kind === 'price_move' && change != null && change < 0
                          ? colors.red
                          : alert.kind === 'price_move'
                            ? colors.accent
                            : colors.text,
                    },
                  ]}
                >
                  {alert.kind === 'volume_spike'
                    ? `${(p.value ?? 0).toFixed(1)}x`
                    : `${(change ?? 0) > 0 ? '+' : ''}${(change ?? 0).toFixed(1)}%`}
                </Text>
                <Text style={type.micro}>
                  threshold {(p.threshold ?? 0).toFixed(1)}
                  {alert.kind === 'volume_spike' ? 'x' : '%'}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                }}
              >
                <Text style={type.micro}>Close</Text>
                <Text style={[type.title, { fontSize: 20, marginTop: 2, fontVariant: ['tabular-nums'] }]}>
                  ₹{(p.close ?? 0).toLocaleString('en-IN')}
                </Text>
                {p.spark && p.spark.length > 1 ? (
                  <View style={{ marginTop: 6 }}>
                    <Sparkline points={p.spark} width={110} height={26} />
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {/* FINN's take */}
          {p.summary ? (
            <View>
              <SectionHeader title="FINN's take" />
              <Text style={[type.body, { lineHeight: 21 }]}>{p.summary}</Text>
            </View>
          ) : null}

          {/* results facts table */}
          {p.facts ? (
            <View>
              <SectionHeader title={`Results · ${p.facts.period}`} />
              <FactsTable facts={p.facts as Facts} />
            </View>
          ) : null}

          {/* management bio */}
          {p.bio ? (
            <View>
              <SectionHeader title="Who is this" />
              <BioCard bio={p.bio as Bio} />
            </View>
          ) : null}

          {/* why disclosure */}
          <Pressable
            onPress={() => setShowWhy((s) => !s)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.75 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingHorizontal: 12,
              paddingVertical: 11,
            })}
          >
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>
              Why am I seeing this?
            </Text>
            <Text style={{ color: colors.faint, fontSize: 15 }}>{showWhy ? '−' : '+'}</Text>
          </Pressable>
          {showWhy ? (
            <View
              style={{
                backgroundColor: colors.surface2,
                borderRadius: radius.md,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={[type.small, { lineHeight: 18 }]}>{alert.why}</Text>
              {p.filed_at ? (
                <Text style={[type.micro, { marginTop: 6, color: colors.faint }]}>
                  Filed {relTime(p.filed_at)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* CTA */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Pressable
            onPress={() => {
              onClose();
              router.push({
                pathname: '/chat',
                params: { ticker: alert.ticker, filing: String(alert.id) },
              });
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              backgroundColor: colors.accent,
              borderRadius: radius.md,
              paddingVertical: 13,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: '#04130C', fontWeight: '700', fontSize: 14.5 }}>
              Ask FINN about this filing
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
