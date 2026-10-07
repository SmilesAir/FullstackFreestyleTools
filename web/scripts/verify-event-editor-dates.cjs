/* eslint-disable @typescript-eslint/no-require-imports */
// Checks the Event Editor calendar's hand-rolled, library-free date math
// (lib/event-editor-dates.ts) - month/year rollovers, leap years, and
// multi-day event date-string iteration. No database or Next.js server
// context needed. Run with: node scripts/verify-event-editor-dates.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};
const { addMonths, dateRange, eventsByDate, initialMonthWindow, monthGrid, monthKeyOfDateString, monthLabel } = require(
  path.join(__dirname, '..', 'lib', 'event-editor-dates.ts')
);

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

// ---- addMonths: year rollovers in both directions
eq('addMonths forward across year end', addMonths('2025-12', 1), '2026-01');
eq('addMonths backward across year start', addMonths('2026-01', -1), '2025-12');
eq('addMonths several years forward', addMonths('2024-03', 24), '2026-03');

// ---- monthKeyOfDateString
eq('monthKeyOfDateString', monthKeyOfDateString('2026-07-04'), '2026-07');

// ---- monthLabel
eq('monthLabel', monthLabel('2026-01'), 'January 2026');

// ---- monthGrid: every week is 7 days, first/last cell align to Sun/Sat, covers the whole month
{
  const weeks = monthGrid('2026-02'); // Feb 2026: 1st is a Sunday, 28 days - exactly 4 whole weeks
  check('monthGrid Feb 2026 is whole weeks', weeks.every((w) => w.length === 7), JSON.stringify(weeks));
  eq('monthGrid Feb 2026 starts on the 1st (Sunday-aligned)', weeks[0][0], '2026-02-01');
  eq('monthGrid Feb 2026 ends on the 28th', weeks[weeks.length - 1][6], '2026-02-28');
}
{
  // Leap year: Feb 2028 has 29 days.
  const weeks = monthGrid('2028-02');
  const allDays = weeks.flat();
  check('monthGrid Feb 2028 is whole weeks', weeks.every((w) => w.length === 7), JSON.stringify(weeks));
  check('monthGrid Feb 2028 (leap year) includes the 29th', allDays.includes('2028-02-29'), JSON.stringify(allDays));
  // Every day in the grid is consecutive with no gaps or repeats.
  const consecutive = allDays.every((d, i) => i === 0 || dateRange(allDays[i - 1], d).length === 2);
  check('monthGrid Feb 2028 days are consecutive with no gaps', consecutive, JSON.stringify(allDays));
}
{
  // Month boundary: Dec 2025 -> Jan 2026 rollover, and leading/trailing adjacent-month days.
  const weeks = monthGrid('2025-12');
  const allDays = weeks.flat();
  check('monthGrid Dec 2025 includes trailing January days', allDays.some((d) => d.startsWith('2026-01')), JSON.stringify(allDays));
}

// ---- dateRange: single day, multi-day within a month, and across a month boundary
eq('dateRange single day', dateRange('2026-03-10', '2026-03-10'), ['2026-03-10']);
eq('dateRange multi-day within a month', dateRange('2026-03-10', '2026-03-12'), ['2026-03-10', '2026-03-11', '2026-03-12']);
eq('dateRange across a month boundary', dateRange('2026-01-30', '2026-02-02'), [
  '2026-01-30',
  '2026-01-31',
  '2026-02-01',
  '2026-02-02',
]);
eq('dateRange across a leap-year Feb 29', dateRange('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
eq('dateRange with end before start is empty', dateRange('2026-03-10', '2026-03-09'), []);

// ---- eventsByDate: a multi-day event appears on every day it covers (pill-per-day, not a spanning bar)
{
  const events = [
    { id: 'a', start_date: '2026-06-18', end_date: '2026-06-20' },
    { id: 'b', start_date: '2026-06-19', end_date: '2026-06-19' },
  ];
  const map = eventsByDate(events);
  eq('eventsByDate: 3-day event appears on all 3 days', (map.get('2026-06-18') ?? []).map((e) => e.id), ['a']);
  eq('eventsByDate: overlapping day has both events', (map.get('2026-06-19') ?? []).map((e) => e.id), ['a', 'b']);
  eq('eventsByDate: last day of the range', (map.get('2026-06-20') ?? []).map((e) => e.id), ['a']);
  check('eventsByDate: day with no events is absent', !map.has('2026-06-21'), 'expected no entry');
}

// ---- initialMonthWindow
eq('initialMonthWindow default ±2 around a month', initialMonthWindow('2026-06'), [
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
]);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
