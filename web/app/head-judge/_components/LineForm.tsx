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
import { useT } from '@/lib/i18n/client';

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
  const t = useT();
  const count = moveCount(draft);
  const max = Number(draft[LINE_MAX_KEY]);
  const maxValid = validText(draft, LINE_MAX_KEY);
  const field = 'rounded border bg-transparent px-2 py-1';

  return (
    <div className="flex flex-col gap-3">
      <h4 className="mt-2 font-medium">{t.headJudge.numberline}</h4>
      <p className="text-sm text-gray-500">
        {t.headJudge.numberlineHelp}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="w-52 text-sm font-medium">{t.headJudge.numberlineMax}</span>
        <input
          type="number"
          inputMode="decimal"
          step={LINE_MAX_STEP}
          min={MIN_LINE_MAX}
          max={MAX_LINE_MAX}
          value={draft[LINE_MAX_KEY]}
          onChange={(e) => onEdit(LINE_MAX_KEY, e.target.value)}
          aria-label={t.headJudge.numberlineMaxLabel}
          aria-invalid={!maxValid}
          className={`w-28 ${field} ${maxValid ? 'border-gray-300' : 'border-red-500'}`}
        />
        <span className="text-sm text-gray-500">
          {t.headJudge.defaultRange(defaults.Diff.line!.max, MIN_LINE_MAX, MAX_LINE_MAX)}
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
                placeholder={t.headJudge.moveName}
                aria-label={t.headJudge.moveNameLabel(i + 1)}
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
                aria-label={t.headJudge.movePositionLabel(i + 1)}
                aria-invalid={!positionValid}
                className={`w-28 ${field} ${positionValid ? 'border-gray-300' : 'border-red-500'}`}
              />
              <span className="text-sm text-gray-500">
                {positionValid && maxValid ? t.headJudge.numberlineScore(Math.round(position * max * 100) / 100) : t.headJudge.position01}
              </span>
              <button
                type="button"
                onClick={() => onChange((d) => removeMove(d, i))}
                className="cursor-pointer text-sm text-gray-500 underline"
              >
                {t.headJudge.remove}
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
          {t.headJudge.addMove}
        </button>
      </div>
    </div>
  );
}
