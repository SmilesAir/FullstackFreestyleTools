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
const curve = (category, tag) => ({ category, judges: 1, step: 0.5, ys: [tag] });
const run = (routineId, judges, curves = []) => ({ routineId, judges, curves });
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

const curves = combineTeamRoutines([
  run('r1', {}, [curve('Diff', 'old-diff'), curve('AI', 'old-ai')]),
  run('r2', {}, [curve('Diff', 'new-diff')]),
]);
const byCat = Object.fromEntries(curves.curves.map((c) => [c.category, c.ys[0]]));
check('each category curve comes from the newest run that has one', byCat.Diff === 'new-diff' && byCat.AI === 'old-ai', JSON.stringify(byCat));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
