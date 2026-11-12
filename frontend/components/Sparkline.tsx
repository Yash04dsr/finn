"use client";

import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

/** Hand-rolled inline-SVG sparkline — no chart deps. */
export default function Sparkline({ data, width = 72, height = 26, className = "" }: SparklineProps) {
  const { path, area, up } = useMemo(() => {
    const pts = data.filter((n) => typeof n === "number" && !Number.isNaN(n));
    if (pts.length < 2) return { path: "", area: "", up: true };
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const px = (i: number) => (i / (pts.length - 1)) * (width - 4) + 2;
    const py = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
    const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
    return {
      path: d,
      area: `${d} L${px(pts.length - 1).toFixed(1)},${height - 1} L${px(0).toFixed(1)},${height - 1} Z`,
      up: pts[pts.length - 1] >= pts[0],
    };
  }, [data, width, height]);

  if (!path) return null;
  const stroke = up ? "#1E6B4F" : "#B4442C";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={area} fill={stroke} opacity={0.09} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
