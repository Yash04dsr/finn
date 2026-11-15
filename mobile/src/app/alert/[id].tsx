/**
 * EVIDENCE — everything behind one alert, opened on the exact filing.
 * First cut, person card, why it ranks here, the source, item-specific questions, and a verdict.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../../lib/api';
import { colors, type } from '../../../lib/theme';
import { relTime } from '../../../lib/format';
import { openSource } from '../../../lib/open';
import type { Alert, AnnouncementPayload, Bio, BriefItem, Facts, MetricPayload, Verdict } from '../../../lib/types';
import { BioCard, FactsTable } from '../../../components/FactsTable';
import { VERDICT_LABEL, VerdictBar, headlineOf } from '../../../components/brief';
import { Sparkline } from '../../../components/charts';
import { CategoryChip, ErrorCard, ListSkeleton, SectionHeader, TickerBadge } from '../../../components/ui';

type Evidence = Alert & { touches?: string };

export default function EvidenceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [alert, setAlert] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<Verdict | null>(null);

  useEffect(() => {
    let live = true;
    api
      .alert(Number(id))
      .then((a) => live && setAlert(a))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : 'Could not load this alert'));
    return () => {
      live = false;
    };
  }, [id]);

  const decide = async (v: Verdict) => {
    if (!alert) return;
    setBusy(true);
    try {
      await api.verdict(alert.id, v);
      setDecided(v);
      setTimeout(() => router.back(), 450);
    } catch {
      setError('Could not save that decision. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const p = (alert?.payload ?? {}) as Partial<AnnouncementPayload & MetricPayload>;
  const isFiling = alert?.kind === 'announcement';
  const questions = alert ? questionsFor(alert) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#000000' }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600' }}>Close</Text>
        </Pressable>
        <Text style={[type.micro, { marginLeft: 'auto', marginRight: 8 }]}>EVIDENCE</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 140, gap: 18 }}>
        {error ? <ErrorCard message={error} /> : null}
        {!alert && !error ? <ListSkeleton rows={4} /> : null}
        {alert ? (
          <>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TickerBadge ticker={alert.ticker} />
                <CategoryChip label={isFiling ? p.category ?? 'filing' : alert.kind} small />
                <Text style={[type.micro, { marginLeft: 'auto' }]}>{relTime(alert.event_at || alert.created_at)}</Text>
              </View>
              <Text style={[type.title, { fontSize: 20, lineHeight: 26, marginTop: 10 }]}>{headlineOf(alert)}</Text>
              {p.summary && p.summary !== p.headline ? (
                <Text style={[type.body, { marginTop: 8, color: colors.muted }]}>{p.summary}</Text>
              ) : null}
              {p.is_sample ? (
                <Text style={[type.micro, { marginTop: 8 }]}>Sample-day filing used for the demo.</Text>
              ) : null}
            </View>

            {p.facts ? (
              <View>
                <SectionHeader title={`First cut · ${p.facts.period}`} />
                <FactsTable facts={p.facts as Facts} sample={p.is_sample} />
              </View>
            ) : null}

            {p.bio ? (
              <View>
                <SectionHeader title="Who is coming in" />
                <BioCard bio={p.bio as Bio} />
              </View>
            ) : null}

            {!isFiling ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Box label={alert.kind === 'volume_spike' ? 'Volume' : 'Move'}>
                  <Text style={[type.title, { fontSize: 22, fontVariant: ['tabular-nums'] }]}>
                    {alert.kind === 'volume_spike'
                      ? `${(p.value ?? 0).toFixed(1)}x`
                      : `${(p.value ?? 0) > 0 ? '+' : ''}${(p.value ?? 0).toFixed(1)}%`}
                  </Text>
                  <Text style={type.micro}>your line {p.threshold}{alert.kind === 'volume_spike' ? 'x' : '%'}</Text>
                </Box>
                <Box label="Close">
                  <Text style={[type.title, { fontSize: 22, fontVariant: ['tabular-nums'] }]}>
                    ₹{(p.close ?? 0).toLocaleString('en-IN')}
                  </Text>
                  {p.spark && p.spark.length > 1 ? <Sparkline points={p.spark} width={120} height={26} /> : null}
                </Box>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Touches" />
              <Text style={[type.body, { fontWeight: '600' }]}>{alert.touches}</Text>
              <Text style={[type.small, { marginTop: 4 }]}>{alert.why}</Text>
            </View>

            {isFiling ? (
              <View>
                <SectionHeader title="Source" />
                {p.filing_url ? (
                  <Pressable
                    onPress={() => openSource(p.filing_url)}
                    accessibilityRole="link"
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={[type.body, { fontWeight: '600', textDecorationLine: 'underline' }]}>
                      Open the exchange filing
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={type.small}>
                    {p.is_sample ? 'Sample filings have no document attached.' : 'The exchange did not attach a document.'}
                  </Text>
                )}
              </View>
            ) : null}

            <View>
              <SectionHeader title="Ask about this" />
              {questions.map((q) => (
                <Pressable
                  key={q}
                  onPress={() =>
                    router.push({ pathname: '/chat', params: { ticker: alert.ticker, filing: String(alert.id), q } })
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    minHeight: 48,
                    justifyContent: 'center',
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={[type.body, { color: '#000000' }]}>{q} ›</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => router.push({ pathname: '/company/[ticker]', params: { ticker: alert.ticker } })}
                accessibilityRole="button"
                style={{ minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Text style={[type.body, { color: '#000000' }]}>See {alert.ticker}'s promise ledger ›</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>

      {alert ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 10,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#000000',
          }}
        >
          {decided ? (
            <Text style={[type.body, { textAlign: 'center', paddingVertical: 14, fontWeight: '600' }]}>
              Marked {VERDICT_LABEL[decided]}
            </Text>
          ) : (
            <VerdictBar busy={busy} onVerdict={decide} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 2 }}>
      <Text style={type.micro}>{label}</Text>
      {children}
    </View>
  );
}

/** Questions written for this kind of item, so the investor never starts from a blank box. */
function questionsFor(a: Alert | BriefItem): string[] {
  const p = a.payload as Partial<AnnouncementPayload>;
  const t = a.ticker;
  if (a.kind !== 'announcement') {
    return [
      `Did ${t} file anything that explains this move?`,
      `What did ${t} management last say about demand?`,
      `How have ${t}'s recent results trended?`,
    ];
  }
  switch (p.category) {
    case 'results':
      return [
        `Did ${t} deliver what management promised?`,
        `What drove the change in ${t}'s margins this quarter?`,
        `What did ${t} guide for the rest of the year?`,
      ];
    case 'management_change':
      return [
        `What has ${t} said about leadership and succession?`,
        `Has ${t} had other senior exits recently?`,
        `What did ${t}'s outgoing executive commit to?`,
      ];
    case 'M&A':
    case 'capex':
    case 'fund_raise':
      return [
        `How does ${t} say this fits its capital allocation plan?`,
        `What return does ${t} expect from this investment?`,
        `How will this affect ${t}'s debt?`,
      ];
    case 'litigation':
      return [
        `What has ${t} disclosed about this matter before?`,
        `How large could the impact be for ${t}?`,
        `Has ${t} faced similar regulatory actions?`,
      ];
    default:
      return [
        `What does this mean for ${t}?`,
        `Did ${t} deliver what management promised?`,
        `What did ${t} management say on the latest call?`,
      ];
  }
}
