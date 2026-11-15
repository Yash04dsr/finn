/**
 * COMPANY — led by the Promise ledger: management's numeric commitments from the
 * last four calls, graded in code against reported numbers, each one cited.
 * Then the investor's watchpoints, the numbers, and recent filings.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../../lib/api';
import { colors, type } from '../../../lib/theme';
import { catLabel, dayLabel, fmtPrice, relTime } from '../../../lib/format';
import { openSource } from '../../../lib/open';
import type { CompanyDetail, Ledger, LedgerRow, Watchpoint } from '../../../lib/types';
import { Wordmark } from '../../../components/Wordmark';
import { RevenueChart } from '../../../components/charts';
import { SourceLine } from '../../../components/FactsTable';
import { StatusChip } from '../../../components/brief';
import { ChangeBadge, ErrorCard, ListSkeleton, SectionHeader, Spinner } from '../../../components/ui';

const LEVEL_TEXT: Record<string, string> = {
  research_ready: 'Research ready',
  numbers_only: 'Numbers only, no documents yet',
  quote_only: 'Price only',
  unavailable: 'Not available',
};

export default function CompanyScreen() {
  const { ticker: raw } = useLocalSearchParams<{ ticker: string }>();
  const ticker = String(raw || '').toUpperCase();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [points, setPoints] = useState<Watchpoint[]>([]);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLedger = useCallback(async () => {
    setLedgerError(null);
    try {
      const l = await api.ledger(ticker);
      setLedger(l);
      setPoints(l.watchpoints);
    } catch (e) {
      setLedgerError(e instanceof ApiError ? 'The ledger could not be built right now.' : 'Network request failed');
    }
  }, [ticker]);

  useEffect(() => {
    let live = true;
    api
      .company(ticker)
      .then((d) => {
        if (!live) return;
        setData(d);
        setWatching(Boolean(d.watching));
        if (d.available !== false) void loadLedger();
      })
      .catch((e) => live && setError(e instanceof ApiError ? e.message : 'Network request failed'));
    return () => {
      live = false;
    };
  }, [ticker, loadLedger]);

  // While FINN reads newer transcripts, check back and rebuild the ledger when they land.
  useEffect(() => {
    if (data?.preparing?.state !== 'running') return;
    poll.current = setInterval(async () => {
      try {
        const c = await api.coverage(ticker);
        setData((d) => (d ? { ...d, coverage: c.coverage, preparing: c.preparing } : d));
        if (c.preparing?.state !== 'running') {
          if (poll.current) clearInterval(poll.current);
          void loadLedger();
        }
      } catch {
        // keep polling quietly
      }
    }, 4000);
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [data?.preparing?.state, ticker, loadLedger]);

  const toggleWatch = async () => {
    const next = !watching;
    setWatching(next);
    try {
      await (next ? api.watch(ticker) : api.unwatch(ticker));
    } catch {
      setWatching(!next);
    }
  };

  const addPoint = async () => {
    const text = draft.trim();
    if (text.length < 3) return;
    setDraft('');
    try {
      const wp = await api.addWatchpoint(ticker, text);
      setPoints((p) => [...p, wp]);
    } catch {
      setDraft(text);
    }
  };

  const removePoint = async (id: number) => {
    setPoints((p) => p.filter((w) => w.id !== id));
    await api.deleteWatchpoint(ticker, id).catch(() => undefined);
  };

  const rows = ledger?.rows ?? [];
  const judged = rows.filter((r) => ['kept', 'missed', 'revised', 'gone_quiet', 'too_early'].includes(r.status));
  const tracked = rows.filter((r) => r.status === 'not_checkable');
  const visibleTracked = showAll ? tracked : tracked.slice(0, 3);
  const cover = data?.coverage;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Wordmark />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 110, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 4 }}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingRight: 12 }}>
            <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '500' }}>‹ Back</Text>
          </Pressable>
          {data && data.available !== false ? (
            <Pressable
              onPress={toggleWatch}
              accessibilityRole="switch"
              accessibilityState={{ checked: watching }}
              accessibilityLabel={watching ? `Stop watching ${ticker}` : `Watch ${ticker} in your brief`}
              style={{
                marginLeft: 'auto',
                minHeight: 40,
                paddingHorizontal: 12,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: '#000000',
                backgroundColor: watching ? '#000000' : '#FFFFFF',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: watching ? '#FFFFFF' : '#000000' }}>
                {watching ? 'In your brief' : 'Watch'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <ErrorCard message={error} /> : null}
        {!data && !error ? <ListSkeleton rows={5} /> : null}

        {data ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text style={[type.title, { fontSize: 26 }]}>{ticker}</Text>
              {data.snapshot ? (
                <>
                  <Text style={[type.h3, { fontVariant: ['tabular-nums'] }]}>{fmtPrice(data.snapshot.close)}</Text>
                  <ChangeBadge pct={data.snapshot.change_pct} small />
                </>
              ) : null}
            </View>
            {data.snapshot ? <Text style={type.micro}>Close on {dayLabel(data.snapshot.date)}</Text> : null}
            {cover ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                {data.preparing?.state === 'running' ? <Spinner size={11} color="#000000" /> : null}
                <Text style={type.micro}>
                  {data.preparing?.state === 'running'
                    ? data.preparing.message
                    : `${LEVEL_TEXT[cover.level]} · ${cover.chunks.transcripts ? 'call transcripts' : 'no transcripts'}${cover.chunks.annual_reports ? ', annual report' : ''}${cover.chunks.results ? ', results presentation' : ''}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {data?.available === false ? (
          <View style={{ borderWidth: 1, borderColor: colors.border, borderTopWidth: 2, borderTopColor: '#000000', padding: 16 }}>
            <Text style={type.h2}>No data for {ticker}</Text>
            <Text style={[type.body, { color: colors.muted, marginTop: 6 }]}>
              FINN found no listed quote or filings for this symbol. Check the NSE or BSE ticker and try again.
            </Text>
          </View>
        ) : null}

        {data && data.available !== false ? (
          <View>
            <SectionHeader title="Promise ledger" hint={ledger ? `${ledger.calls.length} calls` : undefined} />
            {!ledger && !ledgerError ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 10 }}>
                <Spinner size={12} color="#000000" />
                <Text style={type.small}>Reading management's commitments from recent calls…</Text>
              </View>
            ) : null}
            {ledgerError ? <Text style={type.small}>{ledgerError}</Text> : null}
            {ledger ? (
              <View style={{ borderTopWidth: 2, borderTopColor: '#000000' }}>
                <Text style={[type.body, { fontWeight: '600', paddingVertical: 10 }]}>{ledger.summary}</Text>
                {judged.map((r, i) => (
                  <LedgerCard key={`j${i}`} row={r} />
                ))}
                {tracked.length ? (
                  <>
                    <Text style={[type.micro, { marginTop: 12, marginBottom: 2 }]}>
                      OTHER STATED TARGETS · not checkable from reported quarterly numbers
                    </Text>
                    {visibleTracked.map((r, i) => (
                      <LedgerCard key={`t${i}`} row={r} compact />
                    ))}
                    {tracked.length > 3 ? (
                      <Pressable onPress={() => setShowAll((s) => !s)} style={{ minHeight: 44, justifyContent: 'center' }}>
                        <Text style={[type.small, { color: '#000000', fontWeight: '600' }]}>
                          {showAll ? 'Show fewer' : `Show all ${tracked.length}`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
                {ledger.numbers_source ? (
                  <Text style={[type.micro, { marginTop: 8 }]}>Delivered figures: {ledger.numbers_source}.</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {data && data.available !== false ? (
          <View>
            <SectionHeader title="Your watchpoints" hint={`${points.length}`} />
            <Text style={[type.micro, { marginBottom: 6 }]}>
              Conditions that would change your view. FINN ties new filings for {ticker} to them.
            </Text>
            {points.map((w) => (
              <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[type.body, { flex: 1 }]}>{w.text}</Text>
                {w.origin === 'drafted' ? <Text style={[type.micro, { marginRight: 8 }]}>drafted</Text> : null}
                <Pressable onPress={() => removePoint(w.id)} accessibilityRole="button" accessibilityLabel={`Remove ${w.text}`} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, color: colors.muted }}>×</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={addPoint}
                placeholder="e.g. Net debt below 1x EBITDA"
                placeholderTextColor={colors.muted}
                accessibilityLabel="New watchpoint"
                style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 10, fontSize: 14, color: colors.text }}
              />
              <Pressable onPress={addPoint} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#000000' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {data && data.quarterly.length ? (
          <View>
            <SectionHeader title="Revenue and EBITDA margin" hint="last 8 quarters" />
            <View style={{ borderWidth: 1, borderColor: colors.border, padding: 12 }}>
              <RevenueChart quarterly={data.quarterly} />
            </View>
            <SourceLine
              facts={{
                source: data.quarterly[data.quarterly.length - 1].source,
                is_illustrative: data.quarterly.some((q) => q.source === 'illustrative_snapshot'),
              }}
            />
          </View>
        ) : null}

        {data && data.filings.length ? (
          <View>
            <SectionHeader title="Recent filings" hint={`${data.filings.length}`} />
            {data.filings.map((f) => (
              <View key={f.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[type.small, { color: colors.text }]} numberOfLines={2}>{f.headline}</Text>
                <Text style={type.micro}>{catLabel(f.category)} · {relTime(f.filed_at)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {data && data.available !== false ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#000000' }}>
          <Pressable
            onPress={() => router.push({ pathname: '/chat', params: { ticker, q: `Did ${ticker} deliver what management promised?` } })}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000', opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Ask about {ticker}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function LedgerCard({ row, compact }: { row: LedgerRow; compact?: boolean }) {
  const src = row.promise_source;
  return (
    <Pressable
      onPress={() => openSource(src?.url)}
      disabled={!src?.url}
      accessibilityRole={src?.url ? 'link' : 'text'}
      accessibilityLabel={`${row.metric}, ${row.band}, ${row.status.replace('_', ' ')}. Opens the ${row.period} call transcript.`}
      style={({ pressed }) => ({ paddingVertical: compact ? 8 : 12, borderTopWidth: 1, borderTopColor: colors.border, opacity: pressed ? 0.75 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StatusChip status={row.status} />
        <Text style={[type.small, { color: colors.text, fontWeight: '700', flex: 1 }]} numberOfLines={1}>
          {cap(row.metric)} · {row.band}
        </Text>
        <Text style={type.micro}>{row.period} call</Text>
      </View>
      <Text style={[type.small, { marginTop: 5, fontStyle: 'italic' }]} numberOfLines={compact ? 2 : 3}>
        "{row.quote}"{row.speaker ? ` (${row.speaker})` : ''}
      </Text>
      {row.note ? <Text style={[type.micro, { marginTop: 4, color: colors.text }]}>{row.note}</Text> : null}
      {src?.url ? <Text style={[type.micro, { marginTop: 3 }]}>Source: {src.period} call transcript ›</Text> : null}
    </Pressable>
  );
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
