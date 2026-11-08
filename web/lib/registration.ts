// Event Registration: the form model shared by the staff tool, the embed and the
// server. Plain data with no server imports, so client components can use it too.
//
// A form is an ordered list of questions. Most ask one thing; two kinds repeat:
// - per_division_*: once for each of the event's divisions (only the ticked ones,
//   when the form also has a `divisions` question)
// - meals: once for each day of the event, ticking options such as Lunch / Dinner

import type { PaymentSettings } from './registration-payment';

export const QUESTION_TYPES = [
  'text',
  'longtext',
  'date',
  'yesno',
  'choice',
  'checkboxes',
  'divisions',
  'per_division_text',
  'per_division_yesno',
  'meals',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// Types whose `options` the staff fill in (the choices, or each day's meals).
export const TYPES_WITH_OPTIONS: readonly QuestionType[] = ['choice', 'checkboxes', 'meals'];

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  options: string[];
};

export type FormStyle = {
  accent: string; // #rrggbb
  theme: 'light' | 'dark';
  buttonText: string; // '' = the default "Register"
  showEventInfo: boolean; // the event's name and dates above the form
};

export const DEFAULT_STYLE: FormStyle = { accent: '#2563eb', theme: 'light', buttonText: '', showEventInfo: true };

export type FormDivision = { id: string; name: string };

// Everything needed to show a form: the form, plus its event's divisions and dates.
export type PublicForm = {
  id: string;
  eventId: string;
  eventName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  title: string;
  intro: string;
  isOpen: boolean;
  questions: Question[];
  style: FormStyle;
  payment: PaymentSettings; // the Pay tab: packages and ways to pay
  divisions: FormDivision[];
};

// Answers by question id. per_division_* -> {divisionId: text | 'yes' | 'no'};
// meals -> {date: [options]}; checkboxes / divisions -> string[]; yesno -> 'yes' | 'no';
// the rest -> string. A divisions question also keeps the teammates picked for each
// ticked division under teammatesKey(its id): {divisionId: [player ids]}, and the ticked
// divisions where the player is looking for a partner under lookingKey(its id): [ids].
export type AnswerValue = string | string[] | Record<string, string | string[]>;
export type Answers = Record<string, AnswerValue>;

// The ready-made questions. Their labels (and the meals' options) come from the
// dictionary, in the language of whoever adds them (t.eventRegistration.presets).
export const PRESET_KEYS = ['arrive', 'leave', 'divisions', 'meals'] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];
export const PRESET_TYPES: Record<PresetKey, QuestionType> = {
  arrive: 'date',
  leave: 'date',
  divisions: 'divisions',
  meals: 'meals',
};

export const newQuestionId = () => Math.random().toString(36).slice(2, 10);

const ACCENT = /^#[0-9a-f]{6}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 2000;

// Questions as stored or sent in, cleaned to this shape (bad entries dropped).
export function cleanQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of raw.slice(0, 100)) {
    if (!q || typeof q !== 'object') continue;
    const r = q as Record<string, unknown>;
    const type = r.type as QuestionType;
    const id = typeof r.id === 'string' && /^[a-z0-9]{1,20}$/i.test(r.id) ? r.id : null;
    if (!id || seen.has(id) || !QUESTION_TYPES.includes(type)) continue;
    seen.add(id);
    const options = Array.isArray(r.options)
      ? r.options
          .filter((o): o is string => typeof o === 'string')
          .map((o) => o.trim().slice(0, 100))
          .filter(Boolean)
          .slice(0, 30)
      : [];
    out.push({
      id,
      type,
      label: typeof r.label === 'string' ? r.label.trim().slice(0, 300) : '',
      help: typeof r.help === 'string' ? r.help.trim().slice(0, 1000) : '',
      required: r.required === true,
      options: TYPES_WITH_OPTIONS.includes(type) ? [...new Set(options)] : [],
    });
  }
  return out;
}

export function cleanStyle(raw: unknown): FormStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    accent: typeof r.accent === 'string' && ACCENT.test(r.accent) ? r.accent.toLowerCase() : DEFAULT_STYLE.accent,
    theme: r.theme === 'dark' ? 'dark' : 'light',
    buttonText: typeof r.buttonText === 'string' ? r.buttonText.trim().slice(0, 60) : '',
    showEventInfo: r.showEventInfo !== false,
  };
}

