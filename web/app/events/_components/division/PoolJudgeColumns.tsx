'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPoolJudges } from '@/lib/event-creator-actions';
import { JUDGE_CATEGORY_LABELS, formatJudgeCount, type PoolJudgeView } from '@/lib/event-creator';
import { useDivisionUi, type JudgeDrag } from './DivisionWorkspace';

// A pool's judges, one column per judging category. Judges are placed by
// dragging players in from the Set Judges panel; chips can be dragged between
// columns of the same pool, or removed.
export function PoolJudgeColumns({
  divisionId,
  roundNumber,
  roundName,
  letter,
  categories,
  judges,
  locked,
}: {
  divisionId: string;
  roundNumber: number;
  roundName: string;
  letter: string;
  categories: readonly string[];
  judges: PoolJudgeView[];
  // Locked by the Head Judge: judges can't be added, moved or removed.
  locked: boolean;
}) {
  const router = useRouter();
  const ui = useDivisionUi();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // A change is shown straight away and stays until the saved data (`judges`) is refreshed.
  const [optimistic, setOptimistic] = useState<{ forJudges: PoolJudgeView[]; list: PoolJudgeView[] } | null>(null);
  const list = optimistic && optimistic.forJudges === judges ? optimistic.list : judges;

  const panelHere = ui.judgePanel?.roundNumber === roundNumber && ui.judgePanel.letter === letter;

  function save(next: PoolJudgeView[]) {
    setOptimistic({ forJudges: judges, list: next });
    startTransition(async () => {
      const result = await setPoolJudges(
        divisionId,
        roundNumber,
        letter,
        next.map((j) => ({ playerId: j.playerId, categoryType: j.categoryType }))
      );
      setMessage(result.error);
      // A save that failed puts the players it had hidden back in the panel.
      if (result.error) ui.clearPlacedJudges();
      ui.judgesChanged();
      // On an error the refresh also puts the saved judges back.
      router.refresh();
    });
  }

  function togglePanel() {
    if (panelHere) return ui.closeJudgePanel();
    ui.openJudgePanel({ roundNumber, roundName, letter });
    // Once the panel has made room, bring this pool up where it isn't covered.
    setTimeout(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // Does this column take what's being dragged? A player from the panel, when
  // it's open for this pool; a chip, only within its own pool.
  function accepts(drag: JudgeDrag | null): drag is JudgeDrag {
    if (!drag || locked) return false;
    return drag.source === 'panel' ? panelHere : drag.source.roundNumber === roundNumber && drag.source.letter === letter;
  }

  function drop(category: string, drag: JudgeDrag) {
    const existing = list.find((j) => j.playerId === drag.playerId);
    if (existing?.categoryType === category) return;

    // Counts as they will be once saved, so the chip reads right straight away.
    const counts = { ...drag.counts };
    let eventCount = drag.eventCount;
    if (existing) counts[existing.categoryType] = Math.max(0, (counts[existing.categoryType] ?? 0) - 1);
    else eventCount += 1;
    counts[category] = (counts[category] ?? 0) + 1;

    // A player from the panel leaves its list right now.
    if (drag.source === 'panel') ui.placeJudge(`${roundNumber}:${letter}`, drag.playerId);

    save([
      ...list.filter((j) => j.playerId !== drag.playerId),
      { playerId: drag.playerId, name: drag.name, categoryType: category, eventCount, counts },
    ]);
  }

  return (
    <div ref={top} className="flex scroll-mt-32 flex-col gap-2 border-t border-gray-200 pt-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Judges</span>
        <button
          type="button"
          onClick={togglePanel}
          disabled={locked}
          title={locked ? 'Locked by the Head Judge' : undefined}
          className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
            panelHere ? 'border-black bg-black text-white' : 'border-gray-300'
          }`}
        >
          {panelHere ? 'Close judges panel' : 'Set Judges'}
        </button>
        {pending && <span className="text-xs text-gray-500">Saving…</span>}
        {locked && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">🔒 Locked</span>}
      </div>
      {message && <p className="text-xs text-red-600">{message}</p>}

      <div className="grid grid-cols-3 gap-2">
        {categories.map((category) => {
          const inColumn = list.filter((j) => j.categoryType === category);
          return (
            <div
              key={category}
              onDragOver={(e) => {
                if (!accepts(ui.judgeDrag)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = ui.judgeDrag?.source === 'panel' ? 'copy' : 'move';
                if (dropColumn !== category) setDropColumn(category);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropColumn(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropColumn(null);
                const drag = ui.judgeDrag;
                ui.setJudgeDrag(null);
                if (accepts(drag)) drop(category, drag);
              }}
              className={`flex min-h-16 flex-col gap-1 rounded border border-dashed p-1 ${
                dropColumn === category ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <div className="text-center text-xs font-semibold text-gray-600">{JUDGE_CATEGORY_LABELS[category] ?? category}</div>
              {inColumn.map((j) => (
                <div
                  key={j.playerId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', j.playerId);
                    ui.setJudgeDrag({
                      playerId: j.playerId,
                      name: j.name,
                      eventCount: j.eventCount,
                      counts: j.counts,
                      source: { roundNumber, letter },
                    });
                  }}
                  onDragEnd={() => ui.setJudgeDrag(null)}
                  className="flex cursor-move items-start justify-between gap-1 rounded bg-white px-1.5 py-1 text-sm shadow-sm"
                >
                  <div>
                    <div className="leading-tight">{j.name}</div>
                    <div className="font-mono text-[11px] text-gray-500">{formatJudgeCount(j, categories)}</div>
                  </div>
                  <button
                    type="button"
                    disabled={pending || locked}
                    title={locked ? 'Locked by the Head Judge' : 'Remove judge'}
                    onClick={() => save(list.filter((x) => x.playerId !== j.playerId))}
                    className="cursor-pointer text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
