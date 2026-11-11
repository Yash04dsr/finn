/**
 * CHAT — SSE streaming with expo/fetch, tool-activity chips, thinking trace,
 * markdown-lite answers with citation chips, graceful non-stream fallback.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  Text,
  TextInput,
  View,
  ScrollViewInstance,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatOnce, getBaseUrl, streamChat } from '../../../lib/api';
import { colors, radius, type } from '../../../lib/theme';
import type { ChatFrame } from '../../../lib/types';
import { MarkdownLite } from '../../../components/MarkdownLite';
import { SendIcon, Spinner, StopIcon } from '../../../components/ui';

interface Msg {
  id: string;
  role: 'user' | 'finn';
  text: string;
  citations?: string[];
  pending?: boolean;
  streamFailed?: boolean;
}

const SUGGESTIONS_BASE = [
  'Narrative vs numbers',
  'Bull vs bear case',
  'What did management guide?',
  'Cash quality check',
];

let msgSeq = 0;
const nextId = () => `m${++msgSeq}-${Date.now().toString(36)}`;

export default function ChatScreen() {
  const params = useLocalSearchParams<{ ticker?: string; filing?: string }>();
  const ticker = typeof params.ticker === 'string' ? params.ticker : undefined;
  const filingId = params.filing ? Number(params.filing) : undefined;
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [toolChips, setToolChips] = useState<string[]>([]);
  const [thinking, setThinking] = useState<string[]>([]);
  const [showThinking, setShowThinking] = useState(true);
  const [sessionId, setSessionId] = useState<string>('');
  const [tickerContext, setTickerContext] = useState<string | undefined>(ticker);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<RNScrollView | null>(null) as React.MutableRefObject<ScrollViewInstance | null>;

  // Stable per-install chat session id.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { getOrCreateSessionId } = await import('../../../lib/store');
      const id = await getOrCreateSessionId();
      if (alive) setSessionId(id);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Query-param context: prefill (not auto-send) a filing question.
  useEffect(() => {
    if (prefilled) return;
    if (ticker) {
      setTickerContext(ticker);
      if (filingId) {
        setInput(`What should I know about the latest ${ticker} filing?`);
      }
      setPrefilled(true);
    }
  }, [ticker, filingId, prefilled]);

  const suggestions = SUGGESTIONS_BASE;

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setInput('');
      setError(null);
      setToolChips([]);
      setThinking([]);
      setShowThinking(true);

      const userMsg: Msg = { id: nextId(), role: 'user', text };
      const finnId = nextId();
      const finnMsg: Msg = { id: finnId, role: 'finn', text: '', pending: true };
      setMessages((m) => [...m, userMsg, finnMsg]);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const appendFinn = (patch: (m: Msg) => Msg) =>
        setMessages((m) => m.map((x) => (x.id === finnId ? patch(x) : x)));

      const onFrame = (f: ChatFrame) => {
        if (f.type === 'tool') {
          const name = (f.tool_name || 'tool').replace(/_/g, ' ');
          setToolChips((c) => (c.includes(name) ? c : [...c, name]));
        } else if (f.type === 'thinking') {
          if (f.content) setThinking((t) => [...t, f.content as string]);
        } else if (f.type === 'model') {
          if (f.content) appendFinn((m) => ({ ...m, text: m.text + f.content }));
        } else if (f.type === 'final') {
          appendFinn((m) => ({
            ...m,
            text: f.content ?? m.text,
            pending: false,
            citations: extractCitations(f.content ?? m.text),
          }));
        } else if (f.type === 'error') {
          appendFinn((m) => ({
            ...m,
            pending: false,
            text: m.text || `FINN hit an error: ${f.content ?? 'unknown'}`,
            streamFailed: true,
          }));
        }
      };

      try {
        const result = await streamChat(
          { message: text, session_id: sessionId || undefined, ticker: tickerContext, filing_id: filingId },
          { onFrame, signal: ctrl.signal },
        );
        if (result === 'fallback') {
          // Graceful degradation: plain POST, render only the final answer.
          const frames = await chatOnce(
            { message: text, session_id: sessionId || undefined, ticker: tickerContext, filing_id: filingId },
            ctrl.signal,
          );
          for (const f of frames) onFrame(f);
          if (!frames.some((f) => f.type === 'final' || f.type === 'error')) {
            appendFinn((m) => ({ ...m, pending: false, text: m.text || 'No answer received.' }));
          }
        }
        // Ensure pending cleared even if server never sent final.
        setMessages((ms) =>
          ms.map((m) =>
            m.id === finnId && !m.text && m.pending
              ? { ...m, pending: false, text: 'No answer received from FINN.', streamFailed: true }
              : m,
          ),
        );
      } catch (e) {
        appendFinn((m) =>
          m.pending
            ? {
                ...m,
                pending: false,
                text: `Cannot reach the backend at ${getBaseUrl()}.`,
                streamFailed: true,
              }
            : m,
        );
        setError(e instanceof Error ? e.message : 'request failed');
      } finally {
        setStreaming(false);
        setToolChips([]);
        abortRef.current = null;
      }
    },
    [streaming, sessionId, tickerContext, filingId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages((ms) =>
      ms.map((m) => (m.pending ? { ...m, pending: false, text: m.text || 'Stopped.' } : m)),
    );
  }, []);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, thinking.length, toolChips.length]);

  const empty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* header */}
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 16,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={type.title}>FINN</Text>
            {tickerContext ? (
              <Pressable
                onPress={() => setTickerContext(undefined)}
                style={{
                  backgroundColor: colors.accentDim,
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 11.5, fontWeight: '700' }}>
                  {tickerContext}
                </Text>
                <Text style={{ color: colors.accent, fontSize: 12 }}>×</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={type.micro}>{streaming ? 'researching…' : 'research agent'}</Text>
        </View>
      </View>

      {/* messages */}
      <RNScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {empty ? (
          <View style={{ paddingTop: 10, gap: 12 }}>
            <Text style={[type.small, { lineHeight: 19 }]}>
              Ask about filings, results, guidance, or cash quality. FINN reads transcripts,
              filings, and the fact sheet before answering.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(tickerContext
                ? suggestions.map((s) => (s.includes('{ticker}') ? s.replace('{ticker}', tickerContext) : `${s} · ${tickerContext}`))
                : suggestions
              ).map((s) => (
                <SuggestionChip key={s} label={s} onPress={() => send(s)} />
              ))}
            </View>
            {filingId ? (
              <Text style={type.micro}>
                Context: filing #{filingId} · prefill your question below and press send.
              </Text>
            ) : null}
          </View>
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} ticker={tickerContext} />)
        )}

        {/* streaming status */}
        {streaming ? (
          <View style={{ gap: 8 }}>
            {toolChips.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {toolChips.map((t, i) => (
                  <ToolChip key={`${t}-${i}`} label={t} active={i === toolChips.length - 1} />
                ))}
              </View>
            ) : null}
            {thinking.length > 0 && showThinking ? (
              <Pressable onPress={() => setShowThinking(false)}>
                <View
                  style={{
                    backgroundColor: colors.surface2,
                    borderLeftWidth: 2,
                    borderLeftColor: colors.borderStrong,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: radius.sm,
                  }}
                >
                  {thinking.slice(-3).map((t, i) => (
                    <Text
                      key={i}
                      style={{ color: colors.muted, fontStyle: 'italic', fontSize: 12, lineHeight: 17 }}
                      numberOfLines={3}
                    >
                      {t.trim()}
                    </Text>
                  ))}
                  <Text style={{ color: colors.faint, fontSize: 10.5, marginTop: 4 }}>
                    tap to collapse
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {error && !streaming ? (
          <Text style={[type.micro, { color: colors.red }]}>{error}</Text>
        ) : null}
      </RNScrollView>

      {/* composer */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 12) + 2,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={tickerContext ? `Ask about ${tickerContext}…` : 'Ask FINN…'}
            placeholderTextColor={colors.faint}
            multiline
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.lg,
              paddingHorizontal: 13,
              paddingTop: 10,
              paddingBottom: 10,
              color: colors.text,
              fontSize: 14.5,
              maxHeight: 110,
            }}
          />
          {streaming ? (
            <Pressable
              onPress={stop}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <StopIcon size={15} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void send(input)}
              disabled={!input.trim()}
              style={({ pressed }) => ({
                opacity: !input.trim() ? 0.4 : pressed ? 0.85 : 1,
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <SendIcon size={18} color="#04130C" />
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// --- Pieces -----------------------------------------------------------------------

function SuggestionChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.75 : 1,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      })}
    >
      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

function ToolChip({ label, active }: { label: string; active: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.accentDim : colors.border,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      {active ? <Spinner size={11} /> : <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent }} />}
      <Text style={{ color: colors.muted, fontSize: 11.5 }}>
        {label.includes('search') ? `searching ${label.replace('search', 'transcripts').trim()}…` : `${label}…`}
      </Text>
    </View>
  );
}

