'use client';

export type ResultsSortOrder = 'play' | 'place';

const button = (active: boolean) =>
  `cursor-pointer rounded border px-2 py-1 text-xs ${active ? 'border-black bg-black text-white' : 'border-gray-300 hover:bg-gray-100'}`;

// Toggles a results table between the order teams played in and best-to-worst
// by place. Shared by the Fpa2027 summary table and the Simple Ranking table.
export function SortToggle({ value, onChange }: { value: ResultsSortOrder; onChange: (order: ResultsSortOrder) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Sort order">
      <button type="button" aria-pressed={value === 'play'} onClick={() => onChange('play')} className={button(value === 'play')}>
        Play order
      </button>
      <button type="button" aria-pressed={value === 'place'} onClick={() => onChange('place')} className={button(value === 'place')}>
        By place
      </button>
    </div>
  );
}