// Every day of the event as YYYY-MM-DD (at most 31, in case of a mistyped end date).
export function eventDays(start: string, end: string): string[] {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return [];
  const days: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last && days.length < 31) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

// ---- Teammates (picked under each division ticked in a divisions question)

export const teammatesKey = (questionId: string) => `${questionId}_teammates`;

// How many teammates a division's team has besides the player: two in co-op (teams of
// three), else one (Pairs, Mixed, Women).
export const teammateSlots = (divisionName: string) => (/co-?op/i.test(divisionName) ? 2 : 1);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The teammates picked in a set of answers, by division id (ticked divisions only).
export function divisionTeammates(form: Pick<PublicForm, 'questions' | 'divisions'>, answers: Answers): Record<string, string[]> {
  const picker = form.questions.find((q) => q.type === 'divisions');
  if (!picker) return {};
  const ticked = answers[picker.id];
  const raw = asObject(answers[teammatesKey(picker.id)]);
  const out: Record<string, string[]> = {};
  for (const d of form.divisions) {
    if (!Array.isArray(ticked) || !ticked.includes(d.id)) continue;
    const list = raw[d.id];
    const ids = Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === 'string' && UUID.test(x)))] : [];
    if (ids.length) out[d.id] = ids.slice(0, teammateSlots(d.name));
  }
  return out;
}

export const lookingKey = (questionId: string) => `${questionId}_looking`;

// The ticked divisions where the player says they're looking for a partner (teammates in
// co-op). Only while their team there isn't full: a full team isn't looking.
export function divisionsLooking(form: Pick<PublicForm, 'questions' | 'divisions'>, answers: Answers): string[] {
  const picker = form.questions.find((q) => q.type === 'divisions');
  if (!picker) return [];
  const flagged = answers[lookingKey(picker.id)];
  if (!Array.isArray(flagged)) return [];
  const ticked = answers[picker.id];
  const teammates = divisionTeammates(form, answers);
  return form.divisions
    .filter(
      (d) =>
        flagged.includes(d.id) &&
        Array.isArray(ticked) &&
        ticked.includes(d.id) &&
        (teammates[d.id] ?? []).length < teammateSlots(d.name)
    )
    .map((d) => d.id);
}

// Someone who registered naming this player as a teammate: their division and team.
export type TeammateInvite = { divisionId: string; playerIds: string[]; fromName: string };

// Ticks each invite's division and fills in its teammates, unless the player already
// picked teammates there. Returns the answers and the invites that changed something.
export function applyInvites(
  form: Pick<PublicForm, 'questions' | 'divisions'>,
  answers: Answers,
  invites: TeammateInvite[]
): { answers: Answers; applied: TeammateInvite[] } {
  const picker = form.questions.find((q) => q.type === 'divisions');
  if (!picker || invites.length === 0) return { answers, applied: [] };
  const ticked = new Set(Array.isArray(answers[picker.id]) ? (answers[picker.id] as string[]) : []);
  const teammates = { ...(asObject(answers[teammatesKey(picker.id)]) as Record<string, string[]>) };
  const applied: TeammateInvite[] = [];
  for (const invite of invites) {
    const division = form.divisions.find((d) => d.id === invite.divisionId);
    if (!division) continue;
    const already = ticked.has(invite.divisionId) && (teammates[invite.divisionId] ?? []).length > 0;
    if (already) continue;
    ticked.add(invite.divisionId);
    teammates[invite.divisionId] = invite.playerIds.slice(0, teammateSlots(division.name));
    applied.push(invite);
  }
  if (!applied.length) return { answers, applied };
  return { answers: { ...answers, [picker.id]: [...ticked], [teammatesKey(picker.id)]: teammates }, applied };
}

// The divisions a per-division question asks about, given the answers so far: the
// ticked ones when the form has a divisions question, else every division.
export function askedDivisions(form: Pick<PublicForm, 'questions' | 'divisions'>, answers: Answers): FormDivision[] {
  const picker = form.questions.find((q) => q.type === 'divisions');
  if (!picker) return form.divisions;
  const ticked = answers[picker.id];
  const ids = new Set(Array.isArray(ticked) ? ticked : []);
  return form.divisions.filter((d) => ids.has(d.id));
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : '');
const strList = (v: unknown, allowed: readonly string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)))] : [];
const asObject = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
const yesNo = (v: unknown) => (v === 'yes' || v === 'no' ? v : '');