function Bubble({ msg, ticker }: { msg: Msg; ticker?: string }) {
  if (msg.role === 'user') {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.accent,
            borderRadius: 16,
            borderBottomRightRadius: 5,
            paddingHorizontal: 13,
            paddingVertical: 9,
            maxWidth: '85%',
          }}
        >
          <Text style={{ color: '#04130C', fontSize: 14.5, lineHeight: 20 }}>{msg.text}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 16,
          borderBottomLeftRadius: 5,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 13,
          paddingVertical: 10,
          maxWidth: '88%',
        }}
      >
        {msg.text ? (
          <MarkdownLite text={msg.text} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Spinner size={13} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>reading sources…</Text>
          </View>
        )}
        {msg.citations && msg.citations.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {msg.citations.map((c, i) => (
              <CitationChip label={c} key={i} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function CitationChip({ label }: { label: string }) {
  return (
    <View
      style={{
        backgroundColor: 'rgba(16,185,129,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.25)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        maxWidth: '100%',
      }}
    >
      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Split the SOURCES section out of a final answer. */
function extractCitations(text: string): string[] {
  const idx = text.search(/^SOURCES:?\s*$/im);
  if (idx === -1) return [];
  const head = text.slice(0, idx).trim();
  void head;
  const tail = text.slice(idx).replace(/^SOURCES:?\s*$/im, '');
  return tail
    .split('\n')
    .map((l) => l.replace(/^[\s\-•*\d.)]+/, '').trim())
    .filter((l) => l.length > 2)
    .slice(0, 8);
}
