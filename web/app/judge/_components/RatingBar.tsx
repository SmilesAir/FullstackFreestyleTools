'use client';

import { DIFFICULTY_NOTES } from '@/lib/judging';
import { NOTE_STYLE } from './noteStyles';
import { useT } from '@/lib/i18n/client';
import { noteLabel } from '@/lib/i18n/labels';

// The row of buttons that rates a move placed on the numberline: Bad, Average,
// Good, and Cancel. Editing a note also offers Delete. Fills the height it is
// given.
export function RatingBar({
  onRate,
  onCancel,
  onDelete,
  disabled = false,
}: {
  onRate: (rating: string) => void;
  onCancel: () => void;
  // Only when a note that is already saved is being edited.
  onDelete?: () => void;
  // Nothing is placed yet, so nothing can be rated.
  disabled?: boolean;
}) {
  const t = useT();
  // The order asked for: Bad, Average, Good (the notes list best first).
  const ratings = [...DIFFICULTY_NOTES].reverse();
  return (
    <div className="flex h-full w-full gap-2 touch-manipulation select-none">
      {ratings.map((rating) => (
        <button
          key={rating.type}
          type="button"
          disabled={disabled}
          onClick={() => onRate(rating.type)}
          className={`h-full min-w-0 flex-1 cursor-pointer rounded-lg px-1 text-lg font-bold shadow-sm transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${NOTE_STYLE[rating.type]}`}
        >
          {noteLabel(t, rating.type)}
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="h-full min-w-0 flex-1 cursor-pointer rounded-lg border-2 border-gray-300 bg-background px-1 text-lg font-bold transition active:scale-[0.97]"
      >
        {t.common.cancel}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="h-full min-w-0 flex-1 cursor-pointer rounded-lg border-2 border-red-600 bg-background px-1 text-lg font-bold text-red-700 transition active:scale-[0.97]"
        >
          {t.judging.delete}
        </button>
      )}
    </div>
  );
}
