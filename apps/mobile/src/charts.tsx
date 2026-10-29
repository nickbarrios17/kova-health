/**
 * Small charts for progress: bars (one per day or week) and a line, drawn with react-native-svg.
 * Days without data are gaps, never zeros. Tap a bar or point to see its value.
 */
import type { DayPoint } from '@kova/domain';
import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { c } from './theme';
import { Row, T } from './ui';

interface ChartProps {
  points: DayPoint[];
  height?: number;
  /** Dashed reference line (daily goal). */
  goal?: number | null;
  format: (v: number) => string;
  /** Label under the chart for a point (first, middle, last are shown). */
  label: (date: string) => string;
  kind?: 'bars' | 'line';
  /** Fixed range for the y axis (mood 1–5); else 0..max (bars) or min..max (line). */
  domain?: [number, number];
}

export function Chart({ points, height = 150, goal, format, label, kind = 'bars', domain }: ChartProps) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const pad = 6;
  const hi = domain ? domain[1] : Math.max(...vals, goal ?? 0, 1) * 1.08;
  const lo = domain ? domain[0] : kind === 'line' && vals.length ? Math.min(...vals) - (Math.max(...vals) - Math.min(...vals) || 1) * 0.3 : 0;
  const y = (v: number) => pad + (height - 2 * pad) * (1 - (v - lo) / (hi - lo || 1));
  const slot = points.length ? w / points.length : 0;
  const x = (i: number) => slot * i + slot / 2;
  const shown = sel != null ? points[sel] : null;

  const linePath = kind === 'line'
    ? points.reduce((d, p, i) => (p.value == null ? d : d + (d && points[i - 1]?.value != null ? ' L' : ' M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)), '')
    : '';

  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', minHeight: 18 }}>
        <T size={12} color={c.n400}>{shown ? label(shown.date) : vals.length ? 'Toca una barra para ver el valor' : ''}</T>
        {shown ? <T size={12} w="medium" color={c.a200}>{shown.value != null ? format(shown.value) : 'Sin datos'}</T> : null}
      </Row>
      <View onLayout={onLayout} style={{ height }}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            <Line x1={0} x2={w} y1={height - pad} y2={height - pad} stroke={c.divider} strokeWidth={1} />
            {goal != null && goal > lo && goal < hi ? (
              <Line x1={0} x2={w} y1={y(goal)} y2={y(goal)} stroke={c.n500} strokeWidth={1} strokeDasharray="4 4" />
            ) : null}
            {kind === 'bars'
              ? points.map((p, i) => p.value == null ? null : (
                <Rect key={p.date} x={x(i) - Math.max(1.5, slot * 0.32)} width={Math.max(3, slot * 0.64)} y={y(p.value)} height={Math.max(2, height - pad - y(p.value))}
                  rx={Math.min(3, slot * 0.2)} fill={sel === i ? c.a200 : goal != null && p.value >= goal ? c.accent : c.a700} />
              ))
              : (
                <>
                  <Path d={linePath} stroke={c.accent} strokeWidth={2} fill="none" />
                  {points.map((p, i) => p.value == null ? null : (
                    <Circle key={p.date} cx={x(i)} cy={y(p.value)} r={sel === i ? 5 : points.length > 40 ? 0 : 3} fill={sel === i ? c.a200 : c.accent} />
                  ))}
                </>
              )}
          </Svg>
        ) : null}
        {/* Tap targets over the chart, one per point. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
          {points.map((p, i) => (
            <Pressable key={p.date} style={{ flex: 1 }} onPress={() => setSel(sel === i ? null : i)}
              accessibilityLabel={label(p.date) + ': ' + (p.value != null ? format(p.value) : 'sin datos')} />
          ))}
        </View>
      </View>
      {points.length ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={11} color={c.n500}>{label(points[0]!.date)}</T>
          {points.length > 2 ? <T size={11} color={c.n500}>{label(points[Math.floor(points.length / 2)]!.date)}</T> : null}
          <T size={11} color={c.n500}>{label(points[points.length - 1]!.date)}</T>
        </Row>
      ) : null}
    </View>
  );
}

/** Tiny bar sparkline for summary cards (no labels, no taps). */
export function Spark({ points, height = 36, goal }: { points: DayPoint[]; height?: number; goal?: number | null }) {
  const [w, setW] = useState(0);
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const hi = Math.max(...vals, goal ?? 0, 1);
  const slot = points.length ? w / points.length : 0;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {points.map((p, i) => p.value == null ? null : (
            <Rect key={p.date} x={slot * i + slot * 0.18} width={Math.max(2, slot * 0.64)} y={height - Math.max(2, (p.value / hi) * height)}
              height={Math.max(2, (p.value / hi) * height)} rx={1.5} fill={goal != null && p.value >= goal ? c.accent : c.a700} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
