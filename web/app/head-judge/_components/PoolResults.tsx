import { teamName, type HeadJudgePool } from '@/lib/head-judge';

// The results of a pool. For now this is just its list of teams; results as
// they come in will replace the placeholder note.
export function PoolResults({ pool }: { pool: HeadJudgePool }) {
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1 text-lg">
        {pool.teams.map((team, i) => (
          <li key={team.id} className="rounded border border-gray-200 px-3 py-2">
            <span className="mr-3 text-gray-400">{i + 1}.</span>
            {teamName(team)}
          </li>
        ))}
      </ol>
      <p className="text-xs text-gray-500">Results will show here as they come in.</p>
    </div>
  );
}
