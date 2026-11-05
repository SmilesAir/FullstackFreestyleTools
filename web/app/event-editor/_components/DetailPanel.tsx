'use client';

import type { EventEditorDetail } from '@/lib/event-editor-queries';
import { ActionButtons } from './ActionButtons';
import { DivisionsTree } from './DivisionsTree';
import { EventInfoEditor, type EventInfoPatch } from './EventInfoEditor';
import { TestHiddenToggles } from './TestHiddenToggles';
import { useT } from '@/lib/i18n/client';

export type EventPatch = Partial<EventInfoPatch> & { is_test?: boolean; is_hidden?: boolean };

export function DetailPanel({
  detail,
  loading,
  onEventChanged,
}: {
  detail: EventEditorDetail | null;
  loading: boolean;
  onEventChanged: (eventId: string, patch: EventPatch) => void;
}) {
  const t = useT();
  if (loading) return <p className="text-sm text-gray-500">{t.common.loading}</p>;
  if (!detail) return <p className="text-sm text-gray-500">{t.eventEditor.selectEvent}</p>;

  return (
    <div className="flex flex-col gap-4">
      <EventInfoEditor
        key={detail.id}
        eventId={detail.id}
        name={detail.event_name}
        startDate={detail.start_date}
        endDate={detail.end_date}
        summary={t.eventEditor.summary(detail.player_count, detail.divisions.length)}
        onChange={(patch) => onEventChanged(detail.id, patch)}
      />
      <TestHiddenToggles
        eventId={detail.id}
        isTest={detail.is_test}
        isHidden={detail.is_hidden}
        onChange={(patch) => onEventChanged(detail.id, patch)}
      />
      <ActionButtons eventId={detail.id} />
      <DivisionsTree divisions={detail.divisions} />
    </div>
  );
}
