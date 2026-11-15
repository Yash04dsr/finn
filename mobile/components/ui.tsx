/**
 * Shared UI primitives: chips, badges, skeletons, section headers,
 * error/empty cards, inline SVG icons (no icon-font dependency).
 */
import React, { useEffect, useState } from 'react';
import { Text, View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors, radius, type } from '../lib/theme';
import { catLabel } from '../lib/format';

// --- Chips & badges -------------------------------------------------------------

export function CategoryChip({ label, small }: { label: string; small?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: small ? 7 : 9,
        paddingVertical: small ? 3 : 4,
        borderRadius: 0,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: '#FFFFFF',
      }}
    >
      <Text
        style={{
          fontSize: small ? 10 : 10.5,
          color: colors.text,
          fontWeight: '600',
          letterSpacing: 0.9,
          textTransform: 'uppercase',
        }}
      >
        {catLabel(label)}
      </Text>
    </View>
  );
}

export function ChangeBadge({ pct, small }: { pct: number | null; small?: boolean }) {
  const v = pct ?? 0;
  const pos = v > 0;
  const flat = Math.abs(v) < 0.005;
  const bg = flat ? 'rgba(0,0,0,0.04)' : pos ? 'rgba(30,107,79,0.10)' : colors.redDim;
  const fg = flat ? colors.muted : pos ? colors.pos : colors.neg;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 0,
        paddingHorizontal: small ? 6 : 8,
        paddingVertical: 3,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {!flat && (
        <Text style={{ color: fg, fontSize: small ? 10 : 11, marginRight: 2, marginTop: -1 }}>
          {pos ? '▲' : '▼'}
        </Text>
      )}
      <Text style={{ color: fg, fontSize: small ? 11 : 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {(v > 0 ? '+' : '') + v.toFixed(1) + '%'}
      </Text>
    </View>
  );
}

export function TickerBadge({ ticker }: { ticker: string; size?: number }) {
  return (
    <View
      style={{
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: '#000000',
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11, letterSpacing: 0.6 }}>
        {ticker}
      </Text>
    </View>
  );
}

export function PctChip({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  const pos = v >= 0;
  return (
    <View
      style={{
        backgroundColor: pos ? 'rgba(30,107,79,0.10)' : colors.redDim,
        borderRadius: 0,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'], color: pos ? colors.pos : colors.neg }}>
        {label} {(v > 0 ? '+' : '') + v.toFixed(1) + '%'}
      </Text>
    </View>
  );
}

// --- Skeletons ------------------------------------------------------------------

export function Skeleton({ w, h, style }: { w?: number | `${number}%`; h?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = usePulse();
  return (
    <View
      style={[
        {
          width: w ?? '100%' as const,
          height: h ?? 14,
          borderRadius: 7,
          backgroundColor: colors.skeleton,
          opacity,
        },
        style,
      ]}
    />
  );
}

function usePulse(): number {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setOn((o) => !o), 620);
    return () => clearInterval(t);
  }, []);
  return on ? 1 : 0.45;
}

export function ListSkeleton({ rows = 6, rowH = 76 }: { rows?: number; rowH?: number }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: (rowH - 44) / 2,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Skeleton w={34} h={34} style={{ borderRadius: 15 }} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton w="70%" h={13} />
            <Skeleton w="45%" h={11} style={{ marginTop: 8 }} />
          </View>
          <Skeleton w={48} h={12} />
        </View>
      ))}
    </View>
  );
}

// --- Section header ---------------------------------------------------------------

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', color: colors.muted }}>{title}</Text>
      {hint ? <Text style={type.micro}>{hint}</Text> : null}
    </View>
  );
}

// --- Status cards -----------------------------------------------------------------

export function ErrorCard({ message, hint }: { message: string; hint?: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        borderTopWidth: 2,
        borderTopColor: '#000000',
        padding: 16,
      }}
    >
      <Text style={[type.h3, { color: colors.red, marginBottom: 6 }]}>Couldn't reach FINN</Text>
      <Text style={[type.small, { marginBottom: 10 }]}>{message}</Text>
      {hint ? <Text style={[type.micro, { color: colors.faint, lineHeight: 16 }]}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyCard({ title, body }: { title: string; body?: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        borderTopWidth: 2,
        borderTopColor: '#000000',
        padding: 20,
        alignItems: 'center',
      }}
    >
      <Text style={[type.h3, { marginBottom: 6 }]}>{title}</Text>
      {body ? <Text style={[type.small, { textAlign: 'center' }]}>{body}</Text> : null}
    </View>
  );
}

// --- Inline SVG icons ---------------------------------------------------------------

type IconProps = { size?: number; color?: string; focused?: boolean };

function TabGlyph({ size = 22, color, focused, d }: IconProps & { d: string }) {
  const c = color ?? (focused ? '#000000' : '#808080');
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={c} strokeWidth={focused ? 2 : 1.5} strokeLinecap="square" strokeLinejoin="miter" />
    </Svg>
  );
}

export function FeedIcon(props: IconProps) {
  return <TabGlyph {...props} d="M3 11.25 12 3.75l9 7.5M5.25 10.5V20.25H10.5v-6h3v6h5.25V10.5" />;
}

export function ChatIcon(props: IconProps) {
  return (
    <TabGlyph
      {...props}
      d="M4.5 5.25h15a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75H12l-4.5 3.75V15.75H4.5a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75Z"
    />
  );
}

export function CompaniesIcon(props: IconProps) {
  return (
    <TabGlyph
      {...props}
      d="M4.5 20.25V6.75a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v13.5M13.5 10.5h4.5a1.5 1.5 0 0 1 1.5 1.5v8.25M3 20.25h18M7.5 9h1.5M7.5 12.75H9M7.5 16.5H9"
    />
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <TabGlyph
      {...props}
      d="M10.34 3.94a1.5 1.5 0 0 1 2.32 0l.9 1.1c.32.4.83.58 1.32.47l1.4-.31a1.5 1.5 0 0 1 1.64.68l.1.18a1.5 1.5 0 0 1-.1 1.72l-.87 1.1a1.5 1.5 0 0 0-.3 1.08l.13 1.43a1.5 1.5 0 0 1-.87 1.5l-.17.08a1.5 1.5 0 0 1-1.7-.32l-.98-1a1.5 1.5 0 0 0-2.12 0l-.98 1a1.5 1.5 0 0 1-1.7.32l-.17-.08a1.5 1.5 0 0 1-.87-1.5l.13-1.43a1.5 1.5 0 0 0-.3-1.08l-.87-1.1a1.5 1.5 0 0 1-.1-1.72l.1-.18a1.5 1.5 0 0 1 1.64-.68l1.4.31c.49.11 1-.07 1.32-.47l.9-1.1ZM12 15.75V21"
    />
  );
}

export function ChevronRight({ size = 14, color = colors.faint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SendIcon({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3.5 11.2 20 4l-4.6 16.5-4.3-6.2-7.6-3.1Z" stroke={color} strokeWidth="1.9" strokeLinejoin="round" fill={color} fillOpacity={0.15} />
      <Path d="M11.1 14.3 20 4" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}

export function StopIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="6" width="12" height="12" rx="2.5" fill={color} />
    </Svg>
  );
}

/** Tiny spinner used in buttons and status rows. */
export function Spinner({ size = 16, color = colors.accent }: { size?: number; color?: string }) {
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDeg((d) => (d + 45) % 360), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ transform: [{ rotate: `${deg}deg` }], width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="8" stroke={color} strokeOpacity={0.25} strokeWidth="2.6" />
        <Path d="M20 12a8 8 0 0 0-8-8" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
