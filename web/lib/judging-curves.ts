// Each note-taking category's judges of one routine, averaged into one curve
// per category. Shared (client + server): the server draws it from the
// database's notes, the Judging Trainer from the notes kept in the browser.

import { categorySettings, type SystemSettings } from './judging-settings';
import { CURVE_SHAPE, CURVE_SPREAD, scoreCurve, type CurveScore } from './score-curve';
import { notePoints, type OtherCurve } from './judging';

const OTHER_STEP = 0.5;

export type CurveNote = {
  playerId: string;
  categoryType: string;
  noteType: string;
  notedAt: number;
  lineValue: number | null;
  multiplier: number | null;
};

// A category counts the judges who took at least one note; a category nobody
// took notes in is left out. Each judge's curve is drawn from the category's
// weights in `settings`, on the same time axis rule as the graph (whole 30
// seconds, long enough for the routine and the latest note).
export function averageRoutineCurves(
  routine: { startedAt: number; routineSeconds: number },
  notes: readonly CurveNote[],
  settings: SystemSettings,
  categories: readonly string[]
): OtherCurve[] {
  // category -> judge -> that judge's points
  const points = new Map<string, Map<string, CurveScore[]>>();
  let latest = 0;
  for (const n of notes) {
    const t = Math.max(0, (n.notedAt - routine.startedAt) / 1000);
    latest = Math.max(latest, t);
    const weights = categorySettings(settings, n.categoryType)?.noteWeights ?? {};
    const judges = points.get(n.categoryType) ?? new Map<string, CurveScore[]>();
    const list = judges.get(n.playerId) ?? [];
    list.push({ t, s: notePoints(n, weights) });
    judges.set(n.playerId, list);
    points.set(n.categoryType, judges);
  }

  const duration = Math.max(30, Math.ceil(Math.max(routine.routineSeconds, latest) / 30) * 30);
  const curves: OtherCurve[] = [];
  for (const category of categories) {
    const judges = points.get(category);
    if (!judges || judges.size === 0) continue;
    let sum: number[] | null = null;
    for (const scores of judges.values()) {
      const { ys } = scoreCurve(scores, { duration, spread: CURVE_SPREAD, shape: CURVE_SHAPE, step: OTHER_STEP });
      sum = sum ? sum.map((v, i) => v + ys[i]) : ys;
    }
    curves.push({
      category,
      judges: judges.size,
      step: OTHER_STEP,
      ys: sum!.map((v) => Math.round((v / judges.size) * 100) / 100),
    });
  }
  return curves;
}
