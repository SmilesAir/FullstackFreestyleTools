'use client';

import {
  LINE_MAX_STEP,
  MAX_LINE_MAX,
  MAX_MOVE_NAME,
  MAX_MOVES,
  MIN_LINE_MAX,
  POSITION_STEP,
  type SystemSettings,
} from '@/lib/judging-settings';
import {
  LINE_MAX_KEY,
  addMove,
  moveCount,
  moveKey,
  removeMove,
  validMoveName,
  validMovePosition,
  validText,
  type Draft,
} from './settingsDraft';

// Difficulty's numberline on the Settings tab: its max (the numberline score at
// the top; the bottom is 0) and the moves named on it. A move sits at a position from 0
// to 1, so it stays where it is on the judge's screen when the max changes.
export function LineForm({
  draft,
  defaults,
  onEdit,
  onChange,
}: {
  draft: Draft;
  defaults: SystemSettings;
  onEdit: (key: string, text: string) => void;
  // Changes the whole draft (adding or removing a move).
  onChange: (change: (draft: Draft) => Draft) => void;
}) {
  const count = moveCount(draft);
  const max = Number(draft[LINE_MAX_KEY]);
  const maxValid = validText(draft, LINE_MAX_KEY);
  const field = 'rounded border bg-transparent px-2 py-1';

  return (
    <div className="flex flex-col gap-3">
      <h4 className="mt-2 font-medium">Difficulty numberline</h4>
      <p className="text-sm text-gray-500">
        The judge places each move on a vertical line with no numbers on it. A tap&apos;s numberline score is its
        position (0 at the bottom, 1 at the top) times the max, then the rating&apos;s multiplier applies. Moves are
        placed by position, so they stay put when the max changes.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="w-52 text-sm font-medium">Numberline max (score at the top)</span>
        <input
          type="number"
          inputMode="decimal"
          step={LINE_MAX_STEP}
          min={MIN_LINE_MAX}
          max={MAX_LINE_MAX}
          value={draft[LINE_MAX_KEY]}
          onChange={(e) => onEdit(LINE_MAX_KEY, e.target.value)}
          aria-label="Numberline max"
          aria-invalid={!maxValid}
          className={`w-28 ${field} ${maxValid ? 'border-gray-300' : 'border-red-500'}`}
        />
        <span className="text-sm text-gray-500">
          default {defaults.Diff.line!.max}, range {MIN_LINE_MAX} to {MAX_LINE_MAX}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {Array.from({ length: count }, (_, i) => {
          const nameValid = validMoveName(draft, i);
          const positionValid = validMovePosition(draft, i);
          const position = Number(draft[moveKey(i, 'position')]);
          return (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={draft[moveKey(i, 'name')]}
                maxLength={MAX_MOVE_NAME}
                onChange={(e) => onEdit(moveKey(i, 'name'), e.target.value)}
                placeholder="Move name"
                aria-label={`Move ${i + 1} name`}
                aria-invalid={!nameValid}
                className={`w-52 ${field} ${nameValid ? 'border-gray-300' : 'border-red-500'}`}
              />
              <input
                type="number"
                inputMode="decimal"
                step={POSITION_STEP}
                min={0}
                max={1}
                value={draft[moveKey(i, 'position')]}
                onChange={(e) => onEdit(moveKey(i, 'position'), e.target.value)}
                aria-label={`Move ${i + 1} position`}
                aria-invalid={!positionValid}
                className={`w-28 ${field} ${positionValid ? 'border-gray-300' : 'border-red-500'}`}
              />
              <span className="text-sm text-gray-500">
                {positionValid && maxValid ? `numberline score ${Math.round(position * max * 100) / 100}` : 'position 0 to 1'}
              </span>
              <button
                type="button"
                onClick={() => onChange((d) => removeMove(d, i))}
                className="cursor-pointer text-sm text-gray-500 underline"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <button
          type="button"
          onClick={() => onChange(addMove)}
          disabled={count >= MAX_MOVES}
          className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add a move
        </button>
      </div>
    </div>
  );
}
