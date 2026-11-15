/**
 * FINN design language — same Swiss system as the web app.
 * White ground, black type, square corners, tan only as a rule.
 */
import { Platform, type TextStyle } from 'react-native';

const sans = Platform.select({
  ios: 'Helvetica Neue',
  android: 'sans-serif',
  default: 'Helvetica Neue',
});

export const colors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#F5F1E8',
  border: '#E5E7EB',
  borderStrong: '#000000',
  text: '#000000',
  muted: '#4B5563',
  faint: '#4B5563',
  accent: '#000000',
  accentDim: 'rgba(0,0,0,0.06)',
  pos: '#1E6B4F',
  neg: '#B4442C',
  tan: '#B38B6D',
  red: '#B4442C',
  redDim: 'rgba(180,68,44,0.10)',
  amber: '#B38B6D',
  amberDim: 'rgba(179,139,109,0.16)',
  skeleton: 'rgba(0,0,0,0.06)',
};

export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  xl: 0,
};

export const spacing = (n: number) => n * 4;

/** Shared text styles. Helvetica on iOS, the platform sans on Android. */
export const type: Record<string, TextStyle> = {
  title: { fontFamily: sans, fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
  h2: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: colors.text },
  h3: { fontFamily: sans, fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontFamily: sans, fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontFamily: sans, fontSize: 12.5, color: colors.muted, lineHeight: 17 },
  micro: { fontFamily: sans, fontSize: 11, color: colors.muted, letterSpacing: 0.4 },
  num: { fontVariant: ['tabular-nums'] as const },
};

/** Semantic helpers for signed moves. Matches the web pos/neg pair. */
export const signColor = (v: number | null | undefined) => {
  if (v == null || v === 0) return colors.muted;
  return v > 0 ? colors.pos : colors.neg;
};
