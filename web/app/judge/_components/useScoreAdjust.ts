import { useEffect, useRef, useState } from 'react';

// Changing a submitted score's percentage on the Review tab. The value the judge
// last pressed is shown at once and saved as soon as no other save is on its
// way. Each value is sent once: a failed save waits for the next press instead
// of retrying on its own (the error shows at the top of the screen).
export function useScoreAdjust({
  routineId,
  saved,
  submitting,
  onSubmit,
}: {
  routineId: string | null;
  // The change in percent the server has now.
  saved: number;
  submitting: boolean;
  onSubmit: (adjustPercent: number, routineId: string) => Promise<boolean>;
}) {
  // The change in percent the judge last pressed, for one routine.
  const [draft, setDraft] = useState<{ for: string; percent: number } | null>(null);
  const percent = draft && routineId && draft.for === routineId ? draft.percent : saved;
  const changed = percent !== saved;

  const lastSent = useRef<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  useEffect(() => {
    if (routineId === null || !changed || submitting || lastSent.current === percent) return;
    lastSent.current = percent;
    void onSubmit(percent, routineId).then((ok) => setFailed(ok ? null : percent));
  }, [routineId, changed, submitting, percent, onSubmit]);

  return {
    percent,
    changed,
    failed: failed === percent,
    adjust: (step: number) => routineId !== null && setDraft({ for: routineId, percent: percent + step }),
  };
}
