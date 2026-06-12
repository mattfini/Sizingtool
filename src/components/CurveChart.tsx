import { useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';

export interface ChartSeries {
  name: string;
  color: string;
  dashed?: boolean;
  /** Shares 0..1 per size, aligned with `sizes`. */
  values: number[];
  /** When set, points can be dragged vertically; reports the new share for an index. */
  onDrag?: (index: number, value: number) => void;
}

interface Props {
  sizes: string[];
  series: ChartSeries[];
  svgRef: RefObject<SVGSVGElement>;
}

const VB_W = 860;
const VB_H = 420;
const M = { top: 24, right: 24, bottom: 56, left: 56 };
const PLOT_W = VB_W - M.left - M.right;
const PLOT_H = VB_H - M.top - M.bottom;

export default function CurveChart({ sizes, series, svgRef }: Props) {
  const [drag, setDrag] = useState<{ series: number; index: number } | null>(null);
  const [hover, setHover] = useState<{ series: number; index: number } | null>(null);
  const localRef = useRef<SVGSVGElement | null>(null);

  const maxVal = Math.max(0.02, ...series.flatMap((s) => s.values));
  const yMax = niceCeil(maxVal * 1.15);
  const xAt = useCallback(
    (i: number) => M.left + (sizes.length === 1 ? PLOT_W / 2 : (i / (sizes.length - 1)) * PLOT_W),
    [sizes.length],
  );
  const yAt = useCallback((v: number) => M.top + PLOT_H * (1 - v / yMax), [yMax]);

  const valueFromPointer = (e: React.PointerEvent): number => {
    const svg = localRef.current!;
    const rect = svg.getBoundingClientRect();
    const svgY = ((e.clientY - rect.top) / rect.height) * VB_H;
    const v = ((M.top + PLOT_H - svgY) / PLOT_H) * yMax;
    return Math.min(Math.max(v, 0), yMax);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    series[drag.series].onDrag?.(drag.index, valueFromPointer(e));
  };

  const yTicks = buildTicks(yMax);
  const fmtPct = (v: number) => `${(v * 100).toFixed(v * 100 >= 10 ? 0 : 1)}%`;

  return (
    <svg
      ref={(el) => {
        localRef.current = el;
        (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el;
      }}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="curve-chart"
      style={{ touchAction: 'none' }}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="#ffffff" />
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={VB_W - M.right} y1={yAt(t)} y2={yAt(t)} stroke="#e5e9f0" />
          <text x={M.left - 8} y={yAt(t) + 4} textAnchor="end" className="tick">
            {fmtPct(t)}
          </text>
        </g>
      ))}
      <line x1={M.left} x2={VB_W - M.right} y1={yAt(0)} y2={yAt(0)} stroke="#9aa3b2" />
      {sizes.map((s, i) => (
        <text key={s} x={xAt(i)} y={VB_H - M.bottom + 20} textAnchor="middle" className="tick">
          {s}
        </text>
      ))}

      {series.map((ser, si) => (
        <g key={ser.name}>
          <polyline
            points={ser.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')}
            fill="none"
            stroke={ser.color}
            strokeWidth={2.5}
            strokeDasharray={ser.dashed ? '7 5' : undefined}
            strokeLinejoin="round"
          />
          {ser.values.map((v, i) => {
            const active =
              (drag && drag.series === si && drag.index === i) ||
              (hover && hover.series === si && hover.index === i);
            return (
              <g key={i}>
                <circle
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={active ? 7 : 4.5}
                  fill="#fff"
                  stroke={ser.color}
                  strokeWidth={2.5}
                  style={{ cursor: ser.onDrag ? 'ns-resize' : 'default' }}
                  onPointerDown={
                    ser.onDrag
                      ? (e) => {
                          e.preventDefault();
                          localRef.current?.setPointerCapture(e.pointerId);
                          setDrag({ series: si, index: i });
                        }
                      : undefined
                  }
                  onPointerEnter={() => setHover({ series: si, index: i })}
                  onPointerLeave={() => setHover(null)}
                />
                {active && (
                  <text
                    x={xAt(i)}
                    y={yAt(v) - 12}
                    textAnchor="middle"
                    className="point-label"
                    fill={ser.color}
                  >
                    {fmtPct(v)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}

      {/* legend */}
      {series.map((ser, si) => {
        const lx = M.left + si * 190;
        return (
          <g key={ser.name}>
            <line
              x1={lx}
              x2={lx + 26}
              y1={14}
              y2={14}
              stroke={ser.color}
              strokeWidth={3}
              strokeDasharray={ser.dashed ? '7 5' : undefined}
            />
            <text x={lx + 32} y={18} className="legend">
              {ser.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function niceCeil(v: number): number {
  const steps = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1];
  for (const s of steps) if (v <= s) return s;
  return Math.ceil(v * 10) / 10;
}

function buildTicks(yMax: number): number[] {
  const step = yMax / 5;
  return Array.from({ length: 6 }, (_, i) => i * step);
}
