'use client';

import { useRef } from 'react';
import type { DifficultyLine } from '@/lib/judging';

// Room above the top and below the bottom of the line, so a move name at either
// end isn't cut off.
const PAD = 16;

// Space between the marker and the buttons beside it.
const POPUP_GAP = 12;

// Hash marks like a football field's yard lines: a long line across at every
// tenth and short hashes at the edges between them. They are only a visual help
// (no numbers on the line). Positions are 0 (bottom) to 1 (top) of the track.
const MAJORS = Array.from({ length: 11 }, (_, i) => i / 10);
const MINORS = Array.from({ length: 50 }, (_, i) => i / 50).filter((p) => Math.round(p * 10) / 10 !== p);

// The Difficulty judge's vertical numberline. The moves named in the settings
// are laid over it at their positions. Tapping the line picks a position (any
// height, the tap's time is given with it); tapping a move's name picks exactly
// that move's position. `marker` is the picked position, if any, and `popup`
// (the rating buttons) is shown right beside it, under the marker or above it
// when the marker is low on the line, so the eyes don't have to travel. It fills
// the height it is given.
export function Numberline({
  line,
  marker,
  onPick,
  popup,
  disabled = false,
}: {
  line: DifficultyLine;
  marker: number | null;
  onPick: (position: number, tappedAt: number) => void;
  popup?: React.ReactNode;
  disabled?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);

  function pickAt(clientY: number) {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const position = 1 - (clientY - rect.top) / rect.height;
    onPick(Math.round(Math.min(1, Math.max(0, position)) * 1000) / 1000, Date.now());
  }

  return (
    <div
      role="group"
      aria-label="Difficulty numberline"
      onPointerDown={(e) => {
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        pickAt(e.clientY);
      }}
      className={`relative min-h-32 flex-1 touch-manipulation select-none rounded-xl border border-gray-300 ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      }`}
    >
      <div ref={track} className="absolute inset-x-0" style={{ top: PAD, bottom: PAD }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-gray-500"
        >
          {MAJORS.map((p) => (
            <line
              key={`m${p}`}
              x1="0"
              x2="100"
              y1={(1 - p) * 100}
              y2={(1 - p) * 100}
              stroke="currentColor"
              strokeOpacity="0.45"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {MINORS.map((p) => (
            <g key={`h${p}`}>
              <line x1="0" x2="4" y1={(1 - p) * 100} y2={(1 - p) * 100} stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
              <line x1="96" x2="100" y1={(1 - p) * 100} y2={(1 - p) * 100} stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>

        {line.moves.map((move, i) => (
          <div
            key={`${move.name}:${i}`}
            onPointerDown={(e) => {
              if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
              e.stopPropagation();
              onPick(move.position, Date.now());
            }}
            className="absolute left-1/2 max-w-[80%] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-gray-400 bg-background/90 px-4 py-1.5 text-base font-semibold"
            style={{ top: `${(1 - move.position) * 100}%` }}
          >
            {move.name}
          </div>
        ))}

        {marker !== null && (
          <div className="pointer-events-none absolute inset-x-0" style={{ top: `${(1 - marker) * 100}%` }}>
            <div className="h-[3px] -translate-y-1/2 bg-blue-600" />
            <span className="absolute left-0 top-0 h-0 w-0 -translate-y-1/2 border-y-[9px] border-l-[14px] border-y-transparent border-l-blue-600" />
            <span className="absolute right-0 top-0 h-0 w-0 -translate-y-1/2 border-y-[9px] border-r-[14px] border-y-transparent border-r-blue-600" />
          </div>
        )}
      </div>

      {marker !== null && popup && (
        <div
          // Taps on the buttons are not taps on the line.
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-x-2 z-10 h-16 rounded-xl border border-gray-300 bg-background p-1 shadow-lg"
          style={{
            top: `calc(${PAD}px + ${1 - marker} * (100% - ${2 * PAD}px))`,
            // Under the marker, or above it in the lower part of the line.
            transform: marker < 0.4 ? `translateY(calc(-100% - ${POPUP_GAP}px))` : `translateY(${POPUP_GAP}px)`,
          }}
        >
          {popup}
        </div>
      )}
    </div>
  );
}
