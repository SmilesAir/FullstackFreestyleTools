'use client';

import { useId, useMemo, useRef, useState, useEffect } from 'react';
import { fullView, isZoomed, clampView, mmss, panBy, pinchTo, timeTicks, zoomAround, type View } from '@/lib/graph-view';
import {
  CURVE_SHAPE,
  CURVE_SPREAD,
  axisRange,
  curveValueAt,
  scoreCurve,
  signed,
  type CurveScore,
  type CurveShape,
} from '@/lib/score-curve';
import type { OtherCurve } from '@/lib/judging';
import { OTHER_COLOR } from './noteStyles';

const POS = '#16a34a';
const NEG = '#dc2626';
const FULL_MARGIN = { l: 38, r: 12, t: 24, b: 30 };
// Lists of graphs: just room for the title and small axis labels.
const COMPACT_MARGIN = { l: 30, r: 6, t: 15, b: 14 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// A dot's radius: bigger for a bigger score, scaled by the score's own factor.
const dotRadius = (score: CurveScore) =>
  (score.dotScale ?? 1) * 2 * (2.5 + Math.min(4.5, Math.abs(score.s) * 0.6));

// The highest and lowest values a graph of these scores reaches (the curve or a
// dot), for drawing several graphs on one height axis. The averaged lines under
// the graph count too.
export function graphExtent(
  scores: readonly CurveScore[],
  duration: number,
  underlays: readonly OtherCurve[] = []
): { max: number; min: number } {
  const { ys } = scoreCurve(scores, { duration, spread: CURVE_SPREAD, shape: CURVE_SHAPE });
  let max = 0;
  let min = 0;
  for (const value of [...ys, ...scores.map((s) => s.s), ...underlays.flatMap((u) => u.ys)]) {
    max = Math.max(max, value);
    min = Math.min(min, value);
  }
  return { max, min };
}

type Gesture =
  | { kind: 'pinch'; startDistance: number; startView: View; anchor: number }
  | { kind: 'pan'; startX: number; startView: View };

// Scores over a routine as one filled line: green above zero, red below.
// Drawn with plain SVG at the width it is given. The time axis zooms with the
// mouse wheel, a pinch, or the buttons, and moves by dragging when zoomed.
export function ScoreGraph({
  scores,
  duration,
  routineSeconds,
  shape = CURVE_SHAPE,
  spread = CURVE_SPREAD,
  cursor = null,
  selectedId = null,
  onCursorChange,
  compact = false,
  heightFactor = 1,
  aside,
  yExtent,
  underlays,
  overview = false,
  title,
}: {
  scores: readonly CurveScore[];
  // The time axis' length in seconds.
  duration: number;
  // Where the routine ends: it starts at 0 (the timer starting) and ends when
  // the timer reaches this. Both are marked on the graph.
  routineSeconds: number;
  shape?: CurveShape;
  spread?: number;
  // A moment the user has picked, in seconds, drawn as a fixed marker. Given
  // together with onCursorChange, tapping or clicking the graph picks a moment.
  // Tapping a dot (of a score with an id) picks that score instead: the cursor
  // goes to its moment and its id is given. `selectedId` is drawn ringed.
  cursor?: number | null;
  selectedId?: string | null;
  onCursorChange?: (seconds: number, scoreId: string | null) => void;
  // Half the usual height with tight margins, for lists of graphs: the Start and
  // End marks lose their labels, and `title` is written along the top instead.
  compact?: boolean;
  title?: string;
  // The usual height times this (0.6 = 40% shorter).
  heightFactor?: number;
  // Something to show to the right of the graph, as a square the height of the graph.
  aside?: React.ReactNode;
  // The highest and lowest values a set of graphs reach (see `graphExtent`). Given
  // the same one, graphs draw on the same height axis so they can be compared.
  yExtent?: { max: number; min: number };
  // The other judges, averaged per category, drawn faintly under this graph (which
  // is then drawn see-through).
  underlays?: readonly OtherCurve[];
  // Only the averaged lines, drawn in full colour: no graph of one judge's own
  // (the head judge's view of a routine).
  overview?: boolean;
}) {
  const MARGIN = compact ? COMPACT_MARGIN : FULL_MARGIN;
  const labelSize = compact ? 10 : 11;
  const uid = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<View>(() => fullView(duration));

  // A longer axis (a late note) keeps a zoomed window where it is, and widens a full one.
  const [seenDuration, setSeenDuration] = useState(duration);
  if (seenDuration !== duration) {
    setSeenDuration(duration);
    setView((v) => (isZoomed(v, seenDuration) ? clampView(v, duration) : fullView(duration)));
  }

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = Math.round(((width < 520 ? 250 : 320) / (compact ? 2 : 1)) * heightFactor);
  const iw = width - MARGIN.l - MARGIN.r;
  const ih = height - MARGIN.t - MARGIN.b;

  // The wheel handler is added by hand (React's own is passive and can't stop
  // the page scrolling), so it reads the current size from here.
  const geometryRef = useRef({ iw, duration, left: MARGIN.l });
  useEffect(() => {
    geometryRef.current = { iw, duration, left: MARGIN.l };
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      // Zooming needs Ctrl held (a trackpad pinch arrives as a wheel with Ctrl
      // held); a plain wheel scrolls the page as usual.
      if (!event.ctrlKey) return;
      event.preventDefault();
      const { iw: plotWidth, duration: total, left } = geometryRef.current;
      const fraction = clamp01((event.clientX - el.getBoundingClientRect().left - left) / plotWidth);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      // Scrolling down zooms out. A pinch sends many small steps, a mouse wheel a
      // few big ones (about 100 a notch).
      const factor = Math.exp(-event.deltaY * unit * (Math.abs(event.deltaY * unit) >= 50 ? 0.0015 : 0.01));
      setView((v) => zoomAround(v, factor, v.start + fraction * (v.end - v.start), total));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // The whole routine fixes the height scale, so zooming never rescales it.
  const { lo, hi, step } = useMemo(() => {
    const { ys } = scoreCurve(scores, { duration, spread, shape });
    let maxY = yExtent?.max ?? 0;
    let minY = yExtent?.min ?? 0;
    for (const value of [...ys, ...scores.map((s) => s.s), ...(underlays ?? []).flatMap((u) => u.ys)]) {
      maxY = Math.max(maxY, value);
      minY = Math.min(minY, value);
    }
    return axisRange(maxY, minY);
  }, [scores, duration, spread, shape, yExtent?.max, yExtent?.min, underlays]);
  // With averaged lines underneath, this graph is drawn see-through.
  const seeThrough = (underlays?.length ?? 0) > 0;

  const span = view.end - view.start;
  const zoomed = isZoomed(view, duration);
  // Sampled across just the visible window, so it stays smooth when zoomed in.
  const visible = useMemo(
    () =>
      scoreCurve(scores, {
        duration,
        spread,
        shape,
        step: Math.min(0.5, span / Math.max(60, iw / 2)),
        from: view.start,
        to: view.end,
      }),
    [scores, duration, spread, shape, span, iw, view.start, view.end]
  );

  const x = (t: number) => MARGIN.l + ((t - view.start) / span) * iw;
  const y = (v: number) => MARGIN.t + ((hi - v) / (hi - lo)) * ih;
  const zeroY = y(0);

  const line = visible.ts.map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(visible.ys[i]).toFixed(1)}`).join('');
  const area = `${line}L${x(view.end).toFixed(1)} ${zeroY.toFixed(1)}L${x(view.start).toFixed(1)} ${zeroY.toFixed(1)}Z`;

  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
  const xTicks = timeTicks(view);


  // --- pointers: hover cursor, drag to pan when zoomed, two fingers to pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const moved = useRef(false);
  const lastTap = useRef(0);

  const timeAt = (clientX: number, rect: DOMRect) => view.start + clamp01((clientX - rect.left - MARGIN.l) / iw) * span;
  const resetZoom = () => setView(fullView(duration));

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is only a convenience for dragging outside the graph.
    }
    moved.current = false;

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: 'pinch',
        startDistance: Math.hypot(a.x - b.x, a.y - b.y),
        startView: view,
        anchor: timeAt((a.x + b.x) / 2, rect),
      };
      setHover(null);
    } else if (pointers.current.size === 1) {
      if (zoomed) {
        gesture.current = { kind: 'pan', startX: event.clientX, startView: view };
      } else {
        gesture.current = null;
        setHover(timeAt(event.clientX, rect));
      }
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!pointers.current.has(event.pointerId)) {
      // A mouse moving over the graph with no button down.
      if (event.pointerType === 'mouse') setHover(timeAt(event.clientX, rect));
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;

    if (g?.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const fraction = clamp01(((a.x + b.x) / 2 - rect.left - MARGIN.l) / iw);
      setView(pinchTo(g.startView, g.startDistance, Math.hypot(a.x - b.x, a.y - b.y), g.anchor, fraction, duration));
      moved.current = true;
    } else if (g?.kind === 'pan') {
      const dx = event.clientX - g.startX;
      if (Math.abs(dx) > 3) moved.current = true;
      setView(panBy(g.startView, -(dx / iw) * (g.startView.end - g.startView.start), duration));
    } else {
      setHover(timeAt(event.clientX, rect));
    }
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      // Two quick taps or clicks put the whole routine back.
      if (event.type === 'pointerup' && !moved.current) {
        // A tap, a click, or a finger lifted after scrubbing: pick a dot if one
        // is under it, otherwise that moment.
        if (onCursorChange) {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          let hit: CurveScore | null = null;
          let nearest = Infinity;
          for (const score of scores) {
            if (!score.id || score.t < view.start || score.t > view.end) continue;
            const distance = Math.hypot(x(score.t) - px, zeroY - py);
            if (distance <= dotRadius(score) + 10 && distance < nearest) {
              hit = score;
              nearest = distance;
            }
          }
          onCursorChange(hit ? hit.t : timeAt(event.clientX, rect), hit?.id ?? null);
        }
        const now = Date.now();
        if (now - lastTap.current < 300) {
          resetZoom();
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }
    } else if (pointers.current.size === 1) {
      // One finger of a pinch is still down: carry on by dragging with it.
      const [p] = [...pointers.current.values()];
      gesture.current = zoomed ? { kind: 'pan', startX: p.x, startView: view } : null;
    }
  }

  const hoverValue = hover !== null ? curveValueAt(scores, shape, spread, hover) : null;
  const hoverT = hover !== null ? Math.min(view.end, Math.max(view.start, hover)) : null;

  return (
    <div className={`flex items-start ${compact ? 'gap-1' : 'gap-2'}`}>
      <div ref={box} className="w-full min-w-0 flex-1">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Notes over the routine as a filled line. Hold Ctrl and scroll, or pinch, to zoom."
          className={`block touch-pan-y select-none text-gray-500 ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={(e) => {
            onPointerEnd(e);
            setHover(null);
          }}
          onPointerLeave={(e) => {
            if (!pointers.current.has(e.pointerId)) setHover(null);
          }}
        >
          <defs>
            <linearGradient id={`${uid}p`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={MARGIN.t} y2={zeroY}>
              <stop offset="0" stopColor={POS} stopOpacity={seeThrough ? 0.35 : 0.6} />
              <stop offset="1" stopColor={POS} stopOpacity={seeThrough ? 0.04 : 0.06} />
            </linearGradient>
            <linearGradient id={`${uid}n`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={zeroY} y2={MARGIN.t + ih}>
              <stop offset="0" stopColor={NEG} stopOpacity={seeThrough ? 0.04 : 0.06} />
              <stop offset="1" stopColor={NEG} stopOpacity={seeThrough ? 0.35 : 0.6} />
            </linearGradient>
            <clipPath id={`${uid}cu`}>
              <rect x={MARGIN.l} y={MARGIN.t} width={iw} height={ih} />
            </clipPath>
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
              <text x={MARGIN.l - (compact ? 4 : 8)} y={y(v) + 4} textAnchor="end" fontSize={labelSize} fill="currentColor">
                {v > 0 ? '+' : v < 0 ? '−' : ''}
                {Math.abs(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => {
            const tx = x(t);
            return (
              <g key={`x${t}`}>
                <line x1={tx} x2={tx} y1={MARGIN.t} y2={MARGIN.t + ih} stroke="currentColor" strokeOpacity="0.18" />
                <text
                  x={tx}
                  y={height - (compact ? 3 : 10)}
                  textAnchor={tx < MARGIN.l + 14 ? 'start' : tx > MARGIN.l + iw - 14 ? 'end' : 'middle'}
                  fontSize={labelSize}
                  fill="currentColor"
                >
                  {mmss(t)}
                </text>
              </g>
            );
          })}

          {/* The other judges, averaged, under this judge's graph. */}
          <g clipPath={`url(#${uid}cu)`}>
            {underlays?.map((other) => {
              const first = Math.max(0, Math.floor(view.start / other.step) - 1);
              const last = Math.min(other.ys.length - 1, Math.ceil(view.end / other.step) + 1);
              const points: string[] = [];
              for (let i = first; i <= last; i++) {
                points.push(`${points.length ? 'L' : 'M'}${x(i * other.step).toFixed(1)} ${y(other.ys[i]).toFixed(1)}`);
              }
              if (points.length < 2) return null;
              const path = points.join('');
              const color = OTHER_COLOR[other.category] ?? '#64748b';
              return (
                <g key={other.category}>
                  <path
                    d={`${path}L${x(last * other.step).toFixed(1)} ${zeroY.toFixed(1)}L${x(first * other.step).toFixed(1)} ${zeroY.toFixed(1)}Z`}
                    fill={color}
                    fillOpacity={overview ? 0.14 : 0.07}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeOpacity={overview ? 0.95 : 0.32}
                    strokeWidth={overview ? 2.25 : 1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </g>

          <g clipPath={`url(#${uid}cp)`} opacity={seeThrough ? 0.9 : 1} display={overview ? 'none' : undefined}>
            <path d={area} fill={`url(#${uid}p)`} />
            <path d={line} fill="none" stroke={POS} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
          </g>
          <g clipPath={`url(#${uid}cn)`} opacity={seeThrough ? 0.9 : 1} display={overview ? 'none' : undefined}>
            <path d={area} fill={`url(#${uid}n)`} />
            <path d={line} fill="none" stroke={NEG} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
          </g>

          {[
            { t: 0, label: 'Start', anchor: 'start' as const, dx: 5 },
            { t: routineSeconds, label: 'End', anchor: 'end' as const, dx: -5 },
          ]
            .filter((mark) => mark.t >= view.start - 1e-9 && mark.t <= view.end + 1e-9)
            .map((mark) => (
              <g key={mark.label}>
                <line
                  x1={x(mark.t)}
                  x2={x(mark.t)}
                  y1={MARGIN.t - (compact ? 0 : 6)}
                  y2={MARGIN.t + ih}
                  stroke="currentColor"
                  strokeOpacity="0.75"
                  strokeWidth="1.5"
                />
                {!compact && (
                  <text
                    x={x(mark.t) + mark.dx}
                    y={MARGIN.t - 9}
                    textAnchor={mark.anchor}
                    fontSize="11"
                    fontWeight="600"
                    fill="currentColor"
                  >
                    {mark.label}
                  </text>
                )}
              </g>
            ))}

          {compact && title && (
            <text x={MARGIN.l + 4} y={MARGIN.t - 3} fontSize="12" fontWeight="700" fill="var(--foreground)">
              {title}
            </text>
          )}

          <line x1={MARGIN.l} x2={MARGIN.l + iw} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.25" />

          {scores
            .filter((score) => score.t >= view.start && score.t <= view.end)
            .map((score, i) => (
              <circle
                key={score.id ?? i}
                cx={x(score.t)}
                cy={zeroY}
                r={dotRadius(score)}
                fill={score.color ?? (score.s < 0 ? NEG : POS)}
                stroke="var(--background)"
                strokeWidth="1.5"
              >
                <title>{`${mmss(score.t)}  ${score.label ?? signed(score.s)}`}</title>
              </circle>
            ))}

          {/* The picked dot gets a ring drawn over the others. */}
          {scores
            .filter((score) => score.id === selectedId && score.t >= view.start && score.t <= view.end)
            .map((score) => (
              <circle
                key={`sel${score.id}`}
                cx={x(score.t)}
                cy={zeroY}
                r={dotRadius(score) + 3}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
              />
            ))}

          {cursor !== null && cursor >= view.start && cursor <= view.end && (
            <g>
              <line x1={x(cursor)} x2={x(cursor)} y1={MARGIN.t - 4} y2={MARGIN.t + ih} stroke="#2563eb" strokeWidth="2" />
              <polygon
                points={`${x(cursor) - 6},${MARGIN.t - 14} ${x(cursor) + 6},${MARGIN.t - 14} ${x(cursor)},${MARGIN.t - 3}`}
                fill="#2563eb"
              />
            </g>
          )}

          {!overview && hoverT !== null && hoverValue !== null && (
            <g>
              <line x1={x(hoverT)} x2={x(hoverT)} y1={MARGIN.t} y2={MARGIN.t + ih} stroke="currentColor" strokeDasharray="2 3" />
              <circle cx={x(hoverT)} cy={y(hoverValue)} r="4.5" fill="currentColor" stroke="var(--background)" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>
      {aside && (
        <div className="shrink-0" style={{ width: height, height }}>
          {aside}
        </div>
      )}
    </div>
  );
}
