import 'server-only';
import crypto from 'node:crypto';
import { pool } from './db';
import { isPlaceholderEmail } from './oauth-placeholder';
import {
  buildRoster,
  cleanQuestions,
  cleanStyle,
  divisionTeammates,
  type Answers,
  type PublicForm,
  type RosterDivision,
  type TeammateInvite,
} from './registration';
import { cleanPayment, EMPTY_PAYMENT } from './registration-payment';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

// ---- Signing in inside the embed
//
// A tournament's website shows the form in an iframe, where browsers don't send this
// site's sign-in cookie (it's a third-party cookie there) and keep the iframe's storage
// apart from this site's own. So the embed makes a random code and opens a window on
// this site (/register/<form>/connect?n=<code>), where the player signs in as usual and
// presses Continue (so nobody can take over a player's account by sending them such a
// link). That records the code against the account (registration_handoffs). The embed,
// asking every few seconds, swaps the code for a token naming the account, signed with
// AUTH_SECRET and good for one form for a few hours, and sends it with each call instead
// of the cookie. (A message through window.opener would be quicker, but signing in with
// Google cuts the window off from the page that opened it.)

const TOKEN_HOURS = 6;
const sign = (payload: string) =>
  crypto.createHmac('sha256', process.env.AUTH_SECRET ?? '').update(`registration:${payload}`).digest('base64url');

export function makeRegistrationToken(formId: string, userId: string): string {
  const payload = `${formId}.${userId}.${Date.now() + TOKEN_HOURS * 3600 * 1000}`;
  return `${payload}.${sign(payload)}`;
}

// The account a token names; null when it's forged, expired or for another form.
export function readRegistrationToken(token: unknown, formId: string): string | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [form, user, expires, mac] = parts;
  const expected = sign(`${form}.${user}.${expires}`);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (form !== formId || !isUuid(user) || !(Number(expires) > Date.now())) return null;
  return user;
}

export const isHandoffCode = (n: unknown): n is string => typeof n === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(n);

export async function recordHandoff(formId: string, code: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM registration_handoffs WHERE created_at < now() - interval '10 minutes'`);
  await pool.query(
    'INSERT INTO registration_handoffs (nonce, form_id, user_id) VALUES ($1, $2, $3) ON CONFLICT (nonce) DO NOTHING',
    [code, formId, userId]
  );
}

// The account a code was recorded for; null until then (or once it's too old). Can be
// collected again within the 10 minutes, so a reply lost on the way (the browser cancelling
// a request as the sign-in window closes) doesn't lose the sign-in: the embed's next check
// gets it. The code is random and known only to the embed and its sign-in window.
export async function claimHandoff(formId: string, code: string): Promise<string | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM registration_handoffs
     WHERE nonce = $1 AND form_id = $2 AND created_at > now() - interval '10 minutes'`,
    [code, formId]
  );
  return rows[0]?.user_id ?? null;
}

// ---- Forms

async function loadForm(column: 'f.id' | 'f.event_id', value: string): Promise<PublicForm | null> {
  if (!isUuid(value)) return null;
  const { rows } = await pool.query<{
    id: string; event_id: string; event_name: string; start_date: string; end_date: string;
    title: string; intro: string; is_open: boolean; questions: unknown; style: unknown; payment: unknown;
  }>(
    `SELECT f.id, f.event_id, e.event_name, e.start_date::text, e.end_date::text,
            f.title, f.intro, f.is_open, f.questions, f.style, f.payment
     FROM registration_forms f JOIN events e ON e.id = f.event_id
     WHERE ${column} = $1`,
    [value]
  );
  const r = rows[0];
  if (!r) return null;
  const divisions = await pool.query<{ id: string; name: string }>(
    'SELECT id, division_name AS name FROM divisions WHERE event_id = $1 ORDER BY division_name',
    [r.event_id]
  );
  return {
    id: r.id,
    eventId: r.event_id,
    eventName: r.event_name,
    startDate: r.start_date,
    endDate: r.end_date,
    title: r.title,
    intro: r.intro,
    isOpen: r.is_open,
    questions: cleanQuestions(r.questions),
    style: cleanStyle(r.style),
    payment: cleanPayment(r.payment),
    divisions: divisions.rows,
  };
}

export const getForm = (formId: string) => loadForm('f.id', formId);

