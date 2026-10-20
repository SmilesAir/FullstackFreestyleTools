import { JUDGE_CATEGORIES, JUDGE_CATEGORY_LABELS } from '@/lib/event-creator';
import { teamName, type HeadJudgeJudge, type HeadJudgePool } from '@/lib/head-judge';
import { categoryByType } from '@/lib/judging';

const categoryName = (type: string) => categoryByType(type)?.label ?? JUDGE_CATEGORY_LABELS[type] ?? type;

// Every category in the order the rules list them (Diff, AI, Ex, then GOE's).
const CATEGORY_ORDER = [...new Set(Object.values(JUDGE_CATEGORIES).flat())];
const categoryRank = (type: string) => {
  const i = CATEGORY_ORDER.indexOf(type);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

function groupJudges(judges: HeadJudgeJudge[]): [string, HeadJudgeJudge[]][] {
  const groups = new Map<string, HeadJudgeJudge[]>();
  for (const j of judges) groups.set(j.categoryType, [...(groups.get(j.categoryType) ?? []), j]);
  return [...groups].sort(([a], [b]) => categoryRank(a) - categoryRank(b));
}

// One pool to review: its teams in play order and its judges by category.
export function ReviewPoolCard({ pool }: { pool: HeadJudgePool }) {
  return (
    <li className="flex flex-col gap-3 rounded border border-gray-300 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">Pool {pool.letter}</h4>
        <span className="text-xs text-gray-500">
          {pool.teams.length} {pool.teams.length === 1 ? 'team' : 'teams'}
        </span>
        {pool.locked && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">🔒 Locked</span>}
      </div>

      <section className="flex flex-col gap-1">
        <h5 className="text-sm font-medium text-gray-600">Play order</h5>
        <ol className="flex flex-col gap-1 text-sm">
          {pool.teams.map((team, i) => (
            <li key={team.id} className="rounded border border-gray-200 px-3 py-1.5">
              <span className="mr-2 text-gray-500">{i + 1}.</span>
              {teamName(team)}
            </li>
          ))}
        </ol>
      </section>

      {pool.usesJudges && (
        <section className="flex flex-col gap-1">
          <h5 className="text-sm font-medium text-gray-600">Judges</h5>
          {pool.judges.length === 0 ? (
            <p className="text-sm text-gray-500">No judges set yet.</p>
          ) : (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
              {groupJudges(pool.judges).map(([type, judges]) => (
                <div key={type} className="contents">
                  <dt className="text-gray-500">{categoryName(type)}</dt>
                  <dd>{judges.map((j) => j.name).join(', ')}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
    </li>
  );
}
