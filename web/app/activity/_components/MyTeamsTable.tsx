import type { MyTeam } from '@/lib/team-timecalls';
import { MyMusic } from './MyMusic';
import { MyTimecalls } from './MyTimecalls';

// The player's teams in events still to come or running, one per division,
// each with the time calls they want made during their routines.
// `nested` when it sits inside another section (the home page's My activity).
export function MyTeamsTable({ teams, nested = false }: { teams: MyTeam[]; nested?: boolean }) {
  if (teams.length === 0) return null;
  const Heading = nested ? 'h3' : 'h2';
  return (
    <section className="flex flex-col gap-2">
      <div>
        <Heading className={nested ? 'text-base font-semibold' : 'text-lg font-semibold'}>My teams</Heading>
        <p className="text-sm text-gray-500">
          Time calls are called out during your routine when that much time is left. They apply to every round
          your team still has to play. Music set for All rounds plays in every round unless you set a different
          song for a round.
        </p>
      </div>
      <div className="overflow-x-auto rounded border border-gray-300">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">Division</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Time calls &amp; music</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.teamId} className="border-t border-gray-200 align-top">
                <td className="px-3 py-2">{team.eventName}</td>
                <td className="px-3 py-2">{team.divisionName}</td>
                <td className="px-3 py-2">{team.players.join(' / ') || '(no players)'}</td>
                <td className="min-w-72 px-3 py-2">
                  <div className="flex flex-col gap-2">
                    <MyTimecalls
                      teamId={team.teamId}
                      initial={team.timecalls}
                      routineSeconds={team.routineSeconds}
                      disabled={!team.editable}
                    />
                    <MyMusic team={team} />
                  </div>
                  {!team.editable && <p className="mt-1 text-xs text-gray-500">All of this team&apos;s pools are finished or locked.</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
