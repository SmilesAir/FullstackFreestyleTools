'use server';

// The Event Creator's "Add teams from registration": the teams the event's registrations
// describe (each player, plus their teammates in each division they ticked: the players
// they picked there, else the names written in a per-division teammates question),
// matched to players for review. Saving goes through addEventRosters, like pasted teams.

import { requirePermission } from './authz';
import { pool } from './db';
import { DIVISION_NAMES } from './event-creator';
import { teamKey } from './event-creator-layout';
import { matchAll } from './player-match';
import type { ParsedSlot } from './player-match-types';
import { askedDivisions, divisionTeammates, divisionsLooking, splitTeammates } from './registration';
import { getFormOrDraft, isUuid, listRegistrations, playerNames } from './registration-queries';
import { nameKey } from './roster-review';

export type RegistrationTeamsResult =
  | { error: string }
  | {
      error: null;
      noForm: true;
    }
  | {
      error: null;
      noForm: false;
      registrations: number; // counted (only paid ones when asked)
      alreadyAdded: number; // teams already in their division, left out
      teammateQuestions: { id: string; label: string }[];
      teammatesQuestionId: string | null;
      divisions: { divisionName: string; teams: ParsedSlot[][] }[];
      // Registered players with no teammate named (and nobody naming them).
      alone: { divisionName: string; players: { name: string; lookingForPartner: boolean }[] }[];
    };

// picked: teammates chosen as players on the form; teammates: names written instead.
type Registrant = { playerId: string; name: string; lookingForPartner: boolean; picked: string[]; teammates: string[] };

