// Pure date math for the Event Editor's calendar - no library, native Date
// only, matching how the rest of the app handles dates. Dates are plain
// 'YYYY-MM-DD' strings throughout, same as events.start_date/end_date.

export type MonthKey = string; // 'YYYY-MM'

export const monthKey = (year: number, month0: number): MonthKey => `${year}-${String(month0 + 1).padStart(2, '0')}`;

export function parseMonthKey(key: MonthKey): { year: number; month0: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month0: m - 1 };
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const { year, month0 } = parseMonthKey(key);
  const d = new Date(year, month0 + delta, 1);
  return monthKey(d.getFullYear(), d.getMonth());
}

export const monthKeyOfDateString = (date: string): MonthKey => date.slice(0, 7);

export const currentMonthKey = (): MonthKey => {
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth());
};

// 'YYYY-MM-DD' from local-time getters, never toISOString (which can shift
// the day across a UTC offset boundary).
function dateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Every date (as 'YYYY-MM-DD') from start to end, inclusive.
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return [];
  while (d <= last) {
    dates.push(dateString(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return dates;
}

export type MonthGridWeek = string[]; // 7 'YYYY-MM-DD' strings, Sunday first

// A month's grid as whole weeks, including the leading/trailing days of
// adjacent months needed to fill the first and last rows.
export function monthGrid(key: MonthKey): MonthGridWeek[] {
  const { year, month0 } = parseMonthKey(key);
  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0);
  const start = new Date(year, month0, 1 - first.getDay());
  const end = new Date(year, month0, last.getDate() + (6 - last.getDay()));

  const days: string[] = [];
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(dateString(d));
  }

  const weeks: MonthGridWeek[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export const monthLabel = (key: MonthKey): string => {
  const { year, month0 } = parseMonthKey(key);
  return new Date(year, month0, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

// A starting window of months around (and including) `around`.
export const initialMonthWindow = (around: MonthKey, before = 2, after = 2): MonthKey[] => {
  const keys: MonthKey[] = [];
  for (let i = -before; i <= after; i++) keys.push(addMonths(around, i));
  return keys;
};

// Every month key's event list in one pass - events keyed by every day they
// cover (a multi-day event appears once per covered day, independently; see
// the Event Editor plan's "pill-per-day" decision, not a spanning bar).
export function eventsByDate<T extends { start_date: string; end_date: string }>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of events) {
    for (const date of dateRange(e.start_date, e.end_date)) {
      const list = map.get(date);
      if (list) list.push(e);
      else map.set(date, [e]);
    }
  }
  return map;
}
