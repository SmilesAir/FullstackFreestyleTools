'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { getCurrentUserAccess } from './authz';
import { pool } from './db';
import { getT } from './i18n/server';
import { dictionaries } from './i18n/dictionaries';
import { isLocale } from './i18n/locales';
import {
  cleanAnswers,
  cleanQuestions,
  cleanStyle,
  divisionTeammates,
  divisionsLooking,
  lookingKey,
  teammatesKey,
  type Answers,
  type FormStyle,
  type Question,
  type RosterDivision,
  type TeammateInvite,
} from './registration';
import {
  claimHandoff,
  getForm,
  getMyRegistration,
  getRoster,
  getRegistrant,
  isHandoffCode,
  isUuid,
  makeRegistrationToken,
  playerNames,
  searchTeammatePlayers,
  teammateInvites,
  type PlayerOption,
  readRegistrationToken,
  recordHandoff,
  type Registrant,
  type Registration,
} from './registration-queries';

export type ActionResult = { error: string | null };

// The text for a call from the players' form: in the form's own language (an embed's
// ?lang=, sent along), since the language cookie isn't sent inside another site.
async function formText(locale: unknown) {
  return (isLocale(locale) ? dictionaries[locale] : await getT()).eventRegistration;
}

// ---- Staff (the Event Registration tool)

async function staffOnly(): Promise<{ userId: string } | { error: string }> {
  const access = await getCurrentUserAccess();
  const t = (await getT()).eventRegistration;
  if (!access) return { error: t.signInToRegister };
  if (!access.isAdmin && !access.permissions.has('event_registration')) return { error: t.noAccess };
  return { userId: access.userId };
}

// The Form tab saves everything but the look; the Embed tab saves the look (saveStyle).
export type FormSettings = { title: string; intro: string; isOpen: boolean; questions: Question[] };

// Saves the event's form, making it on the first save.
export async function saveForm(eventId: string, settings: FormSettings): Promise<ActionResult> {
  const staff = await staffOnly();
  if ('error' in staff) return staff;
  if (!isUuid(eventId)) return { error: 'Bad event' };
  const questions = cleanQuestions(settings.questions);
  if (questions.some((q) => !q.label)) return { error: (await getT()).eventRegistration.questionNeedsLabel };
  const result = await pool.query(
    `INSERT INTO registration_forms (event_id, title, intro, is_open, questions)
     SELECT id, $2, $3, $4, $5 FROM events WHERE id = $1
     ON CONFLICT (event_id) DO UPDATE
       SET title = EXCLUDED.title, intro = EXCLUDED.intro, is_open = EXCLUDED.is_open,
           questions = EXCLUDED.questions, updated_at = now()`,
    [
      eventId,
      String(settings.title ?? '').trim().slice(0, 200),
      String(settings.intro ?? '').trim().slice(0, 4000),
      settings.isOpen === true,
      JSON.stringify(questions),
    ]
  );
  if (!result.rowCount) return { error: (await getT()).eventRegistration.formNotFound };
  revalidatePath('/event-registration');
  return { error: null };
}

export async function saveStyle(formId: string, style: FormStyle): Promise<ActionResult> {
  const staff = await staffOnly();
  if ('error' in staff) return staff;
  if (!isUuid(formId)) return { error: 'Bad form' };
  const result = await pool.query('UPDATE registration_forms SET style = $2, updated_at = now() WHERE id = $1', [
    formId,
    JSON.stringify(cleanStyle(style)),
  ]);
  if (!result.rowCount) return { error: (await getT()).eventRegistration.formNotFound };
  revalidatePath('/event-registration');
  return { error: null };
}

// Marks a registration paid (keeping who first marked it, and when) or not paid.
export async function setPaid(registrationId: string, paid: boolean, note: string): Promise<ActionResult> {
  const staff = await staffOnly();
  if ('error' in staff) return staff;
  if (!isUuid(registrationId)) return { error: 'Bad registration' };
  await pool.query(
    `UPDATE registrations
     SET paid_at = CASE WHEN NOT $2 THEN NULL WHEN paid THEN paid_at ELSE now() END,
         paid_by = CASE WHEN NOT $2 THEN NULL WHEN paid THEN paid_by ELSE $4::uuid END,
         paid = $2,
         payment_note = $3
     WHERE id = $1`,
    [registrationId, paid === true, String(note ?? '').trim().slice(0, 500), staff.userId]
  );
  revalidatePath('/event-registration');
  return { error: null };
}

export async function removeRegistration(registrationId: string): Promise<ActionResult> {
  const staff = await staffOnly();
  if ('error' in staff) return staff;
  if (!isUuid(registrationId)) return { error: 'Bad registration' };
  await pool.query('DELETE FROM registrations WHERE id = $1', [registrationId]);
  revalidatePath('/event-registration');
  return { error: null };
}

// ---- Players (the embed and /register/<form>)

// The account making a call: the sign-in cookie when there is one (this site's own
// page), else the embed's token (see registration-queries.ts).
async function caller(formId: string, token: string | null): Promise<string | null> {
  const session = await auth().catch(() => null);
  if (session?.user?.id) return session.user.id;
  return readRegistrationToken(token, formId);
}

// The sign-in window: the signed-in player presses Continue to let the embed that
// opened it register them.
export async function completeHandoff(formId: string, code: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: (await getT()).eventRegistration.signInToRegister };
  if (!isUuid(formId) || !isHandoffCode(code) || !(await getForm(formId))) return { error: (await getT()).eventRegistration.formNotFound };
  await recordHandoff(formId, code, session.user.id);
  return { error: null };
}