export async function loadRegistrationTeams(
  eventId: string,
  options: { paidOnly: boolean; teammatesQuestionId?: string | null }
): Promise<RegistrationTeamsResult> {
  await requirePermission('event_creator');
  if (!isUuid(eventId)) return { error: 'Bad event' };
  const found = await getFormOrDraft(eventId);
  if (!found) return { error: 'Event not found' };
  if (!found.saved) return { error: null, noForm: true };
  const form = found.form;

  const teammateQuestions = form.questions.filter((q) => q.type === 'per_division_text').map((q) => ({ id: q.id, label: q.label }));
  const teammatesQuestionId =
    teammateQuestions.find((q) => q.id === options.teammatesQuestionId)?.id ?? teammateQuestions[0]?.id ?? null;
  const partnerQuestion = form.questions.find((q) => q.type === 'per_division_yesno');

  const registrations = (await listRegistrations(form.id)).filter((r) => r.playerId && (!options.paidOnly || r.paid));

  // Who registered for each division, with the teammates they wrote there.
  const byDivision = new Map<string, Registrant[]>();
  for (const r of registrations) {
    const teammatesAnswer = teammatesQuestionId ? r.answers[teammatesQuestionId] : undefined;
    const partnerAnswer = partnerQuestion ? r.answers[partnerQuestion.id] : undefined;
    const picked = divisionTeammates(form, r.answers);
    const lookingIn = divisionsLooking(form, r.answers);
    for (const d of askedDivisions(form, r.answers)) {
      const written = teammatesAnswer && typeof teammatesAnswer === 'object' && !Array.isArray(teammatesAnswer) ? teammatesAnswer[d.id] : '';
      // The divisions question's "Looking for a partner" box, else a per-division yes/no question.
      const looking =
        lookingIn.includes(d.id) ||
        (partnerAnswer && typeof partnerAnswer === 'object' && !Array.isArray(partnerAnswer) ? partnerAnswer[d.id] === 'yes' : false);
      const list = byDivision.get(d.name) ?? [];
      list.push({
        playerId: r.playerId as string,
        name: r.name,
        lookingForPartner: looking,
        picked: picked[d.id] ?? [],
        teammates: !picked[d.id]?.length && typeof written === 'string' ? splitTeammates(written) : [],
      });
      byDivision.set(d.name, list);
    }
  }

  // Every written teammate name, matched once against all players; picked ones are known.
  const matches = await matchAll([...byDivision.values()].flatMap((list) => list.flatMap((r) => r.teammates)));
  const pickedNames = await playerNames([...byDivision.values()].flatMap((list) => list.flatMap((r) => r.picked)));

  // The teams already in each of the event's divisions, to leave out.
  const existing = await pool.query<{ division_name: string; player_ids: string[] }>(
    `SELECT d.division_name, array_agg(tp.player_id::text) AS player_ids
     FROM divisions d JOIN teams t ON t.division_id = d.id JOIN team_players tp ON tp.team_id = t.id
     WHERE d.event_id = $1
     GROUP BY d.division_name, t.id`,
    [eventId]
  );
  const existingKeys = new Set(existing.rows.map((r) => `${r.division_name}:${teamKey(r.player_ids)}`));

  let alreadyAdded = 0;
  const divisions: { divisionName: string; teams: ParsedSlot[][] }[] = [];
  const alone: { divisionName: string; players: { name: string; lookingForPartner: boolean }[] }[] = [];

  const order = (name: string) => {
    const i = DIVISION_NAMES.indexOf(name as (typeof DIVISION_NAMES)[number]);
    return i < 0 ? DIVISION_NAMES.length : i;
  };
  for (const divisionName of [...byDivision.keys()].sort((a, b) => order(a) - order(b))) {
    const registrants = byDivision.get(divisionName)!;
    const registrantByName = new Map(registrants.map((r) => [nameKey(r.name), r]));
    const registeredIds = new Set(registrants.map((r) => r.playerId));

    const teams: ParsedSlot[][] = registrants.map((r) => [
      {
        input: r.name,
        status: 'matched',
        candidates: [{ id: r.playerId, name: r.name, country: null, membership: null, score: 1 }],
        selectedId: r.playerId,
      },
      ...r.picked.map(
        (id): ParsedSlot => ({
          input: pickedNames[id] ?? id,
          status: 'matched',
          candidates: [{ id, name: pickedNames[id] ?? id, country: null, membership: null, score: 1 }],
          selectedId: id,
        })
      ),
      ...r.teammates.map((written): ParsedSlot => {
        // Someone else who registered for this division, written the way they're named.
        const registered = registrantByName.get(nameKey(written));
        if (registered) {
          return {
            input: written,
            status: 'matched',
            candidates: [{ id: registered.playerId, name: registered.name, country: null, membership: null, score: 1 }],
            selectedId: registered.playerId,
          };
        }
        const slot = matches.get(written) as ParsedSlot;
        // Unsure between several players, but only one of them registered here: that one.
        if (!slot.selectedId) {
          const inDivision = slot.candidates.filter((c) => registeredIds.has(c.id));
          if (inDivision.length === 1) return { ...slot, status: 'matched', selectedId: inDivision[0].id };
        }
        return slot;
      }),
    ]);

    // Partners who both registered and named each other make the same team: keep one.
    const seen = new Set<string>();
    const unique: ParsedSlot[][] = [];
    for (const team of teams) {
      if (team.every((s) => s.selectedId)) {
        const key = teamKey(team.map((s) => s.selectedId as string));
        if (seen.has(key)) continue;
        seen.add(key);
      }
      unique.push(team);
    }

    // On their own: in someone else's team, or still without one.
    const inATeam = new Set(unique.filter((t) => t.length > 1).flatMap((t) => t.map((s) => s.selectedId)));
    const kept: ParsedSlot[][] = [];
    const lonely: { name: string; lookingForPartner: boolean }[] = [];
    for (const team of unique) {
      if (team.length === 1) {
        if (!inATeam.has(team[0].selectedId)) {
          const r = registrants.find((x) => x.playerId === team[0].selectedId)!;
          lonely.push({ name: r.name, lookingForPartner: r.lookingForPartner });
        }
        continue;
      }
      if (team.every((s) => s.selectedId) && existingKeys.has(`${divisionName}:${teamKey(team.map((s) => s.selectedId as string))}`)) {
        alreadyAdded++;
        continue;
      }
      kept.push(team);
    }
    if (kept.length) divisions.push({ divisionName, teams: kept });
    if (lonely.length) alone.push({ divisionName, players: lonely });
  }

  return {
    error: null,
    noForm: false,
    registrations: registrations.length,
    alreadyAdded,
    teammateQuestions,
    teammatesQuestionId,
    divisions,
    alone,
  };
}