// Keeps only answers to this form's questions, in the right shape. Returns them with
// the ids of mandatory questions left unanswered.
export function cleanAnswers(form: PublicForm, raw: unknown): { answers: Answers; missing: string[] } {
  const input = asObject(raw);
  const answers: Answers = {};
  const missing: string[] = [];
  const divisionIds = form.divisions.map((d) => d.id);
  const days = eventDays(form.startDate, form.endDate);

  // The divisions question first: the per-division ones depend on its answer.
  const ordered = [...form.questions].sort((a, b) => Number(b.type === 'divisions') - Number(a.type === 'divisions'));
  for (const q of ordered) {
    const v = input[q.id];
    let answered = false;
    switch (q.type) {
      case 'text':
      case 'longtext': {
        const s = str(v);
        if (s) answers[q.id] = s;
        answered = !!s;
        break;
      }
      case 'date': {
        const s = str(v);
        answered = ISO_DATE.test(s);
        if (answered) answers[q.id] = s;
        break;
      }
      case 'yesno': {
        const s = yesNo(v);
        if (s) answers[q.id] = s;
        answered = !!s;
        break;
      }
      case 'choice': {
        const s = str(v);
        answered = q.options.includes(s);
        if (answered) answers[q.id] = s;
        break;
      }
      case 'checkboxes':
      case 'divisions': {
        const list = strList(v, q.type === 'divisions' ? divisionIds : q.options);
        if (list.length) answers[q.id] = list;
        answered = list.length > 0;
        if (q.type === 'divisions' && list.length) {
          // Teammates are optional: kept for ticked divisions only, as player ids.
          const teammates = divisionTeammates(form, { [q.id]: list, [teammatesKey(q.id)]: input[teammatesKey(q.id)] as AnswerValue });
          if (Object.keys(teammates).length) answers[teammatesKey(q.id)] = teammates;
          const looking = divisionsLooking(form, { ...answers, [lookingKey(q.id)]: input[lookingKey(q.id)] as AnswerValue });
          if (looking.length) answers[lookingKey(q.id)] = looking;
        }
        break;
      }
      case 'per_division_text':
      case 'per_division_yesno': {
        const asked = askedDivisions(form, answers);
        const obj = asObject(v);
        const kept: Record<string, string> = {};
        for (const d of asked) {
          const s = q.type === 'per_division_yesno' ? yesNo(obj[d.id]) : str(obj[d.id]);
          if (s) kept[d.id] = s;
        }
        if (Object.keys(kept).length) answers[q.id] = kept;
        // Mandatory means an answer for every division asked about.
        answered = asked.every((d) => kept[d.id]);
        break;
      }
      case 'meals': {
        const obj = asObject(v);
        const kept: Record<string, string[]> = {};
        for (const day of days) {
          const list = strList(obj[day], q.options);
          if (list.length) kept[day] = list;
        }
        if (Object.keys(kept).length) answers[q.id] = kept;
        // Mandatory means at least one meal ticked.
        answered = Object.keys(kept).length > 0;
        break;
      }
    }
    if (q.required && !answered) missing.push(q.id);
  }
  return { answers, missing };
}

// An answer as one line of text, for the staff table and the CSV export. A divisions
// answer lists each division with its teammates: "Open Pairs (with Ann Lee)".
export function answerText(
  q: Question,
  answers: Answers,
  divisions: FormDivision[],
  words: { yes: string; no: string; with: (names: string) => string; looking: string },
  dayName: (isoDate: string) => string,
  playerName: (id: string) => string
): string {
  const value = answers[q.id];
  if (value === undefined) return '';
  const divisionName = (id: string) => divisions.find((d) => d.id === id)?.name ?? id;
  const yn = (s: string) => (s === 'yes' ? words.yes : s === 'no' ? words.no : s);
  if (typeof value === 'string') return q.type === 'yesno' ? yn(value) : value;
  if (Array.isArray(value) && q.type === 'divisions') {
    const teammates = asObject(answers[teammatesKey(q.id)]);
    const looking = answers[lookingKey(q.id)];
    return value
      .map((id) => {
        const mates = Array.isArray(teammates[id]) ? (teammates[id] as string[]) : [];
        const text = mates.length ? `${divisionName(id)} ${words.with(mates.map(playerName).join(', '))}` : divisionName(id);
        return Array.isArray(looking) && looking.includes(id) ? `${text} · ${words.looking}` : text;
      })
      .join(', ');
  }
  if (Array.isArray(value)) return value.join(', ');
  return Object.entries(value)
    .map(([key, v]) =>
      q.type === 'meals'
        ? `${dayName(key)}: ${Array.isArray(v) ? v.join(', ') : v}`
        : `${divisionName(key)}: ${typeof v === 'string' ? yn(v) : v.join(', ')}`
    )
    .join('; ');
}

