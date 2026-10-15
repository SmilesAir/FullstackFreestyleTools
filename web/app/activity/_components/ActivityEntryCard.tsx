import Link from 'next/link';
import { PoolSummary } from '@/app/head-judge/_components/PoolResults';
import { JUDGE_CATEGORY_LABELS } from '@/lib/event-creator';
import { DEFAULT_TIMECALLS } from '@/lib/head-judge';
import { categoryByType } from '@/lib/judging';
import type { ActivityDetail, ActivityEntry, ActivityTeam } from '@/lib/player-activity-queries';
import { MyTimecalls } from './MyTimecalls';

const categoryName = (type: string) => categoryByType(type)?.label ?? JUDGE_CATEGORY_LABELS[type] ?? type;

// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const teamLabel = (team: ActivityTeam) => team.players.join(' / ') || '(no players)';

function TeamList({ teams, byPlace }: { teams: ActivityTeam[]; byPlace: boolean }) {
  const shown = byPlace ? [...teams].sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity)) : teams;
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {shown.map((team, i) => (
        <li
          key={team.id}
          className={`rounded border px-3 py-1.5 ${team.mine ? 'border-blue-300 bg-blue-50 font-medium' : 'border-gray-200'}`}
        >
          <span className="mr-2 inline-block w-6 text-gray-400">{byPlace ? (team.place ?? '—') : `${i + 1}.`}</span>
          {teamLabel(team)}
        </li>
      ))}
    </ol>
  );
}

export function ActivityEntryCard({ entry, detail }: { entry: ActivityEntry; detail: ActivityDetail }) {
  const myTeam = detail.teams.find((t) => t.mine);

  return (
    <li className="flex flex-col gap-3 rounded border border-gray-300 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm text-gray-500">
            {entry.eventName} · {formatDate(entry.startDate)}
          </div>
          <h2 className="text-lg font-semibold">
            {entry.divisionName} · {entry.roundName} · Pool {entry.letter}
          </h2>
        </div>
        <Link href={`/r/${detail.shortCode}`} className="text-sm text-blue-600 underline">
          {entry.hasResults ? 'Full results →' : 'Pool page →'}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {entry.played && (
          <span className="rounded bg-gray-100 px-2 py-0.5">
            Played{myTeam?.place != null && entry.hasResults ? ` · ${ordinal(myTeam.place)} place` : ''}
          </span>
        )}
        {entry.judged && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-900">
            Judged {categoryName(entry.judged.categoryType)} ·{' '}
            {entry.judged.categoryCount === null || entry.judged.overallCount === null
              ? 'test event'
              : `${ordinal(entry.judged.categoryCount)} ${categoryName(entry.judged.categoryType)} · ${ordinal(entry.judged.overallCount)} overall`}
          </span>
        )}
        {!entry.hasResults && <span className="rounded bg-green-50 px-2 py-0.5 text-green-800">No results yet</span>}
      </div>

      {detail.summary ? (
        <PoolSummary
          pool={{ teams: detail.summary.teams }}
          data={detail.summary.data}
          judgesByCategory={detail.summary.judgesByCategory}
          highlightedTeamId={myTeam?.id ?? null}
        />
      ) : entry.hasResults ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-gray-600">Results</h3>
          <TeamList teams={detail.teams} byPlace />
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-gray-600">Play order</h3>
            <TeamList teams={detail.teams} byPlace={false} />
          </section>
          {detail.timecallTeamId && myTeam && (
            <MyTimecalls
              teamId={detail.timecallTeamId}
              initial={myTeam.timecalls ?? DEFAULT_TIMECALLS}
              routineSeconds={entry.routineSeconds}
            />
          )}
          {detail.judges && (
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-gray-600">Judges</h3>
              {detail.judges.length === 0 ? (
                <p className="text-sm text-gray-500">No judges set yet.</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-sm">
                  {detail.judges.map((j) => (
                    <li key={j.playerId}>
                      {j.name} <span className="text-gray-500">({categoryName(j.categoryType)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </li>
  );
}
