/**
 * ASK — grounded questions about any listed company.
 * Answers come from primary documents; every [n] marker opens the cited source.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  ScrollViewInstance,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatOnce, streamChat } from '../../../lib/api';
import { colors, type } from '../../../lib/theme';
import { openSource } from '../../../lib/open';
import type { ChatFrame, Citation, Receipt } from '../../../lib/types';
import { MarkdownLite } from '../../../components/MarkdownLite';
import { SendIcon, Spinner, StopIcon } from '../../../components/ui';

interface Msg {
  id: string;
  role: 'user' | 'finn';
  text: string;
  citations?: Citation[];
  receipt?: Receipt;
  pending?: boolean;
  failed?: boolean;
}

const STARTERS = [
  'Did Persistent deliver what management promised?',
  'What did Crompton guide for this year?',
  'Bull and bear case for Vedanta from its filings',
  'What moved in my portfolio today?',
];

const DOC_LABEL: Record<string, string> = {
  transcript: 'Call transcript',
  annual_report: 'Annual report',
  results_filing: 'Results presentation',
  metric: 'Reported numbers',
};

let seq = 0;
const nextId = () => `m${++seq}-${Date.now().toString(36)}`;

export default function AskScreen() {
  const params = useLocalSearchParams<{ ticker?: string; filing?: string; q?: string }>();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [ticker, setTicker] = useState<string | undefined>(params.ticker);
  const [filingId, setFilingId] = useState<number | undefined>(params.filing ? Number(params.filing) : undefined);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<RNScrollView | null>(null) as React.MutableRefObject<ScrollViewInstance | null>;

  const newSession = useCallback(async (fresh = false) => {
    const { getOrCreateSessionId } = await import('../../../lib/store');
    const base = await getOrCreateSessionId();
    setSessionId(fresh ? `${base.slice(0, 40)}-${Date.now().toString(36)}` : base);
  }, []);

  useEffect(() => {
    void newSession();
  }, [newSession]);

  // Arriving from an alert: carry its company and filing, and pre-fill the question.
  useEffect(() => {
    if (params.ticker) setTicker(params.ticker);
    if (params.filing) setFilingId(Number(params.filing));
    if (params.q) setInput(params.q);
  }, [params.ticker, params.filing, params.q]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setInput('');
      setStatus('');
      const finnId = nextId();
      setMessages((m) => [...m, { id: nextId(), role: 'user', text }, { id: finnId, role: 'finn', text: '', pending: true }]);
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (fn: (m: Msg) => Msg) => setMessages((ms) => ms.map((x) => (x.id === finnId ? fn(x) : x)));

      const onFrame = (f: ChatFrame) => {
        if (f.type === 'route') {
          if (f.lane === 'research' && f.ticker) {
            setTicker(f.ticker);
            setStatus(`Answering from ${f.ticker}'s filings`);
          }
        } else if (f.type === 'tool' && f.tool_name) {
          setStatus(f.tool_name);
        } else if (f.type === 'final') {
          patch((m) => ({ ...m, text: f.content || m.text, citations: f.citations ?? [], receipt: f.receipt, pending: false }));
        } else if (f.type === 'error') {
          patch((m) => ({ ...m, pending: false, failed: true, text: f.content ?? 'FINN could not answer that.' }));
        }
      };

      const req = { message: text, session_id: sessionId || undefined, ticker, filing_id: filingId };
      try {
        const result = await streamChat(req, { onFrame, signal: ctrl.signal });
        if (result === 'fallback') {
          for (const f of await chatOnce(req, ctrl.signal)) onFrame(f);
        }
      } catch {
        patch((m) => ({ ...m, pending: false, failed: true, text: 'FINN could not be reached. Check the connection and try again.' }));
      } finally {
        setMessages((ms) =>
          ms.map((m) => (m.id === finnId && m.pending ? { ...m, pending: false, failed: true, text: m.text || 'No answer came back. Try again.' } : m)),
        );
        setStreaming(false);
        setStatus('');
        setFilingId(undefined);
        abortRef.current = null;
      }
    },
    [streaming, sessionId, ticker, filingId],
  );

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages((ms) => ms.map((m) => (m.pending ? { ...m, pending: false, text: m.text || 'Stopped.' } : m)));
  };

  const reset = () => {
    stop();
    setMessages([]);
    setTicker(undefined);
    setFilingId(undefined);
    void newSession(true);
  };

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, status]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#000000',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text style={type.title}>FINN</Text>
        {ticker ? (
          <Pressable
            onPress={() => setTicker(undefined)}
            accessibilityRole="button"
            accessibilityLabel={`Asking about ${ticker}. Tap to clear.`}
            style={{ borderWidth: 1, borderColor: '#000000', paddingHorizontal: 8, minHeight: 32, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>{ticker} ×</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={reset}
          accessibilityRole="button"
          accessibilityLabel="Start a new conversation"
          style={{ marginLeft: 'auto', minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600' }}>New</Text>
        </Pressable>
      </View>

      <RNScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {messages.length === 0 ? (
          <View style={{ gap: 4 }}>
            <Text style={[type.body, { color: colors.muted, marginBottom: 6 }]}>
              Ask about any listed company. FINN answers only from its call transcripts, annual reports and results, and links every point to the page it came from.
            </Text>
            {(ticker
              ? [`Did ${ticker} deliver what management promised?`, `What changed in ${ticker}'s latest results?`, `Bull and bear case for ${ticker} from its filings`]
              : STARTERS
            ).map((s) => (
              <Pressable
                key={s}
                onPress={() => void send(s)}
                accessibilityRole="button"
                style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={[type.body, { color: '#000000' }]}>{s} ›</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {streaming && status ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
            <Spinner size={12} color="#000000" />
            <Text style={type.small}>{status}</Text>
          </View>
        ) : null}
      </RNScrollView>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 8,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={ticker ? `Ask about ${ticker}` : 'Ask about a company or your portfolio'}
          placeholderTextColor={colors.muted}
          multiline
          accessibilityLabel="Question"
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.25)',
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            color: colors.text,
          }}
        />
        <Pressable
          onPress={streaming ? stop : () => void send(input)}
          disabled={!streaming && !input.trim()}
          accessibilityRole="button"
          accessibilityLabel={streaming ? 'Stop' : 'Send'}
          style={{
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            opacity: !streaming && !input.trim() ? 0.35 : 1,
          }}
        >
          {streaming ? <StopIcon size={15} color="#FFFFFF" /> : <SendIcon size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: '#000000', paddingHorizontal: 13, paddingVertical: 10 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 21 }}>{msg.text}</Text>
      </View>
    );
  }
  if (msg.pending) {
    return <Text style={[type.small, { color: colors.muted }]}>Reading the documents…</Text>;
  }
  const cites = msg.citations ?? [];
  return (
    <View style={{ gap: 10 }}>
      <MarkdownLite text={msg.text} onCite={(n) => openSource(cites.find((c) => c.n === n)?.url)} />
      {cites.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          {cites.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => openSource(c.url)}
              disabled={!c.url}
              accessibilityRole={c.url ? 'link' : 'text'}
              accessibilityLabel={`Source ${c.n}: ${c.title}`}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ width: 18, fontSize: 12, fontWeight: '700' }}>{c.n}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[type.small, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                  {DOC_LABEL[c.doc_type] ?? 'Document'} · {c.period || c.title}
                </Text>
                {c.excerpt ? (
                  <Text style={type.micro} numberOfLines={2}>"{c.excerpt.replace(/\s+/g, ' ').trim()}"</Text>
                ) : c.provider ? (
                  <Text style={type.micro}>{c.provider === 'screener_live' ? 'Screener quarterly table, compiled from exchange filings' : c.provider}</Text>
                ) : null}
              </View>
              {c.url ? <Text style={[type.micro, { color: '#000000' }]}>Open</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {msg.receipt ? (
        <Text style={[type.micro, { color: colors.muted }]}>
          {msg.receipt.tier === 'cache'
            ? 'Saved answer, documents unchanged · 0 tokens'
            : `${msg.receipt.lane === 'research' ? 'Reasoning model' : 'Fast model'} · ${fmtK(msg.receipt.prompt_tokens + msg.receipt.completion_tokens)} tokens`}
        </Text>
      ) : null}
    </View>
  );
}

function fmtK(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
