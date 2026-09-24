import { getDivision, getPoolJudges, getTeams } from '@/lib/event-creator-queries';
import { syncRosterFromRounds } from '@/lib/event-creator-sync';
import {
  DIVISION_NAMES,
  ROSTER_ROUND,
  ROUNDS,
  getRoundConfig,
  type PoolJudgeView,
  type RulesId,
} from '@/lib/event-creator';
import { teamKey } from '@/lib/event-creator-layout';
import { Collapsible } from '../Collapsible';
import { DivisionWorkspace } from './DivisionWorkspace';
import { TeamsSidebar } from '../TeamsSidebar';
import { DivisionSettings } from './DivisionSettings';
import { RosterList } from './RosterList';
import { RosterPasteForm } from './RosterPasteForm';
import { RoundSection } from './RoundSection';

export async function DivisionView({
  eventId,
  divisionId,
  divisionName,
  siblings,
}: {
  eventId: string;
  divisionId: string;
  divisionName: string;
  // Every division of the event, so the type dropdown can hide used types.
  siblings: { id: string; division_name: string }[];
}) {
  // getTeams only needs the name, so it runs alongside getDivision.
  const [division, loadedTeams, poolJudges] = await Promise.all([
    getDivision(divisionId),
    getTeams(divisionId, divisionName),
    getPoolJudges(divisionId),
  ]);
  if (!division || division.event_id !== eventId) {
    return <p className="text-sm text-red-600">That division doesn&apos;t exist for this event.</p>;
  }

  // The team list lives in the DB; add any team that only exists in a round's
  // pools (imported events) to it, then reload so the list includes them.
  const teams = (await syncRosterFromRounds(divisionId, loadedTeams))
    ? await getTeams(divisionId, division.division_name)
    : loadedTeams;

  // Type choices: this division's own type plus any type the event isn't using yet.
  const usedByOthers = new Set(siblings.filter((d) => d.id !== divisionId).map((d) => d.division_name));
  const availableNames = DIVISION_NAMES.filter((n) => n === division.division_name || !usedByOthers.has(n));

  const roster = teams
    .filter((t) => t.round_number === ROSTER_ROUND)
    .sort((a, b) => b.points - a.points || (a.players[0]?.name ?? '').localeCompare(b.players[0]?.name ?? ''));

  // round number -> pool letter -> judges
  const judgesByRound: Record<number, Record<string, PoolJudgeView[]>> = {};
  for (const j of poolJudges) {
    const letter = j.pool_id.replace(/^pool/, '');
    ((judgesByRound[j.round_number] ??= {})[letter] ??= []).push({
      playerId: j.player_id,
      categoryType: j.category_type,
      name: j.name,
    });
  }

  // Who is already in each round, so the team list can show it and pools can refuse repeats.
  const roundKeys = Object.fromEntries(
    ROUNDS.map((round) => [
      round.number,
      teams.filter((t) => t.round_number === round.number).map((t) => teamKey(t.players.map((p) => p.id))),
    ])
  );

  return (
    // The workspace lays these out side by side on wide screens (stacked on narrow ones).
    <DivisionWorkspace roundKeys={roundKeys}>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Collapsible title="Division settings">
          <DivisionSettings
            eventId={eventId}
            divisionId={divisionId}
            divisionName={division.division_name}
            availableNames={[...availableNames]}
            routineSeconds={division.routine_seconds}
            rulesId={division.rules_id}
            headJudge={division.head_judge}
            directors={division.directors}
            isHidden={division.is_hidden ?? true}
          />
        </Collapsible>

        <Collapsible title="Add teams">
          <RosterPasteForm divisionId={divisionId} />
        </Collapsible>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Rounds</h2>
          {[...ROUNDS].reverse().map((round) => (
            <RoundSection
              key={round.number}
              divisionId={divisionId}
              roundNumber={round.number}
              roundName={round.name}
              rulesId={division.rules_id as RulesId}
              config={getRoundConfig(division.pool_config, round.number)}
              teams={teams.filter((t) => t.round_number === round.number)}
              judges={judgesByRound[round.number] ?? {}}
              rosterCount={roster.length}
            />
          ))}
        </section>
      </div>

      <TeamsSidebar title={`Teams (${roster.length})`}>
        <RosterList divisionId={divisionId} teams={roster} />
      </TeamsSidebar>
    </DivisionWorkspace>
  );
}
