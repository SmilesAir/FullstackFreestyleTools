// Each note-taking category's judges of one routine, averaged into one curve
// per category. Shared (client + server): the server draws it from the
// database's notes, the Judging Trainer from the notes kept in the browser.

import { categorySettings, type SystemSettings } from './judging-settings';
import { CURVE_SHAPE, CURVE_SPREAD, scoreCurve, type CurveScore } from './score-curve';
import { notePoints, notesFromStart, type OtherCurve } from './judging';

const OTHER_STEP = 0.5;

export type CurveNote = {
  playerId: string;
  categoryType: string;
  noteType: string;
  notedAt: number;
  lineValue: number | null;
  multiplier: number | null;
};

// One judge's curve for one routine in one category.
export type JudgeCurve = { playerId: string; category: string; step: number; ys: number[] };

// Each judge's curve per category they took notes in (a category nobody took
// notes in has none), drawn from the category's weights in `settings`, on the
// same time axis rule as the graph (whole 30 seconds, long enough for the
// routine and the latest note).
export function judgeRoutineCurves(
  routine: { startedAt: number; routineSeconds: number },
  notes: readonly CurveNote[],
  settings: SystemSettings,
  categories: readonly string[]
): JudgeCurve[] {
  // category -> judge -> that judge's points
  const points = new Map<string, Map<string, CurveScore[]>>();
  let latest = 0;
  for (const n of notesFromStart(notes, routine.startedAt)) {
    const t = (n.notedAt - routine.startedAt) / 1000;
    latest = Math.max(latest, t);
    const weights = categorySettings(settings, n.categoryType)?.noteWeights ?? {};
    const judges = points.get(n.categoryType) ?? new Map<string, CurveScore[]>();
    const list = judges.get(n.playerId) ?? [];
    list.push({ t, s: notePoints(n, weights) });
    judges.set(n.playerId, list);
    points.set(n.categoryType, judges);
  }

  const duration = Math.max(30, Math.ceil(Math.max(routine.routineSeconds, latest) / 30) * 30);
  const curves: JudgeCurve[] = [];
  for (const category of categories) {
    for (const [playerId, scores] of points.get(category) ?? []) {
      const { ys } = scoreCurve(scores, { duration, spread: CURVE_SPREAD, shape: CURVE_SHAPE, step: OTHER_STEP });
      curves.push({ playerId, category, step: OTHER_STEP, ys });
    }
  }
  return curves;
}

// Judges' curves averaged into one curve per category, in the order of
// `categories` (a category with no curves is left out). Curves from different
// runs can differ in length, so each average is as long as its shortest curve.
export function averageJudgeCurves(curves: readonly JudgeCurve[], categories: readonly string[]): OtherCurve[] {
  const averaged: OtherCurve[] = [];
  for (const category of categories) {
    const judges = curves.filter((c) => c.category === category);
    if (judges.length === 0) continue;
    const len = Math.min(...judges.map((c) => c.ys.length));
    averaged.push({
      category,
      judges: judges.length,
      step: judges[0].step,
      ys: Array.from(
        { length: len },
        (_, i) => Math.round((judges.reduce((sum, c) => sum + c.ys[i], 0) / judges.length) * 100) / 100
      ),
    });
  }
  return averaged;
}

// Each note-taking category's judges of one routine, averaged: a category counts
// the judges who took at least one note (see judgeRoutineCurves).
export function averageRoutineCurves(
  routine: { startedAt: number; routineSeconds: number },
  notes: readonly CurveNote[],
  settings: SystemSettings,
  categories: readonly string[]
): OtherCurve[] {
  return averageJudgeCurves(judgeRoutineCurves(routine, notes, settings, categories), categories);
}
