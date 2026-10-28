/* eslint-disable @typescript-eslint/no-require-imports */
// Checks how a team's results combine over several runs of its routine (judges scoring
// one at a time), with no database.
// Run with: node scripts/verify-pool-results.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};
const { combineTeamRoutines } = require(path.join(__dirname, '..', 'lib', 'head-judge-results.ts'));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};

const judge = (score, notes = 5) => ({
  counts: { note: notes },
  points: 0,
  moves: [],
  submitted: score === null ? null : { score, baseline: score, adjustPercent: 0 },
});
const curve = (playerId, category, ys) => ({ playerId, category, step: 0.5, ys });
const run = (routineId, judges, judgeCurves = []) => ({ routineId, judges, judgeCurves });
const scores = (r) => Object.fromEntries(Object.entries(r.judges).map(([id, j]) => [id, j.submitted?.score ?? null]));

check('no routines -> nothing', combineTeamRoutines([]) === null, '');

// The Ryan Test case: William (Diff) on the first run, Tymek (AI) on the second.
const both = combineTeamRoutines([run('r1', { william: judge(16.4) }), run('r2', { tymek: judge(28.5) })]);
check('judges scoring in separate runs are all counted', JSON.stringify(scores(both)) === '{"william":16.4,"tymek":28.5}', JSON.stringify(scores(both)));
check('the result is labelled with the newest run', both.routineId === 'r2', both.routineId);

const rejudge = combineTeamRoutines([run('r1', { a: judge(10) }), run('r2', { a: judge(12) })]);
check('a judge who scores again replaces their own earlier score', scores(rejudge).a === 12, JSON.stringify(scores(rejudge)));

const notesOnly = combineTeamRoutines([run('r1', { a: judge(10, 5) }), run('r2', { a: judge(null, 9) })]);
check('notes in a newer run without a score keep the earlier score', scores(notesOnly).a === 10 && notesOnly.judges.a.counts.note === 5, JSON.stringify(notesOnly.judges.a));

const neverScored = combineTeamRoutines([run('r1', { a: judge(null, 3) }), run('r2', { a: judge(null, 8) })]);
check('a judge who never scored shows their newest notes', neverScored.judges.a.submitted === null && neverScored.judges.a.counts.note === 8, JSON.stringify(neverScored.judges.a));

// Two Diff judges and one AI judge on the first run; only Diff judge a re-judges on the second.
const curves = combineTeamRoutines([
  run('r1', { a: judge(10), b: judge(20), c: judge(30) }, [curve('a', 'Diff', [2, 4]), curve('b', 'Diff', [6, 8]), curve('c', 'AI', [5, 5])]),
  run('r2', { a: judge(12) }, [curve('a', 'Diff', [4, 6])]),
]);
const byCat = Object.fromEntries(curves.curves.map((c) => [c.category, c]));
check('a re-judge replaces only that judge in the category average', JSON.stringify(byCat.Diff.ys) === '[5,7]' && byCat.Diff.judges === 2, JSON.stringify(byCat.Diff));
check('other categories keep their curve', JSON.stringify(byCat.AI.ys) === '[5,5]' && byCat.AI.judges === 1, JSON.stringify(byCat.AI));

const notesCurve = combineTeamRoutines([
  run('r1', { a: judge(10) }, [curve('a', 'Diff', [2])]),
  run('r2', { a: judge(null) }, [curve('a', 'Diff', [9])]),
]);
check('notes in a newer run without a score keep the earlier curve', notesCurve.curves[0].ys[0] === 2, JSON.stringify(notesCurve.curves));

const uneven = combineTeamRoutines([
  run('r1', { a: judge(10), b: judge(20) }, [curve('a', 'Diff', [1, 1, 1]), curve('b', 'Diff', [3, 3, 3])]),
  run('r2', { a: judge(12) }, [curve('a', 'Diff', [1, 1])]),
]);
check('curves of different lengths average over the shortest', JSON.stringify(uneven.curves[0].ys) === '[2,2]', JSON.stringify(uneven.curves));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