// The embed, every few seconds after opening the sign-in window: a token once the
// player has pressed Continue there, else null.
export async function collectHandoff(formId: string, code: string): Promise<string | null> {
  if (!isUuid(formId) || !isHandoffCode(code)) return null;
  const userId = await claimHandoff(formId, code);
  return userId ? makeRegistrationToken(formId, userId) : null;
}

// invites: registrations naming this player as a teammate (their divisions are ticked
// and teammates filled in for them); names: every player those and their own
// registration mention, for showing the teammates picked.
export type MyRegistrationState = {
  signedIn: boolean;
  registrant: Registrant | null;
  registration: Registration | null;
  invites: TeammateInvite[];
  names: Record<string, string>;
};

const SIGNED_OUT: MyRegistrationState = { signedIn: false, registrant: null, registration: null, invites: [], names: {} };

export async function loadMyRegistration(formId: string, token: string | null): Promise<MyRegistrationState> {
  const userId = isUuid(formId) ? await caller(formId, token) : null;
  if (!userId) return SIGNED_OUT;
  const [registrant, registration, form] = await Promise.all([getRegistrant(userId), getMyRegistration(formId, userId), getForm(formId)]);
  if (!registrant || !form) return SIGNED_OUT;
  const invites = registrant.playerId ? await teammateInvites(form, registrant.playerId) : [];
  const mentioned = [
    ...invites.flatMap((i) => i.playerIds),
    ...Object.values(registration ? divisionTeammates(form, registration.answers) : {}).flat(),
  ];
  return { signedIn: true, registrant, registration, invites, names: await playerNames(mentioned) };
}

// The form's Players & teams tab (open to anyone who can see the form: names only, plus
// the Discord id of those looking for a partner).
export async function loadRoster(formId: string): Promise<RosterDivision[]> {
  const form = isUuid(formId) ? await getForm(formId) : null;
  return form ? getRoster(form) : [];
}

// The teammate picker's search (signed-in players only; never themselves).
export async function searchTeammates(formId: string, token: string | null, query: string): Promise<PlayerOption[]> {
  const userId = isUuid(formId) ? await caller(formId, token) : null;
  if (!userId) return [];
  const registrant = await getRegistrant(userId);
  return searchTeammatePlayers(String(query ?? ''), registrant?.playerId ?? null);
}

export type SubmitResult = { error: string | null; missing?: string[]; registration?: Registration | null };

// Registers the player, or changes their answers. Only while the form is open.
// The registration is in the name of the account's linked player; no player linked, no
// registration (players link theirs on Profile).
export async function submitRegistration(
  formId: string,
  token: string | null,
  rawAnswers: Answers,
  locale?: string
): Promise<SubmitResult> {
  const t = await formText(locale);
  const form = await getForm(formId);
  if (!form) return { error: t.formNotFound };
  const userId = await caller(form.id, token);
  const registrant = userId ? await getRegistrant(userId) : null;
  if (!userId || !registrant) return { error: t.signInToRegister };
  if (!form.isOpen) return { error: t.closed };
  if (!registrant.playerId) return { error: t.linkPlayerFirst };

  const { answers, missing } = cleanAnswers(form, rawAnswers);
  // Teammates must be real players, and not the player themselves.
  const divisionQuestion = form.questions.find((q) => q.type === 'divisions');
  if (divisionQuestion && answers[teammatesKey(divisionQuestion.id)]) {
    const picked = divisionTeammates(form, answers);
    const known = await playerNames(Object.values(picked).flat());
    const kept: Record<string, string[]> = {};
    for (const [divisionId, ids] of Object.entries(picked)) {
      const ok = ids.filter((id) => id !== registrant.playerId && known[id]);
      if (ok.length) kept[divisionId] = ok;
    }
    if (Object.keys(kept).length) answers[teammatesKey(divisionQuestion.id)] = kept;
    else delete answers[teammatesKey(divisionQuestion.id)];
    // With a teammate dropped, a team may no longer be full: look at the flags again.
    const raw = (rawAnswers ?? {})[lookingKey(divisionQuestion.id)];
    const looking = divisionsLooking(form, { ...answers, [lookingKey(divisionQuestion.id)]: raw });
    if (looking.length) answers[lookingKey(divisionQuestion.id)] = looking;
    else delete answers[lookingKey(divisionQuestion.id)];
  }
  if (missing.length) return { error: t.answerRequired, missing };

  await pool.query(
    `INSERT INTO registrations (form_id, user_id, player_id, name, email, answers)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (form_id, user_id) DO UPDATE
       SET name = EXCLUDED.name, answers = EXCLUDED.answers, player_id = EXCLUDED.player_id,
           email = EXCLUDED.email, updated_at = now()`,
    [form.id, userId, registrant.playerId, registrant.name, registrant.email, JSON.stringify(answers)]
  );
  revalidatePath('/event-registration');
  return { error: null, registration: await getMyRegistration(form.id, userId) };
}

// A player takes back their own registration, until staff have marked it paid.
export async function withdrawRegistration(formId: string, token: string | null, locale?: string): Promise<ActionResult> {
  const t = await formText(locale);
  const userId = isUuid(formId) ? await caller(formId, token) : null;
  if (!userId) return { error: t.signInToRegister };
  const result = await pool.query('DELETE FROM registrations WHERE form_id = $1 AND user_id = $2 AND NOT paid', [formId, userId]);
  if (!result.rowCount) return { error: t.cantWithdrawPaid };
  revalidatePath('/event-registration');
  return { error: null };
}
