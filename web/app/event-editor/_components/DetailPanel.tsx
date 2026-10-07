'use client';

import type { EventEditorDetail } from '@/lib/event-editor-queries';
import { ActionButtons } from './ActionButtons';
import { DivisionsTree } from './DivisionsTree';
import { TestHiddenToggles } from './TestHiddenToggles';

export function DetailPanel({
  detail,
  loading,
  onFlagsChanged,
}: {
  detail: EventEditorDetail | null;
  loading: boolean;
  onFlagsChanged: (eventId: string, patch: { is_test?: boolean; is_hidden?: boolean }) => void;
}) {
  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!detail) return <p className="text-sm text-gray-500">Select an event to see its details.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{detail.event_name}</h2>
        <p className="text-sm text-gray-600">
          {detail.start_date} → {detail.end_date} · {detail.player_count} players · {detail.divisions.length} divisions
        </p>
      </div>
      <TestHiddenToggles
        eventId={detail.id}
        isTest={detail.is_test}
        isHidden={detail.is_hidden}
        onChange={(patch) => onFlagsChanged(detail.id, patch)}
      />
      <ActionButtons eventId={detail.id} />
      <DivisionsTree divisions={detail.divisions} />
    </div>
  );
}
