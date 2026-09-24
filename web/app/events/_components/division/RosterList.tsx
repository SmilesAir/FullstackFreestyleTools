'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRosterTeam } from '@/lib/event-creator-actions';
import { teamKey } from '@/lib/event-creator-layout';
import type { TeamRow } from '@/lib/event-creator-queries';
import { useDivisionUi } from './DivisionWorkspace';

export function RosterList({ divisionId, teams }: { divisionId: string; teams: TeamRow[] }) {
  const router = useRouter();
  const ui = useDivisionUi();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (teams.length === 0) return <p className="text-sm text-gray-500">No teams yet.</p>;

  // Teams already in the round the user is looking at are dimmed.
  const inRound = ui.activeRound ? ui.roundKeys[ui.activeRound.number] : undefined;
  const inActiveRound = (t: TeamRow) => !!inRound?.has(teamKey(t.players.map((p) => p.id)));

  return (
    <ul className="flex flex-col gap-1">
      {ui.activeRound && (
        <li className="text-xs text-gray-500">
          Viewing {ui.activeRound.name}: dimmed teams are already in it. Drag a team into a pool to add it.
        </li>
      )}
      {error && <li className="text-sm text-red-600">{error}</li>}
      {teams.map((t, i) => (
        <li
          key={t.id}
          // Drag a team into a pool to put it in that round.
          draggable={t.players.length > 0}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', t.id);
            ui.setRosterDrag(t);
          }}
          onDragEnd={() => ui.setRosterDrag(null)}
          className={`cursor-move rounded border border-gray-200 px-3 py-2 text-[18.2px] ${
            inActiveRound(t) ? 'bg-gray-100 opacity-50' : ''
          }`}
          title={inActiveRound(t) ? `Already in ${ui.activeRound?.name}` : undefined}
        >
          {/* One player per line keeps the list narrow. */}
          <div className="flex items-baseline gap-2">
            <span className="text-[15.6px] text-gray-400">{i + 1}.</span>
            <div className="flex flex-col">
              {t.players.length === 0 && <span>(no players)</span>}
              {t.players.map((p) => (
                <span key={p.id}>{p.name}</span>
              ))}
            </div>
          </div>
          <div className="mt-0.5 flex items-center gap-3 pl-6 text-[15.6px]">
            <span className="text-gray-500">{Math.round(t.points)} pts</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm('Remove this team?')) return;
                startTransition(async () => {
                  const result = await deleteRosterTeam(divisionId, t.id);
                  setError(result.error);
                  if (!result.error) router.refresh();
                });
              }}
              className="text-red-600 underline disabled:opacity-50"
            >
              remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