// The names written in a teammates answer: "Jane Doe / John Smith", "Ann & Bob",
// "Ann, Bob and Cy"… Placeholders such as "TBD" or "?" are left out.
const PLACEHOLDERS = new Set(['tbd', 'tba', '?', '-', '--', 'n/a', 'na', 'none', 'no', 'nobody', 'ninguno', 'nadie', 'pendiente', 'unknown']);
export function splitTeammates(text: string): string[] {
  return text
    .split(/\s*(?:[\/,&+;\n|]|\s(?:and|y)\s)\s*/i)
    .map((s) => s.trim().replace(/\s+/g, ' ').replace(/^[-–—•*.]+|[.]+$/g, '').trim())
    .filter((s) => s.length > 1 && !PLACEHOLDERS.has(s.toLowerCase()) && /\p{L}/u.test(s));
}

// ---- Players & teams (the form's second tab)

export type RosterPlayer = { id: string; name: string };
// Looking for a partner: with their Discord user id (when known), for a message button.
export type LookingPlayer = RosterPlayer & { discordId: string | null };
// registered: whether that member has registered for this division themselves.
export type RosterTeam = { members: (RosterPlayer & { registered: boolean })[]; looking: boolean };
export type RosterDivision = {
  id: string;
  name: string;
  players: number; // registered for this division
  teams: RosterTeam[];
  looking: LookingPlayer[]; // on their own, looking for a partner
  solo: RosterPlayer[]; // on their own, not looking
};

// Who's in each division: teams joined up from the teammates people picked (A picking B and
// B picking C make one team), then those still on their own.
export function buildRoster(
  form: Pick<PublicForm, 'questions' | 'divisions'>,
  registrations: { playerId: string; name: string; answers: Answers; discordId: string | null }[],
  names: Record<string, string>
): RosterDivision[] {
  const picker = form.questions.find((q) => q.type === 'divisions');
  if (!picker) return [];
  const byName = (a: RosterPlayer, b: RosterPlayer) => a.name.localeCompare(b.name);
  const anyName = new Map(registrations.map((r) => [r.playerId, r.name]));
  const out: RosterDivision[] = [];
  for (const d of form.divisions) {
    const regs = registrations.filter((r) => {
      const ticked = r.answers[picker.id];
      return Array.isArray(ticked) && ticked.includes(d.id);
    });
    if (!regs.length) continue;
    const registered = new Map(regs.map((r) => [r.playerId, r]));
    const nameOf = (id: string) => anyName.get(id) ?? names[id] ?? '?';

    // Join every registrant with the teammates they picked here.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      while (parent.get(x) !== x) x = parent.get(x) as string;
      return x;
    };
    const join = (a: string, b: string) => {
      for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
      parent.set(find(a), find(b));
    };
    for (const r of regs) {
      if (!parent.has(r.playerId)) parent.set(r.playerId, r.playerId);
      for (const mate of divisionTeammates(form, r.answers)[d.id] ?? []) join(r.playerId, mate);
    }
    const groups = new Map<string, string[]>();
    for (const id of parent.keys()) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);

    const division: RosterDivision = { id: d.id, name: d.name, players: regs.length, teams: [], looking: [], solo: [] };
    for (const ids of groups.values()) {
      if (ids.length === 1) {
        const r = registered.get(ids[0]) as (typeof regs)[number];
        if (divisionsLooking(form, r.answers).includes(d.id)) division.looking.push({ id: r.playerId, name: r.name, discordId: r.discordId });
        else division.solo.push({ id: r.playerId, name: r.name });
        continue;
      }
      const members = ids.map((id) => ({ id, name: nameOf(id), registered: registered.has(id) })).sort(byName);
      const looking =
        ids.length < teammateSlots(d.name) + 1 && ids.some((id) => registered.has(id) && divisionsLooking(form, registered.get(id)!.answers).includes(d.id));
      division.teams.push({ members, looking });
    }
    division.teams.sort((a, b) => byName(a.members[0], b.members[0]));
    division.looking.sort(byName);
    division.solo.sort(byName);
    out.push(division);
  }
  return out;
}
