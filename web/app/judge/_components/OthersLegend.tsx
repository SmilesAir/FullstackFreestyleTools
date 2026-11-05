'use client';

import type { OtherCurve } from '@/lib/judging';
import { useT } from '@/lib/i18n/client';
import { categoryLabel } from '@/lib/i18n/labels';
import { OTHER_COLOR } from './noteStyles';

// The key for the averaged lines under a judge's graph: one chip per category
// that has one, and what the judge's own graph is. Nothing without any.
export function OthersLegend({
  others,
  className = '',
  showYou = true,
  bold = false,
}: {
  others: readonly OtherCurve[];
  className?: string;
  // Off where there is no graph of one judge's own.
  showYou?: boolean;
  // The chips in full colour, for lines drawn in full colour.
  bold?: boolean;
}) {
  const t = useT();
  const present = [...new Set(others.map((o) => o.category))];
  if (present.length === 0) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 ${className}`}>
      {showYou && (
        <li className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-green-600 to-red-600" />
          {t.judging.you}
        </li>
      )}
      {present.map((category) => (
        <li key={category} className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${bold ? '' : 'opacity-40'}`} style={{ backgroundColor: OTHER_COLOR[category] }} />
          {t.judging.categoryAverage(categoryLabel(t, category))}
        </li>
      ))}
    </ul>
  );
}
