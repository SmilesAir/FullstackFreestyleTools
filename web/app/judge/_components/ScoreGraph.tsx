'use client';

import { useId, useMemo, useRef, useState, useEffect } from 'react';
import { axisRange, scoreCurve, type CurveScore, type CurveShape } from '@/lib/score-curve';

const POS = '#16a34a';
const NEG = '#dc2626';
const MARGIN = { l: 38, r: 12, t: 12, b: 30 };

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const signed = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`;

// Scores over a routine as one filled line: green above zero, red below.
// Drawn with plain SVG at the width it is given.
export function ScoreGraph({
  scores,
  duration,
  shape = 'smooth',
  spread = 4,
}: {
  scores: readonly CurveScore[];
  duration: number;
  shape?: CurveShape;
  spread?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = width < 520 ? 250 : 320;
  const iw = width - MARGIN.l - MARGIN.r;
  const ih = height - MARGIN.t - MARGIN.b;

  const geometry = useMemo(() => {
    const { ts, ys } = scoreCurve(scores, { duration, spread, shape });
    let maxY = 0;
    let minY = 0;
    let maxI = 0;
    let minI = 0;
    ys.forEach((y, i) => {
      if (y > maxY) {
        maxY = y;
        maxI = i;
      }
      if (y < minY) {
        minY = y;
        minI = i;
      }
    });
    for (const score of scores) {
      maxY = Math.max(maxY, score.s);
      minY = Math.min(minY, score.s);
    }
    const { lo, hi, step } = axisRange(maxY, minY);
    return { ts, ys, maxI, minI, lo, hi, step };
  }, [scores, duration, spread, shape]);

  const { ts, ys, lo, hi, step } = geometry;
  const x = (t: number) => MARGIN.l + (t / duration) * iw;
  const y = (v: number) => MARGIN.t + ((hi - v) / (hi - lo)) * ih;
  const zeroY = y(0);

  const line = ts.map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(ys[i]).toFixed(1)}`).join('');
  const area = `${line}L${x(duration).toFixed(1)} ${zeroY.toFixed(1)}L${x(0).toFixed(1)} ${zeroY.toFixed(1)}Z`;

  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
  const xTicks: number[] = [];
  for (let t = 0; t <= duration; t += 30) xTicks.push(t);

  const peak = ys[geometry.maxI];
  const low = ys[geometry.minI];
  const shown = hover !== null ? hover : null;

  function move(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((event.clientX - rect.left - MARGIN.l) / iw) * duration));
    setHover(Math.round(t / 0.5));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-5 font-mono text-sm tabular-nums">
        {shown !== null
          ? `${mmss(ts[shown])}  line ${signed(ys[shown])}`
          : scores.length === 0
            ? 'No notes yet'
            : `Peak ${signed(peak)} at ${mmss(ts[geometry.maxI])}${low < -0.05 ? `   Low ${signed(low)} at ${mmss(ts[geometry.minI])}` : ''}`}
      </div>
      <div ref={box} className="w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Notes over the routine as a filled line"
          className="block touch-pan-y text-gray-500"
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => setHover(null)}
          onPointerCancel={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${uid}p`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={MARGIN.t} y2={zeroY}>
              <stop offset="0" stopColor={POS} stopOpacity="0.6" />
              <stop offset="1" stopColor={POS} stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id={`${uid}n`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={zeroY} y2={MARGIN.t + ih}>
              <stop offset="0" stopColor={NEG} stopOpacity="0.06" />
              <stop offset="1" stopColor={NEG} stopOpacity="0.6" />
            </linearGradient>
            <clipPath id={`${uid}cp`}>
              <rect x={MARGIN.l} y={MARGIN.t} width={iw} height={Math.max(0, zeroY - MARGIN.t)} />
            </clipPath>
            <clipPath id={`${uid}cn`}>
              <rect x={MARGIN.l} y={zeroY} width={iw} height={Math.max(0, MARGIN.t + ih - zeroY)} />
            </clipPath>
          </defs>

          {yTicks.map((v) => (
            <g key={`y${v}`}>
              {v !== 0 && (
                <line x1={MARGIN.l} x2={MARGIN.l + iw} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.18" />
              )}
              <text x={MARGIN.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor">
                {v > 0 ? '+' : v < 0 ? '−' : ''}
                {Math.abs(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={x(t)} x2={x(t)} y1={MARGIN.t} y2={MARGIN.t + ih} stroke="currentColor" strokeOpacity="0.18" />
              <text
                x={x(t)}
                y={height - 10}
                textAnchor={t === 0 ? 'start' : t === duration ? 'end' : 'middle'}
                fontSize="11"
                fill="currentColor"
              >
                {mmss(t)}
              </text>
            </g>
          ))}

          <g clipPath={`url(#${uid}cp)`}>
            <path d={area} fill={`url(#${uid}p)`} />
            <path d={line} fill="none" stroke={POS} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
          </g>
          <g clipPath={`url(#${uid}cn)`}>
            <path d={area} fill={`url(#${uid}n)`} />
            <path d={line} fill="none" stroke={NEG} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
          </g>

          <line x1={MARGIN.l} x2={MARGIN.l + iw} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.25" />

          {scores.map((score, i) => (
            <circle
              key={i}
              cx={x(score.t)}
              cy={zeroY}
              r={2.5 + Math.min(4.5, Math.abs(score.s) * 0.6)}
              fill={score.s < 0 ? NEG : POS}
              stroke="var(--background)"
              strokeWidth="1.5"
            >
              <title>{`${mmss(score.t)}  ${signed(score.s)}`}</title>
            </circle>
          ))}

          {shown !== null && (
            <g>
              <line x1={x(ts[shown])} x2={x(ts[shown])} y1={MARGIN.t} y2={MARGIN.t + ih} stroke="currentColor" strokeDasharray="2 3" />
              <circle cx={x(ts[shown])} cy={y(ys[shown])} r="4.5" fill="currentColor" stroke="var(--background)" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
