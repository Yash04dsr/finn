/**
 * SVG charts: Sparkline (payload.spark polyline) and RevenueChart
 * (quarterly revenue bars + EBITDA margin line overlay).
 */
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Polyline, Rect, Line, Text as SvgText } from 'react-native-svg';
import { colors, type } from '../lib/theme';
import { fmtCr } from '../lib/format';
import type { Quarter } from '../lib/types';

export function Sparkline({
  points,
  width = 64,
  height = 22,
  color,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 2;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <Svg width={width} height={height}>
      <Polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color ?? colors.accent}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

interface RevenueChartProps {
  quarterly: Quarter[];
  height?: number;
}

/** Bars for revenue (last 8 quarters) with EBITDA margin % line overlay. */
export function RevenueChart({ quarterly, height = 168 }: RevenueChartProps) {
  const data = quarterly.slice(-8);
  if (data.length === 0) return null;

  const chartW = 320;
  const padL = 8;
  const padR = 8;
  const padT = 26; // room for the value label above the last bar
  const plotH = height - padT - 20; // 20px for period labels
  const maxRev = Math.max(...data.map((q) => q.revenue)) * 1.08 || 1;

  const n = data.length;
  const slot = (chartW - padL - padR) / n;
  const barW = Math.min(30, slot * 0.56);

  // EBITDA margin per quarter (%)
  const margins = data.map((q) => (q.revenue ? (q.ebitda / q.revenue) * 100 : 0));
  const mMin = Math.min(...margins);
  const mMax = Math.max(...margins);
  const mSpan = mMax - mMin || 1;

  const linePts = margins.map((m, i) => {
    const x = padL + slot * i + slot / 2;
    const y = padT + 8 + (1 - (m - mMin) / mSpan) * (plotH - 16);
    return { x, y };
  });
  const lastIdx = n - 1;
  const last = data[lastIdx];

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${chartW} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* baseline */}
        <Line x1={padL} y1={padT + plotH} x2={chartW - padR} y2={padT + plotH} stroke={colors.border} strokeWidth={1} />
        {/* bars */}
        {data.map((q, i) => {
          const h = (q.revenue / maxRev) * plotH;
          const x = padL + slot * i + (slot - barW) / 2;
          const y = padT + plotH - h;
          const isLast = i === lastIdx;
          return (
            <Rect
              key={q.period}
              x={x}
              y={y}
              width={barW}
              height={Math.max(2, h)}
              rx={0}
              fill={isLast ? colors.accent : 'rgba(0,0,0,0.18)'}
            />
          );
        })}
        {/* EBITDA margin line */}
        <Polyline
          points={linePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke={colors.amber}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {linePts.map((p, i) => (
          <Rect
            key={`pt-${i}`}
            x={p.x - 2}
            y={p.y - 2}
            width={4}
            height={4}
            rx={2}
            fill={i === lastIdx ? colors.amber : 'rgba(179,139,109,0.85)'}
          />
        ))}
        {/* value label above last bar */}
        <SvgText
          x={padL + slot * lastIdx + slot / 2}
          y={Math.max(11, padT + plotH - (last.revenue / maxRev) * plotH - 6)}
          fill={colors.text}
          fontSize="10.5"
          fontWeight="700"
          textAnchor="middle"
        >
          {`${Math.round(last.revenue).toLocaleString('en-IN')} Cr`}
        </SvgText>
        {/* period labels */}
        {data.map((q, i) => (
          <SvgText
            key={`lab-${q.period}`}
            x={padL + slot * i + slot / 2}
            y={height - 6}
            fill={i === lastIdx ? colors.muted : colors.faint}
            fontSize="9"
            textAnchor="middle"
          >
            {q.period}
          </SvgText>
        ))}
      </Svg>
      {/* legend */}
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14 }}>
          <View style={{ width: 16, height: 3, backgroundColor: '#000000', marginRight: 6 }} />
          <Text style={type.micro}>Revenue (₹ Cr)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 16, height: 3, backgroundColor: colors.tan, marginRight: 6 }} />
          <Text style={type.micro}>EBITDA margin %</Text>
        </View>
      </View>
      <Text style={[type.micro, { color: colors.faint, marginTop: 4 }]}>
        {fmtCr(data[0].revenue)} → {fmtCr(last.revenue)} over {n} quarters
      </Text>
    </View>
  );
}
