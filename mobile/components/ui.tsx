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
        paddingVertical: small ? 2.5 : 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: 'rgba(255,255,255,0.03)',
      }}
    >
      <Text style={{ fontSize: small ? 10.5 : 11.5, color: colors.muted, fontWeight: '600', letterSpacing: 0.2 }}>
        {catLabel(label)}
      </Text>
    </View>
  );
}

export function ChangeBadge({ pct, small }: { pct: number | null; small?: boolean }) {
  const v = pct ?? 0;
  const pos = v > 0;
  const flat = Math.abs(v) < 0.005;
  const bg = flat ? 'rgba(255,255,255,0.06)' : pos ? colors.accentDim : colors.redDim;
  const fg = flat ? colors.muted : pos ? colors.accent : colors.red;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 7,
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

export function TickerBadge({ ticker, size }: { ticker: string; size?: number }) {
  const s = size ?? 34;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2 - 2,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: s * 0.3, letterSpacing: 0.3 }}>
        {ticker.slice(0, 2)}
        {ticker.length > 2 ? '' : ''}
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
        backgroundColor: pos ? colors.accentDim : colors.redDim,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'], color: pos ? colors.accent : colors.red }}>
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
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={[type.h3, { letterSpacing: 0.1 }]}>{title}</Text>
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

export function FeedIcon({ size = 22, color, focused }: IconProps) {
  const c = color ?? (focused ? colors.accent : colors.muted);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="5" rx="2" fill={c} opacity={focused ? 1 : 0.55} />
      <Rect x="3" y="11.5" width="12" height="3.4" rx="1.7" fill={c} opacity={focused ? 0.85 : 0.4} />
      <Rect x="3" y="17.4" width="8" height="3.4" rx="1.7" fill={c} opacity={focused ? 0.65 : 0.3} />
      <Circle cx="18.2" cy="16.9" r="3.1" stroke={c} strokeWidth="1.8" opacity={focused ? 1 : 0.5} />
      <Path d="M18.2 18.7l1.8 1.8" stroke={c} strokeWidth="1.8" strokeLinecap="round" opacity={focused ? 1 : 0.5} />
    </Svg>
  );
}

export function ChatIcon({ size = 22, color, focused }: IconProps) {
  const c = color ?? (focused ? colors.accent : colors.muted);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-4.2 3.4c-.7.55-1.8.07-1.8-.86V6.5Z"
        stroke={c}
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={focused ? 'rgba(16,185,129,0.18)' : 'none'}
      />
      <Circle cx="9" cy="9.6" r="1.05" fill={c} />
      <Circle cx="12" cy="9.6" r="1.05" fill={c} />
      <Circle cx="15" cy="9.6" r="1.05" fill={c} />
    </Svg>
  );
}

export function CompaniesIcon({ size = 22, color, focused }: IconProps) {
  const c = color ?? (focused ? colors.accent : colors.muted);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="10" width="3.6" height="9" rx="1" fill={c} opacity={focused ? 1 : 0.55} />
      <Rect x="10.2" y="6.5" width="3.6" height="12.5" rx="1" fill={c} opacity={focused ? 0.85 : 0.4} />
      <Rect x="16.4" y="3.5" width="3.6" height="15.5" rx="1" fill={c} opacity={focused ? 1 : 0.55} />
      <Path d="M4.5 7.5 10 4.2l4 2.6 5.5-3.4" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity={focused ? 0.9 : 0.45} />
    </Svg>
  );
}

export function SettingsIcon({ size = 22, color, focused }: IconProps) {
  const c = color ?? (focused ? colors.accent : colors.muted);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.8" />
      <Path
        d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ChevronRight({ size = 14, color = colors.faint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SendIcon({ size = 18, color = '#04130C' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3.5 11.2 20 4l-4.6 16.5-4.3-6.2-7.6-3.1Z" stroke={color} strokeWidth="1.9" strokeLinejoin="round" fill={color} fillOpacity={0.15} />
      <Path d="M11.1 14.3 20 4" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}

export function StopIcon({ size = 16, color = '#04130C' }: { size?: number; color?: string }) {
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
