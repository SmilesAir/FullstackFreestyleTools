import Link from 'next/link';
import { PoolSummary } from '@/app/head-judge/_components/PoolResults';
import { JUDGE_CATEGORY_LABELS } from '@/lib/event-creator';
import { categoryByType } from '@/lib/judging';
import type { ActivityDetail, ActivityEntry, ActivityTeam } from '@/lib/player-activity-queries';
import { getLocale, getT } from '@/lib/i18n/server';
import { formatDay } from '@/lib/i18n/format';
import { categoryLabel } from '@/lib/i18n/labels';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const categoryName = (t: Dictionary, type: string) =>
  categoryByType(type) ? categoryLabel(t, type) : (JUDGE_CATEGORY_LABELS[type] ?? type);

const teamLabel = (t: Dictionary, team: ActivityTeam) => team.players.join(' / ') || t.common.noPlayers;

async function TeamList({ teams, byPlace }: { teams: ActivityTeam[]; byPlace: boolean }) {
  const t = await getT();
  const shown = byPlace ? [...teams].sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity)) : teams;
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {shown.map((team, i) => (
        <li
          key={team.id}
          className={`rounded border px-3 py-1.5 ${team.mine ? 'border-blue-300 bg-blue-50 font-medium' : 'border-gray-200'}`}
        >
          <span className="mr-2 inline-block w-6 text-gray-400">{byPlace ? (team.place ?? '—') : `${i + 1}.`}</span>
          {teamLabel(t, team)}
        </li>
      ))}
    </ol>
  );
}

export async function ActivityEntryCard({ entry, detail }: { entry: ActivityEntry; detail: ActivityDetail }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const ordinal = t.common.ordinal;
  const myTeam = detail.teams.find((team) => team.mine);

  return (
    <li className="flex flex-col gap-3 rounded border border-gray-300 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm text-gray-500">
            {entry.eventName} · {formatDay(locale, entry.startDate)}
          </div>
          <h2 className="text-lg font-semibold">
            {entry.divisionName} · {t.common.roundName(entry.roundNumber)} · {t.common.pool(entry.letter)}
          </h2>
        </div>
        <Link href={`/r/${detail.shortCode}`} className="text-sm text-blue-600 underline">
          {entry.hasResults ? t.activity.fullResults : t.activity.poolPage}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {entry.played && (
          <span className="rounded bg-gray-100 px-2 py-0.5">
            {t.activity.played}{myTeam?.place != null && entry.hasResults ? t.activity.playedPlace(ordinal(myTeam.place)) : ''}
          </span>
        )}
        {entry.judged && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-900">
            {t.activity.judged(categoryName(t, entry.judged.categoryType))}{' '}
            {entry.judged.categoryCount === null || entry.judged.overallCount === null
              ? t.activity.testEvent
              : t.activity.judgedCounts(
                  ordinal(entry.judged.categoryCount),
                  categoryName(t, entry.judged.categoryType),
                  ordinal(entry.judged.overallCount)
                )}
          </span>
        )}
        {!entry.hasResults && <span className="rounded bg-green-50 px-2 py-0.5 text-green-800">{t.activity.noResultsYet}</span>}
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
          <h3 className="text-sm font-medium text-gray-600">{t.activity.results}</h3>
          <TeamList teams={detail.teams} byPlace />
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-gray-600">{t.activity.playOrder}</h3>
            <TeamList teams={detail.teams} byPlace={false} />
          </section>
          {detail.judges && (
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-gray-600">{t.activity.judges}</h3>
              {detail.judges.length === 0 ? (
                <p className="text-sm text-gray-500">{t.activity.noJudgesYet}</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-sm">
                  {detail.judges.map((j) => (
                    <li key={j.playerId}>
                      {j.name} <span className="text-gray-500">({categoryName(t, j.categoryType)})</span>
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
