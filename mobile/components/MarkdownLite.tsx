/**
 * Markdown-lite renderer: **bold**, bullets (- / •), paragraphs.
 * Regex-based, zero deps.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { colors } from '../lib/theme';

interface Props {
  text: string;
  /** Inline color variant for use on colored backgrounds. */
  onAccent?: boolean;
}

export function MarkdownLite({ text, onAccent = false }: Props) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  return (
    <View>
      {blocks.map((block, bi) => {
        if (block.kind === 'bullet') {
          return (
            <View key={bi} style={{ flexDirection: 'row', marginTop: bi === 0 ? 0 : 3 }}>
              <Text
                style={{
                  color: onAccent ? 'rgba(6,20,14,0.75)' : colors.accent,
                  fontSize: 14,
                  lineHeight: 20,
                  width: 16,
                }}
              >
                •
              </Text>
              <Text
                style={{
                  flex: 1,
                  fontSize: 14,
                  lineHeight: 20,
                  color: onAccent ? 'rgba(6,20,14,0.92)' : colors.text,
                }}
              >
                {renderInline(block.text, onAccent)}
              </Text>
            </View>
          );
        }
        if (block.kind === 'heading') {
          return (
            <Text
              key={bi}
              style={{
                marginTop: bi === 0 ? 0 : 8,
                marginBottom: 2,
                fontSize: 13.5,
                fontWeight: '700',
                letterSpacing: 0.2,
                color: onAccent ? 'rgba(6,20,14,0.85)' : colors.text,
              }}
            >
              {renderInline(block.text, onAccent)}
            </Text>
          );
        }
        return (
          <Text
            key={bi}
            style={{
              marginTop: bi === 0 ? 0 : 8,
              fontSize: 14,
              lineHeight: 20,
              color: onAccent ? 'rgba(6,20,14,0.92)' : colors.text,
            }}
          >
            {renderInline(block.text, onAccent)}
          </Text>
        );
      })}
    </View>
  );
}

type Block = { kind: 'p' | 'bullet' | 'heading'; text: string };

function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push({ kind: 'p', text: para.join(' ').trim() });
      para = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flush();
      out.push({ kind: 'bullet', text: bullet[1] });
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      flush();
      out.push({ kind: 'heading', text: heading[1] });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

/** Inline **bold** + `code` spans. */
function renderInline(text: string, onAccent: boolean): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <Text key={k++} style={{ fontWeight: '700' }}>
          {m[1]}
        </Text>,
      );
    } else {
      nodes.push(
        <Text
          key={k++}
          style={{
            color: onAccent ? 'rgba(6,20,14,0.9)' : colors.accent,
            backgroundColor: onAccent ? 'rgba(6,20,14,0.08)' : 'rgba(16,185,129,0.10)',
            fontSize: 13,
          }}
        >
          {m[2]}
        </Text>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
