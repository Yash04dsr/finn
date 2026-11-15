/**
 * BRIEF — the investor's two-minute decision pass.
 * One material item in focus, a verdict to clear it, the rest waiting below,
 * and an explicit end state. Routine filings are counted, not shown.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { api, ApiError, getBaseUrl } from '../../../lib/api';
import { colors, type } from '../../../lib/theme';
import { catLabel } from '../../../lib/format';
import type { AnnouncementPayload, Brief, BriefItem, Verdict } from '../../../lib/types';
import { Wordmark } from '../../../components/Wordmark';
import { CompactRow, FocusCard, VERDICT_LABEL, VerdictBar, headlineOf } from '../../../components/brief';
import { ErrorCard, ListSkeleton, SectionHeader } from '../../../components/ui';

const WINDOWS: { label: string; hours: number }[] = [
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
];

interface Toast {
  text: string;
  action?: { label: string; run: () => void };
}

export default function BriefScreen() {
  const params = useLocalSearchParams<{ alert?: string }>();
  const [hours, setHours] = useState(24);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showBackground, setShowBackground] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (h: number, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setBrief(await api.brief(h));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Network request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  useFocusEffect(
    useCallback(() => {
      void load(hours, true);
      return () => {
        void Speech.stop();
        setSpeaking(false);
      };
    }, [hours, load]),
  );

  useEffect(() => {
    if (params.alert) router.push({ pathname: '/alert/[id]', params: { id: params.alert } });
  }, [params.alert]);

  const queue = brief?.material ?? [];
  const focus = useMemo(
    () => queue.find((i) => i.id === focusId) ?? queue[0] ?? null,
    [queue, focusId],
  );
  const waiting = queue.filter((i) => i.id !== focus?.id);
  const total = queue.length + (brief?.done.filter((d) => d.priority <= 1).length ?? 0);
  const position = total - queue.length + 1;

  // Reaching the end of the brief counts as having looked.
  useEffect(() => {
    if (brief && queue.length === 0) void api.briefSeen().catch(() => undefined);
  }, [brief, queue.length]);

  const showToast = (t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const decide = async (item: BriefItem, verdict: Verdict) => {
    if (busy) return;
    setBusy(true);
    // Clear it from the queue straight away; the server call confirms it.
    setBrief((b) =>
      b && {
        ...b,
        material: b.material.filter((i) => i.id !== item.id),
        done: [{ ...item, verdict }, ...b.done],
      },
    );
    setFocusId(null);
    try {
      await api.verdict(item.id, verdict);
      const category = (item.payload as Partial<AnnouncementPayload>).category;
      if (verdict === 'changes_story') {
        router.push({ pathname: '/alert/[id]', params: { id: String(item.id) } });
      } else if (verdict === 'no_impact' && category && item.kind === 'announcement') {
        showToast({
          text: `${item.ticker} marked No impact`,
          action: {
            label: `Show fewer ${catLabel(category).toLowerCase()} filings`,
            run: async () => {
              await api.verdict(item.id, 'no_impact', true).catch(() => undefined);
              showToast({ text: `${catLabel(category)} filings now rank lower` });
              void load(hours, true);
            },
          },
        });
      } else {
        showToast({ text: `${item.ticker} marked ${VERDICT_LABEL[verdict]}` });
      }
    } catch {
      showToast({ text: 'Could not save that decision. Pull down to refresh and try again.' });
      void load(hours, true);
    } finally {
      setBusy(false);
    }
  };

  const listen = async () => {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    if (!brief) return;
    setSpeaking(true);
    Speech.speak(spokenBrief(brief), {
      language: 'en-IN',
      rate: 1.0,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Wordmark />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load(hours)} tintColor="#000000" />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {WINDOWS.map((w) => {
            const active = w.hours === hours;
            return (
              <Pressable
                key={w.hours}
                onPress={() => setHours(w.hours)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Last ${w.label}`}
                style={{ minHeight: 48, paddingHorizontal: 13, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: active ? '#000000' : colors.muted }}>
                  {w.label}
                </Text>
                <View style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 2, backgroundColor: active ? '#000000' : 'transparent' }} />
              </Pressable>
            );
          })}
          <Pressable
            onPress={listen}
            disabled={!brief}
            accessibilityRole="button"
            accessibilityLabel={speaking ? 'Stop reading the brief' : 'Listen to the brief'}
            style={({ pressed }) => ({
              marginLeft: 'auto',
              minHeight: 40,
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#000000',
              backgroundColor: speaking ? '#000000' : '#FFFFFF',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: speaking ? '#FFFFFF' : '#000000' }}>
              {speaking ? 'Stop' : 'Listen'}
            </Text>
          </Pressable>
        </View>

        {error ? (
          <ErrorCard
            message={error}
            hint={`FINN could not reach ${getBaseUrl()}. Check the connection and pull down to retry.`}
          />
        ) : loading && !brief ? (
          <ListSkeleton rows={5} />
        ) : brief ? (
          <>
            {brief.is_sample ? (
              <Text style={[type.micro, { marginTop: 4, marginBottom: 2 }]}>
                Sample day for the demo. Live NSE filings replace it on the evening run.
              </Text>
            ) : null}
            <Text style={[type.small, { marginTop: 6, marginBottom: 12, color: colors.text }]}>
              {queue.length
                ? `${queue.length} to decide${brief.new_since_last_look ? `, ${brief.new_since_last_look} new since you last looked` : ''}. ${brief.worth_a_look.length} worth a look. ${brief.routine_count} routine filings hidden.`
                : `Nothing left to decide. ${brief.worth_a_look.length} worth a look, ${brief.routine_count} routine filings hidden.`}
            </Text>

            {focus ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={type.micro}>DECIDE {Math.min(position, total)} OF {total}</Text>
                  <Text style={type.micro}>Swipe left: no impact. Right: watch.</Text>
                </View>
                <Swipe key={focus.id} onLeft={() => decide(focus, 'no_impact')} onRight={() => decide(focus, 'watch')}>
                  <FocusCard
                    item={focus}
                    onOpen={() => router.push({ pathname: '/alert/[id]', params: { id: String(focus.id) } })}
                  />
                </Swipe>
                <VerdictBar busy={busy} onVerdict={(v) => decide(focus, v)} />
              </>
            ) : (
              <DoneCard brief={brief} />
            )}

            {waiting.length ? (
              <View style={{ marginTop: 22 }}>
                <SectionHeader title="Up next" hint={`${waiting.length}`} />
                {waiting.map((i) => (
                  <CompactRow key={i.id} item={i} onPress={() => setFocusId(i.id)} />
                ))}
              </View>
            ) : null}

            {brief.worth_a_look.length ? (
              <View style={{ marginTop: 22 }}>
                <SectionHeader title="Worth a look" hint={`${brief.worth_a_look.length}`} />
                {brief.worth_a_look.map((i) => (
                  <CompactRow
                    key={i.id}
                    item={i}
                    onPress={() => router.push({ pathname: '/alert/[id]', params: { id: String(i.id) } })}
                  />
                ))}
              </View>
            ) : null}

            {brief.background.length ? (
              <View style={{ marginTop: 22 }}>
                <Pressable
                  onPress={() => setShowBackground((s) => !s)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showBackground }}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <SectionHeader
                    title={`Background · ${brief.background.length}`}
                    hint={showBackground ? 'Hide' : 'Show'}
                  />
                </Pressable>
                {showBackground
                  ? brief.background.map((i) => (
                      <CompactRow
                        key={i.id}
                        item={i}
                        onPress={() => router.push({ pathname: '/alert/[id]', params: { id: String(i.id) } })}
                      />
                    ))
                  : (
                    <Text style={type.micro}>Dividends, notices and press releases that do not need a decision.</Text>
                  )}
              </View>
            ) : null}

            {brief.done.length ? (
              <View style={{ marginTop: 22 }}>
                <SectionHeader title="Decided" hint={`${brief.done.length}`} />
                {brief.done.map((i) => (
                  <CompactRow
                    key={i.id}
                    item={i}
                    right={i.verdict ? VERDICT_LABEL[i.verdict] : undefined}
                    onPress={() => router.push({ pathname: '/alert/[id]', params: { id: String(i.id) } })}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {toast ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 12,
            backgroundColor: '#000000',
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 6,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13.5 }}>{toast.text}</Text>
          {toast.action ? (
            <Pressable
              onPress={() => {
                const run = toast.action?.run;
                setToast(null);
                run?.();
              }}
              accessibilityRole="button"
              style={{ minHeight: 36, justifyContent: 'center' }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' }}>
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DoneCard({ brief }: { brief: Brief }) {
  const decided = brief.done.length;
  const changes = brief.done.filter((d) => d.verdict === 'changes_story').length;
  const watch = brief.done.filter((d) => d.verdict === 'watch').length;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderTopWidth: 2, borderTopColor: '#000000', padding: 18 }}>
      <Text style={type.h2}>You are done for this window.</Text>
      <Text style={[type.body, { marginTop: 6, color: colors.muted }]}>
        {decided
          ? `${decided} decided: ${changes} changed the story, ${watch} to watch, ${decided - changes - watch} with no impact.`
          : 'No filing or price move crossed your lines in this window.'}
      </Text>
      <Text style={[type.micro, { marginTop: 10 }]}>
        Pick a longer window above to look further back, or ask FINN about any company.
      </Text>
    </View>
  );
}

/** Horizontal swipe on the focus card with a tap fallback in the verdict bar. */
function Swipe({ children, onLeft, onRight }: { children: React.ReactNode; onLeft: () => void; onRight: () => void }) {
  const x = useRef(new Animated.Value(0)).current;
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => x.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -110) {
          Animated.timing(x, { toValue: -500, duration: 160, useNativeDriver: true }).start(onLeft);
        } else if (g.dx > 110) {
          Animated.timing(x, { toValue: 500, duration: 160, useNativeDriver: true }).start(onRight);
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current;
  const rotate = x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-4deg', '0deg', '4deg'] });
  return (
    <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: x }, { rotate }] }}>
      {children}
    </Animated.View>
  );
}

/** A short spoken version of the brief for the commute. */
function spokenBrief(brief: Brief): string {
  const items = brief.material;
  if (!items.length) {
    return `Nothing needs a decision in this window. ${brief.routine_count} routine filings were hidden.`;
  }
  const lines = items.slice(0, 6).map((i, n) => {
    const p = i.payload as Partial<AnnouncementPayload>;
    const facts = p.facts?.rows
      ?.filter((r) => r.label === 'Revenue' || r.label === 'PAT')
      .filter((r) => r.yoy_pct != null)
      .map((r) => `${r.label === 'PAT' ? 'profit' : 'revenue'} ${r.yoy_pct! >= 0 ? 'up' : 'down'} ${Math.abs(r.yoy_pct!).toFixed(0)} percent on the year`)
      .join(', ');
    return `${n === 0 ? 'First' : 'Next'}, ${i.ticker}. ${headlineOf(i)}.${facts ? ` ${facts}.` : ''} This bears on ${i.touches}.`;
  });
  const more = items.length > 6 ? ` And ${items.length - 6} more in the app.` : '';
  return `${items.length} items need a decision. ${lines.join(' ')}${more} ${brief.routine_count} routine filings were hidden.`;
}