// The staff tool's form for an event: the saved one, else a blank one to start from
// (id '' until its first save creates it). Null for an unknown event.
export async function getFormOrDraft(eventId: string): Promise<{ form: PublicForm; saved: boolean } | null> {
  const saved = await loadForm('f.event_id', eventId);
  if (saved) return { form: saved, saved: true };
  if (!isUuid(eventId)) return null;
  const { rows } = await pool.query<{ event_name: string; start_date: string; end_date: string }>(
    'SELECT event_name, start_date::text, end_date::text FROM events WHERE id = $1',
    [eventId]
  );
  const e = rows[0];
  if (!e) return null;
  const divisions = await pool.query<{ id: string; name: string }>(
    'SELECT id, division_name AS name FROM divisions WHERE event_id = $1 ORDER BY division_name',
    [eventId]
  );
  return {
    saved: false,
    form: {
      id: '',
      eventId,
      eventName: e.event_name,
      startDate: e.start_date,
      endDate: e.end_date,
      title: '',
      intro: '',
      isOpen: false,
      questions: [],
      style: cleanStyle({}),
      payment: EMPTY_PAYMENT,
      divisions: divisions.rows,
    },
  };
}

// ---- The staff tool's event list

export type RegistrationEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isTest: boolean;
  formId: string | null;
  isOpen: boolean;
  registered: number;
  paid: number;
};

