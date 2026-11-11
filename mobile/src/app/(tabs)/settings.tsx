/**
 * SETTINGS — backend URL, alert thresholds (sliders), category watchlist,
 * quiet hours, push registration, demo pipeline, cost dashboard.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { api, getBaseUrl, setBaseUrl, ApiError } from '../../../lib/api';
import { colors, radius, type } from '../../../lib/theme';
import type { Costs, Settings as SettingsT } from '../../../lib/types';
import { DEFAULT_BASE_URL, loadBaseUrl, saveBaseUrl } from '../../../lib/store';
import { fmtTokens, isValidHHMM } from '../../../lib/format';
import { ErrorCard, SectionHeader, Skeleton, Spinner } from '../../../components/ui';

const CATEGORIES = [
  'results',
  'M&A',
  'fund_raise',
  'management_change',
  'litigation',
  'insider_trading',
  'earnings_call',
  'investor_meetings',
  'credit_rating',
  'dividend',
  'bonus_split',
  'capex',
  'press_release',
  'postal_ballot',
  'agm_egm',
  'pledging',
  'unclassified',
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  // backend url
  const [urlDraft, setUrlDraft] = useState(DEFAULT_BASE_URL);
  const [activeUrl, setActiveUrl] = useState(DEFAULT_BASE_URL);
  const [urlSaved, setUrlSaved] = useState(false);

  // settings
  const [settings, setSettings] = useState<SettingsT | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // push
  const [pushState, setPushState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [pushMsg, setPushMsg] = useState<string>('');

  // demo
  const [demoState, setDemoState] = useState<'idle' | 'working'>('idle');

  // costs
  const [costs, setCosts] = useState<Costs | null>(null);
  const [costsErr, setCostsErr] = useState<string | null>(null);

  // lan ip hint
  const [lanIp, setLanIp] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const stored = await loadBaseUrl();
      setUrlDraft(stored);
      setActiveUrl(stored);
      setBaseUrl(stored);
    })();
    // best-effort LAN IP for the hint line
    try {
      const iface = (Constants as unknown as { expoConfig?: { hostUri?: string } }).expoConfig?.hostUri;
      const host = iface?.split(':')[0];
      if (host && /^\d+\.\d+\.\d+\.\d+$/.test(host)) setLanIp(host);
    } catch {
      // ignore
    }
  }, []);

  const loadServerState = useCallback(async () => {
    setSettingsErr(null);
    try {
      const [s, c] = await Promise.all([api.getSettings(), api.costs().catch(() => null)]);
      setSettings(s);
      if (c) setCosts(c);
    } catch (e) {
      setSettingsErr(e instanceof ApiError ? e.message : 'Network request failed');
    }
  }, []);

  useEffect(() => {
    void loadServerState();
  }, [loadServerState]);

  const commitUrl = (raw: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const normalized = await saveBaseUrl(raw);
      setBaseUrl(normalized);
      setActiveUrl(normalized);
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 1600);
      void loadServerState();
    }, 700);
  };

  const pushSettings = useCallback(async (next: SettingsT) => {
    setSettings(next); // optimistic
    setSavingSettings(true);
    try {
      const saved = await api.saveSettings(next);
      setSettings(saved);
    } catch {
      // keep optimistic value; reload on next visit
    } finally {
      setSavingSettings(false);
    }
  }, []);

  const enablePush = async () => {
    setPushState('working');
    setPushMsg('');
    try {
      const existing = await Notifications.getPermissionsAsync();
      let granted = existing.granted;
      if (!granted && existing.canAskAgain) {
        const req = await Notifications.requestPermissionsAsync();
        granted = req.granted;
      }
      if (!granted) {
        setPushState('failed');
        setPushMsg('Notification permission not granted on this device.');
        return;
      }
      const token = await Notifications.getDevicePushTokenAsync();
      const expoToken =
        'data' in token && typeof (token as { data?: string }).data === 'string'
          ? (token as { data: string }).data
          : ((token as unknown as { token?: string }).token ?? '');
      if (!expoToken) {
        setPushState('failed');
        setPushMsg('Could not obtain a push token on this device (emulator?).');
        return;
      }
      await api.pushSubscribe(expoToken);
      setPushState('done');
      setPushMsg('Registered with FINN push service.');
    } catch (e) {
      setPushState('failed');
      setPushMsg(
        e instanceof Error
          ? `Push unavailable here: ${e.message}`
          : 'Push unavailable on this device.',
      );
    }
  };

  const runDemo = () => {
    setDemoState('working');
    api
      .demoRun()
      .then((r) => {
        setDemoState('idle');
        const stats = r.digest_stats as { total?: number; shown?: number; hidden?: number } | undefined;
        Alert.alert(
          'Demo pipeline complete',
          [
            r.mode ? `mode: ${r.mode}` : null,
            r.new_filings != null ? `new filings: ${r.new_filings}` : null,
            stats ? `digest: ${stats.shown ?? 0} shown · ${stats.hidden ?? 0} collapsed` : null,
          ]
            .filter(Boolean)
            .join('\n') || 'ok',
        );
        void loadServerState();
      })
      .catch((e) => {
        setDemoState('idle');
        Alert.alert('Demo run failed', e instanceof ApiError ? e.message : 'Network request failed');
      });
  };

  const patchSettings = (patch: Partial<SettingsT>) => {
    if (!settings) return;
    void pushSettings({ ...settings, ...patch });
  };

  const toggleCategory = (cat: string) => {
    if (!settings) return;
    const has = settings.categories_watch.includes(cat);
    patchSettings({
      categories_watch: has
        ? settings.categories_watch.filter((c) => c !== cat)
        : [...settings.categories_watch, cat],
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 120, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={type.title}>Settings</Text>
          {savingSettings ? <Spinner size={13} /> : null}
        </View>

        {/* ---- Backend ---- */}
        <View>
          <SectionHeader title="Backend" hint={urlSaved ? 'saved ✓' : undefined} />
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 13, gap: 8 }}>
            <Text style={type.micro}>API base URL</Text>
            <TextInput
              value={urlDraft}
              onChangeText={(t) => {
                setUrlDraft(t);
                commitUrl(t);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.20:8000"
              placeholderTextColor={colors.faint}
              style={{
                backgroundColor: colors.surface2,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.sm,
                paddingHorizontal: 11,
                paddingVertical: 9,
                color: colors.text,
                fontSize: 13.5,
                fontVariant: ['tabular-nums'],
              }}
            />
            <Text style={[type.micro, { color: colors.faint, lineHeight: 16 }]}>
              Active: {activeUrl}
              {lanIp ? `\nOn device, use your Mac's LAN IP — likely http://${lanIp}:8000` : ''}
            </Text>
          </View>
        </View>

        {/* ---- Alerts ---- */}
        <View>
          <SectionHeader title="Alerts" />
          {settingsErr && !settings ? (
            <ErrorCard message={settingsErr} hint={`Backend: ${getBaseUrl()}`} />
          ) : !settings ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 }}>
              <Skeleton h={14} w="60%" />
              <Skeleton h={34} />
              <Skeleton h={14} w="50%" />
              <Skeleton h={34} />
              <Skeleton h={30} w="80%" />
            </View>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 16 }}>
              {/* volume slider */}
              <View>
                <Text style={[type.h3, { fontSize: 13.5, marginBottom: 2 }]}>
                  Volume &gt; {settings.volume_multiplier.toFixed(1)}× 20-day avg
                </Text>
                <Slider
                  minimumValue={1.5}
                  maximumValue={5}
                  step={0.1}
                  value={settings.volume_multiplier}
                  onSlidingComplete={(v) => patchSettings({ volume_multiplier: Math.round(v * 10) / 10 })}
                  style={{ marginTop: 4 }}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.borderStrong}
                  thumbTintColor={colors.accent}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={type.micro}>1.5×</Text>
                  <Text style={type.micro}>5.0×</Text>
                </View>
              </View>

              {/* price move slider */}
              <View>
                <Text style={[type.h3, { fontSize: 13.5, marginBottom: 2 }]}>
                  |move| &gt; {settings.price_move_pct.toFixed(1)}% in a day
                </Text>
                <Slider
                  minimumValue={1}
                  maximumValue={10}
                  step={0.5}
                  value={settings.price_move_pct}
                  onSlidingComplete={(v) => patchSettings({ price_move_pct: Math.round(v * 10) / 10 })}
                  style={{ marginTop: 4 }}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.borderStrong}
                  thumbTintColor={colors.accent}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={type.micro}>1%</Text>
                  <Text style={type.micro}>10%</Text>
                </View>
              </View>

              {/* categories */}
              <View>
                <Text style={[type.h3, { fontSize: 13.5, marginBottom: 8 }]}>Category watchlist</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {CATEGORIES.map((cat) => {
                    const on = settings.categories_watch.includes(cat);
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => toggleCategory(cat)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.7 : 1,
                          paddingHorizontal: 11,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: on ? colors.accent : colors.borderStrong,
                          backgroundColor: on ? colors.accentDim : 'transparent',
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: on ? colors.accent : colors.muted,
                          }}
                        >
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* quiet hours */}
              <View>
                <Text style={[type.h3, { fontSize: 13.5, marginBottom: 8 }]}>Quiet hours</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <QuietInput
                    value={settings.quiet_hours_start}
                    onCommit={(v) => patchSettings({ quiet_hours_start: v })}
                  />
                  <Text style={type.small}>to</Text>
                  <QuietInput
                    value={settings.quiet_hours_end}
                    onCommit={(v) => patchSettings({ quiet_hours_end: v })}
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ---- Push ---- */}
        <View>
          <SectionHeader title="Push" />
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
            <PrimaryButton
              label={
                pushState === 'working'
                  ? 'Registering…'
                  : pushState === 'done'
                    ? 'Push enabled ✓'
                    : 'Enable push notifications'
              }
              onPress={enablePush}
              disabled={pushState === 'working' || pushState === 'done'}
            />
            {pushMsg ? (
              <Text style={[type.micro, { color: pushState === 'failed' ? colors.amber : colors.accent, lineHeight: 16 }]}>
                {pushMsg}
              </Text>
            ) : (
              <Text style={[type.micro, { color: colors.faint, lineHeight: 16 }]}>
                Registers this device's Expo push token with the backend.
              </Text>
            )}
          </View>
        </View>

        {/* ---- Ops ---- */}
        <View>
          <SectionHeader title="Ops" />
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
            <PrimaryButton
              label={demoState === 'working' ? 'Running pipeline…' : 'Run demo pipeline'}
              onPress={runDemo}
              disabled={demoState === 'working'}
              kind="ghost"
            />
            <Text style={[type.micro, { color: colors.faint, lineHeight: 16 }]}>
              Re-runs ingest → classify → enrich → digest. Safe to run repeatedly.
            </Text>
          </View>
        </View>

        {/* ---- Costs ---- */}
        <View>
          <SectionHeader title="Token costs" hint={costs ? `${fmtTokens(costs.total_tokens)} total` : undefined} />
          {costs ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 }}>
              {/* two-segment tier bar */}
              <View>
                <View style={{ height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.surface2 }}>
                  <View
                    style={{
                      flex: Math.max(costs.by_tier.fast, 0.0001),
                      backgroundColor: colors.accent,
                    }}
                  />
                  <View
                    style={{
                      flex: Math.max(costs.by_tier.reasoning, 0.0001),
                      backgroundColor: colors.amber,
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={type.micro}>fast {fmtTokens(costs.by_tier.fast)}</Text>
                  <Text style={type.micro}>reasoning {fmtTokens(costs.by_tier.reasoning)}</Text>
                </View>
              </View>

              {/* per-scope rows */}
              <View style={{ gap: 8 }}>
                {costs.by_scope_model.map((row) => (
                  <View key={`${row.scope}-${row.model}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[type.small, { flex: 1, color: colors.text }]}>{row.scope}</Text>
                    <Text style={[type.micro, { flex: 1.6, color: colors.faint }]} numberOfLines={1}>
                      {row.model}
                    </Text>
                    <Text style={[type.micro, { width: 58, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>
                      {fmtTokens(row.pt + row.ct)}
                    </Text>
                    <Text style={[type.micro, { width: 44, textAlign: 'right', fontVariant: ['tabular-nums'], color: colors.faint }]}>
                      {row.calls}c
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={[type.micro, { color: colors.faint, fontStyle: 'italic' }]}>
                Smart routing: fast tier for bulk work, reasoning tier for analysis.
              </Text>
            </View>
          ) : costsErr ? (
            <ErrorCard message={costsErr} />
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
              <Skeleton h={12} w="40%" />
              <Skeleton h={10} />
              <Skeleton h={10} w="70%" />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// --- pieces ------------------------------------------------------------------------

function PrimaryButton({
  label,
  onPress,
  disabled,
  kind = 'accent',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: 'accent' | 'ghost';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        backgroundColor: kind === 'accent' ? colors.accent : colors.surface2,
        borderWidth: kind === 'ghost' ? 1 : 0,
        borderColor: colors.borderStrong,
        borderRadius: radius.md,
        paddingVertical: 12,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
      })}
    >
      <Text
        style={{
          color: kind === 'accent' ? '#04130C' : colors.text,
          fontWeight: '700',
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QuietInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const bad = !isValidHHMM(draft);
  return (
    <TextInput
      value={draft}
      onChangeText={(t) => {
        setDraft(t);
        if (isValidHHMM(t)) onCommit(t.trim());
      }}
      onBlur={() => {
        if (!isValidHHMM(draft)) setDraft(value);
      }}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      style={{
        width: 74,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: bad ? colors.amber : colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 8,
        color: colors.text,
        fontSize: 14,
        textAlign: 'center',
        fontVariant: ['tabular-nums'],
      }}
    />
  );
}
