import { fullView, mmss, timeTicks } from '@/lib/graph-view';
import type { OtherCurve } from '@/lib/judging';
import { teamColorVar } from '@/app/judge/_components/noteStyles';
import { graphExtent } from '@/app/judge/_components/ScoreGraph';
import { axisRange, curveSegments, signed } from '@/lib/score-curve';

const MARGIN = { l: 38, r: 12, t: 20, b: 28 };
const WIDTH = 800;
const HEIGHT = 320;
const NO_SCORES: never[] = [];

export type OverviewTeam = {
  id: string;
  name: string;
  // Null for a team with no place yet (hasn't fully played) - drawn frontmost
  // among the non-highlighted lines, same as the Summary table treats it last.
  place: number | null;
  curve: OtherCurve;
  // A team's stable colour slot (its play order - see noteStyles.ts's
  // teamColorVar), not its position in whatever order the caller sorted `teams`.
  colorIndex: number;
};

// The pool's combined results graph: every team's judges averaged into one
// line each (see lib/judging.ts's combineTeamCurve), on one shared axis, so
// the whole pool's shape is visible at once. Depth-sorted by place (best
// first = drawn first = furthest back) so a big, likely-1st-place curve
// doesn't bury smaller ones underneath it - unless a team is highlighted,
// which always draws on top regardless of place.
export function PoolOverviewGraph({
  teams,
  routineSeconds,
  highlightedTeamId,
}: {
  teams: OverviewTeam[];
  routineSeconds: number;
  highlightedTeamId: string | null;
}) {
  if (teams.length === 0) return null;

  const duration = Math.max(30, ...teams.map((t) => (t.curve.ys.length - 1) * t.curve.step));
  const extent = graphExtent(
    NO_SCORES,
    duration,
    teams.map((t) => t.curve)
  );
  const { lo, hi, step } = axisRange(extent.max, extent.min);

  const iw = WIDTH - MARGIN.l - MARGIN.r;
  const ih = HEIGHT - MARGIN.t - MARGIN.b;
  const x = (t: number) => MARGIN.l + (t / duration) * iw;
  const y = (v: number) => MARGIN.t + ((hi - v) / (hi - lo)) * ih;
  const zeroY = y(0);

  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
  const xTicks = timeTicks(fullView(duration));

  // Best place first (drawn first = furthest back); the highlighted team (if
  // any) always moves to the very end (drawn last = on top), overriding place.
  const ordered = [...teams]
    .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity))
    .sort((a, b) => Number(a.id === highlightedTeamId) - Number(b.id === highlightedTeamId));

  // Each hump/dip of the highlighted team's own line, labelled with its
  // integral for context - only the highlighted team, or this would be
  // unreadable with several lines' worth of labels at once.
  const highlightedTeam = teams.find((t) => t.id === highlightedTeamId);
  const segments = highlightedTeam ? curveSegments(highlightedTeam.curve.ys, highlightedTeam.curve.step) : [];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label="Every team's judges averaged into one line each, over the routine."
      className="h-auto w-full text-gray-500"
    >
      <defs>
        <clipPath id="pool-overview-clip">
          <rect x={MARGIN.l} y={MARGIN.t} width={iw} height={ih} />
        </clipPath>
      </defs>

      {yTicks.map((v) => (
        <g key={`y${v}`}>
          {v !== 0 && <line x1={MARGIN.l} x2={MARGIN.l + iw} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.18" />}
          <text x={MARGIN.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor">
            {v > 0 ? '+' : v < 0 ? '−' : ''}
            {Math.abs(v)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={x(t)} x2={x(t)} y1={MARGIN.t} y2={MARGIN.t + ih} stroke="currentColor" strokeOpacity="0.18" />
          <text x={x(t)} y={HEIGHT - 10} textAnchor="middle" fontSize="11" fill="currentColor">
            {mmss(t)}
          </text>
        </g>
      ))}

      <line x1={MARGIN.l} x2={MARGIN.l + iw} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.25" />

      {[
        { t: 0, label: 'Start', anchor: 'start' as const, dx: 5 },
        { t: routineSeconds, label: 'End', anchor: 'end' as const, dx: -5 },
      ]
        .filter((mark) => mark.t >= 0 && mark.t <= duration)
        .map((mark) => (
          <g key={mark.label}>
            <line
              x1={x(mark.t)}
              x2={x(mark.t)}
              y1={MARGIN.t - 6}
              y2={MARGIN.t + ih}
              stroke="currentColor"
              strokeOpacity="0.75"
              strokeWidth="1.5"
            />
            <text x={x(mark.t) + mark.dx} y={MARGIN.t - 9} textAnchor={mark.anchor} fontSize="11" fontWeight="600" fill="currentColor">
              {mark.label}
            </text>
          </g>
        ))}

      <g clipPath="url(#pool-overview-clip)">
        {ordered.map((team) => {
          const color = teamColorVar(team.colorIndex);
          const highlighted = team.id === highlightedTeamId;
          const dimmed = highlightedTeamId !== null && !highlighted;
          const points = team.curve.ys.map((v, i) => `${i ? 'L' : 'M'}${x(i * team.curve.step).toFixed(1)} ${y(v).toFixed(1)}`).join('');
          const last = (team.curve.ys.length - 1) * team.curve.step;
          const area = `${points}L${x(last).toFixed(1)} ${zeroY.toFixed(1)}L${x(0).toFixed(1)} ${zeroY.toFixed(1)}Z`;
          return (
            <g key={team.id}>
              <path d={area} fill={color} fillOpacity={highlighted ? 0.22 : dimmed ? 0.04 : 0.12} />
              <path
                d={points}
                fill="none"
                stroke={color}
                strokeOpacity={highlighted ? 1 : dimmed ? 0.25 : 0.9}
                strokeWidth={highlighted ? 3 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <title>{team.name}</title>
            </g>
          );
        })}

        {highlightedTeam &&
          segments.map((segment) => {
            const mountain = segment.area > 0;
            const peakX = x(segment.peakIndex * highlightedTeam.curve.step);
            const peakY = y(highlightedTeam.curve.ys[segment.peakIndex]);
            const labelY = Math.min(MARGIN.t + ih - 4, Math.max(MARGIN.t + 10, mountain ? peakY - 8 : peakY + 14));
            return (
              <text
                key={segment.fromIndex}
                x={peakX}
                y={labelY}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill={teamColorVar(highlightedTeam.colorIndex)}
                paintOrder="stroke"
                stroke="var(--background)"
                strokeWidth="3"
                strokeLinejoin="round"
              >
                {signed(segment.area)}
              </text>
            );
          })}
      </g>
    </svg>
  );
}
