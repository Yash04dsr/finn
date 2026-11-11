/**
 * FINN design language — dark-only theme tokens.
 * Matches the web PWA exactly.
 */
import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#0A0E14',
  surface: '#111722',
  surface2: '#161E2C',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#E8ECF3',
  muted: '#8B93A3',
  faint: '#5C6474',
  accent: '#10B981',
  accentDim: 'rgba(16,185,129,0.14)',
  red: '#F43F5E',
  redDim: 'rgba(244,63,94,0.14)',
  amber: '#F59E0B',
  amberDim: 'rgba(245,158,11,0.14)',
  skeleton: 'rgba(255,255,255,0.06)',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

export const spacing = (n: number) => n * 4;

/** Shared text styles (system font, tabular numbers for figures). */
export const type: Record<string, TextStyle> = {
  title: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  h3: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontSize: 12.5, color: colors.muted, lineHeight: 17 },
  micro: { fontSize: 11, color: colors.muted },
  num: { fontVariant: ['tabular-nums'] as const },
};

/** Semantic helpers for signed moves. */
export const signColor = (v: number | null | undefined) => {
  if (v == null || v === 0) return colors.muted;
  return v > 0 ? colors.accent : colors.red;
};