// The event picker: events that haven't finished, soonest first, then past ones,
// newest first. Hidden events only when they already have a form.
export async function listRegistrationEvents(): Promise<(RegistrationEvent & { upcoming: boolean })[]> {
  const { rows } = await pool.query<{
    id: string; name: string; start_date: string; end_date: string; is_test: boolean;
    form_id: string | null; is_open: boolean | null; registered: string; paid: string; upcoming: boolean;
  }>(
    `SELECT e.id, e.event_name AS name, e.start_date::text, e.end_date::text, e.is_test,
            f.id AS form_id, f.is_open,
            (SELECT count(*) FROM registrations r WHERE r.form_id = f.id) AS registered,
            (SELECT count(*) FROM registrations r WHERE r.form_id = f.id AND r.paid) AS paid,
            e.end_date >= current_date AS upcoming
     FROM events e LEFT JOIN registration_forms f ON f.event_id = e.id
     WHERE NOT e.is_hidden OR f.id IS NOT NULL
     ORDER BY e.end_date >= current_date DESC,
              CASE WHEN e.end_date >= current_date THEN e.start_date END ASC,
              e.start_date DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    isTest: r.is_test,
    formId: r.form_id,
    isOpen: r.is_open ?? false,
    registered: Number(r.registered),
    paid: Number(r.paid),
    upcoming: r.upcoming,
  }));
}

// ---- Registrations

export type Registration = {
  id: string;
  name: string;
  email: string | null;
  playerId: string | null;
  answers: Answers;
  paid: boolean;
  paidAt: string | null;
  paidByName: string | null;
  paymentNote: string;
  packageId: string | null; // picked in the Pay tab (or set by staff)
  packageName: string; // as it was when picked
  createdAt: string;
  updatedAt: string;
  discordId: string | null; // the account's Discord user id, when it has one
};

type RegistrationRow = {
  id: string; name: string; email: string | null; player_id: string | null; answers: Answers;
  paid: boolean; paid_at: Date | null; paid_by_name: string | null; payment_note: string;
  package_id: string | null; package_name: string;
  created_at: Date; updated_at: Date; discord_id: string | null;
};

const SELECT_REGISTRATION = `
  SELECT r.id, COALESCE(NULLIF(trim(concat_ws(' ', rp.first_name, rp.last_name)), ''), r.name) AS name,
         r.email, r.player_id, r.answers, r.paid, r.paid_at, r.payment_note, r.package_id, r.package_name,
         r.created_at, r.updated_at, ru.discord_id,
         COALESCE(NULLIF(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''), pu.discord_username, pu.email) AS paid_by_name
  FROM registrations r
  LEFT JOIN players rp ON rp.id = r.player_id
  LEFT JOIN users ru ON ru.id = r.user_id
  LEFT JOIN users pu ON pu.id = r.paid_by
  LEFT JOIN players pp ON pp.id = pu.player_id`;

const toRegistration = (r: RegistrationRow): Registration => ({
  id: r.id,
  name: r.name,
  email: r.email,
  playerId: r.player_id,
  answers: r.answers ?? {},
  paid: r.paid,
  paidAt: r.paid_at?.toISOString() ?? null,
  paidByName: r.paid_by_name,
  paymentNote: r.payment_note,
  packageId: r.package_id,
  packageName: r.package_name,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  discordId: r.discord_id && /^\d{5,25}$/.test(r.discord_id) ? r.discord_id : null,
});

export async function listRegistrations(formId: string): Promise<Registration[]> {
  const { rows } = await pool.query<RegistrationRow>(`${SELECT_REGISTRATION} WHERE r.form_id = $1 ORDER BY r.created_at`, [formId]);
  return rows.map(toRegistration);
}

export async function getMyRegistration(formId: string, userId: string): Promise<Registration | null> {
  const { rows } = await pool.query<RegistrationRow>(`${SELECT_REGISTRATION} WHERE r.form_id = $1 AND r.user_id = $2`, [formId, userId]);
  return rows[0] ? toRegistration(rows[0]) : null;
}

// Who an account registers as: its linked player (Profile). An account with no player
// linked can't register: playerId is null and name empty.
export type Registrant = { playerId: string | null; name: string; email: string | null };

export async function getRegistrant(userId: string): Promise<Registrant | null> {
  const { rows } = await pool.query<{ player_id: string | null; email: string; player_name: string | null }>(
    `SELECT u.player_id, u.email,
            NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '') AS player_name
     FROM users u LEFT JOIN players p ON p.id = u.player_id
     WHERE u.id = $1`,
    [userId]
  );
  const r = rows[0];
  if (!r) return null;
  const email = isPlaceholderEmail(r.email) ? null : r.email;
  return r.player_id ? { playerId: r.player_id, name: r.player_name ?? '', email } : { playerId: null, name: '', email };
}

// ---- Teammates

export type PlayerOption = { id: string; name: string; country: string | null };

// Players to pick as a teammate: main entries (not aliases), not hidden, by name (as
// the Player Editor's search: substring, or a near spelling).
export async function searchTeammatePlayers(q: string, excludeId: string | null): Promise<PlayerOption[]> {
  const query = q.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (query.length < 2) return [];
  const { rows } = await pool.query<PlayerOption>(
    `SELECT id, trim(concat_ws(' ', first_name, last_name)) AS name, country
     FROM players
     WHERE NOT hidden AND alias_id IS NULL AND id IS DISTINCT FROM $3
       AND (concat_ws(' ', first_name, last_name) ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1
            OR similarity(first_name, $2) > 0.3 OR similarity(last_name, $2) > 0.3)
     ORDER BY (concat_ws(' ', first_name, last_name) ILIKE $1) DESC,
              GREATEST(similarity(first_name, $2), similarity(last_name, $2)) DESC, last_name, first_name
     LIMIT 8`,
    [`%${query}%`, query, excludeId]
  );
  return rows;
}

// Names of players by id (unknown ids left out).
export async function playerNames(ids: string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter(isUuid))];
  if (!wanted.length) return {};
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, trim(concat_ws(' ', first_name, last_name)) AS name FROM players WHERE id = ANY($1::uuid[])`,
    [wanted]
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

// Everyone who registered for this form naming the player as a teammate: each such
// division with the rest of that team (the one who named them, plus any third player).
export async function teammateInvites(form: PublicForm, playerId: string): Promise<TeammateInvite[]> {
  const invites: TeammateInvite[] = [];
  for (const r of await listRegistrations(form.id)) {
    if (r.playerId === playerId) continue;
    for (const [divisionId, mates] of Object.entries(divisionTeammates(form, r.answers))) {
      if (!mates.includes(playerId)) continue;
      invites.push({ divisionId, playerIds: [r.playerId as string, ...mates.filter((m) => m !== playerId)], fromName: r.name });
    }
  }
  return invites;
}

// The form's Players & teams tab: every division's teams and players, by name only.
export async function getRoster(form: PublicForm): Promise<RosterDivision[]> {
  const registrations = (await listRegistrations(form.id)).filter((r): r is Registration & { playerId: string } => !!r.playerId);
  const names = await playerNames(registrations.flatMap((r) => Object.values(divisionTeammates(form, r.answers)).flat()));
  return buildRoster(form, registrations, names);
}
