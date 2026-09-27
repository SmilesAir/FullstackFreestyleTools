/* eslint-disable @typescript-eslint/no-require-imports */
// Checks the Simple Ranking rules (no database). Run with: node scripts/verify-simple-ranking.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};
const { move, place, pressArrow, isComplete, aggregate } = require(path.join(__dirname, '..', 'lib', 'simple-ranking.ts'));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- move (a ranked team swaps with its neighbour) ----
check('up swaps with the team above', eq(move(['A', 'B', 'C'], 'C', 'up'), ['A', 'C', 'B']), move(['A', 'B', 'C'], 'C', 'up'));
check('down swaps with the team below', eq(move(['A', 'B', 'C'], 'A', 'down'), ['B', 'A', 'C']), move(['A', 'B', 'C'], 'A', 'down'));
check('up at 1st is a no-op', eq(move(['A', 'B', 'C'], 'A', 'up'), ['A', 'B', 'C']), move(['A', 'B', 'C'], 'A', 'up'));
check('down at last is a no-op', eq(move(['A', 'B', 'C'], 'C', 'down'), ['A', 'B', 'C']), move(['A', 'B', 'C'], 'C', 'down'));
check('move on an unranked team is a no-op', eq(move(['A', 'B'], 'Z', 'up'), ['A', 'B']), move(['A', 'B'], 'Z', 'up'));
check('a swap touches only the two teams (nobody else moves)', eq(move(['A', 'B', 'C', 'D'], 'C', 'up'), ['A', 'C', 'B', 'D']), move(['A', 'B', 'C', 'D'], 'C', 'up'));

// ---- place (an unranked team is inserted) ----
check('the first team ranked takes 1st with up', eq(place([], 'A', 'up'), ['A']), place([], 'A', 'up'));
check('the first team ranked takes 1st with down too', eq(place([], 'A', 'down'), ['A']), place([], 'A', 'down'));
check('up on an unranked team takes 1st, pushing the rest down', eq(place(['A', 'B'], 'Z', 'up'), ['Z', 'A', 'B']), place(['A', 'B'], 'Z', 'up'));
check('down on an unranked team takes 2nd', eq(place(['A', 'B'], 'Z', 'down'), ['A', 'Z', 'B']), place(['A', 'B'], 'Z', 'down'));
check('place on an already-ranked team is a no-op', eq(place(['A', 'B'], 'A', 'up'), ['A', 'B']), place(['A', 'B'], 'A', 'up'));

// ---- pressArrow (dispatches to place or move) and the worked example from the plan ----
{
  let r = ['A', 'B', 'C'];
  r = pressArrow(r, 'D', 'down'); // D unranked -> 2nd
  check('worked example, step 1: D takes 2nd', eq(r, ['A', 'D', 'B', 'C']), r);
  r = pressArrow(r, 'C', 'up'); // C ranked -> swaps with its neighbour (B)
  check('worked example, step 2: C swaps with B', eq(r, ['A', 'D', 'C', 'B']), r);
}
check('pressArrow places an unranked team', eq(pressArrow(['A'], 'B', 'up'), ['B', 'A']), pressArrow(['A'], 'B', 'up'));
check('pressArrow moves a ranked team', eq(pressArrow(['A', 'B'], 'B', 'up'), ['B', 'A']), pressArrow(['A', 'B'], 'B', 'up'));

// ---- isComplete ----
check('complete when every team has a rank', isComplete(['A', 'B'], ['B', 'A']), '');
check('incomplete otherwise', !isComplete(['A'], ['A', 'B']), '');
check('empty pool is complete', isComplete([], []), '');

// ---- exhaustive: any sequence of presses on a small pool keeps a valid permutation-in-progress ----
{
  const teams = ['A', 'B', 'C', 'D'];
  const validPrefix = (ranking) => new Set(ranking).size === ranking.length && ranking.every((id) => teams.includes(id));
  let ranking = [];
  let ok = true;
  const rand = (() => {
    let seed = 42;
    return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  })();
  for (let i = 0; i < 2000; i++) {
    const team = teams[Math.floor(rand() * teams.length)];
    const dir = rand() < 0.5 ? 'up' : 'down';
    ranking = pressArrow(ranking, team, dir);
    if (!validPrefix(ranking)) {
      ok = false;
      console.log('  invalid after press', team, dir, ranking);
      break;
    }
  }
  check('2000 random presses never produce a repeat or an unknown team', ok, '');
}

// ---- aggregate ----
{
  const teamIds = ['A', 'B', 'C']; // play order: A first, C last (plays latest)
  const result = aggregate(teamIds, [
    ['A', 'B', 'C'],
    ['A', 'B', 'C'],
  ]);
  check('two matching ballots: A wins with the fewest points', result.rows[0].teamId === 'A' && result.rows[0].total === 2, JSON.stringify(result.rows));
  check('counts recorded per place (A got 1st twice)', eq(result.rows[0].counts, [2, 0, 0]), JSON.stringify(result.rows[0].counts));
  check('judge count is the number of ballots', result.judgeCount === 2 && result.outdatedCount === 0, JSON.stringify(result));
}
{
  // A and B tie on total; B plays later, so B wins the tie.
  const teamIds = ['A', 'B']; // A first, B plays later
  const result = aggregate(teamIds, [
    ['A', 'B'],
    ['B', 'A'],
  ]);
  check('a tie goes to the team that plays later', result.rows[0].teamId === 'B' && result.rows[1].teamId === 'A', JSON.stringify(result.rows));
  check('tied rows are marked, non-tied are not', result.rows.every((r) => r.tie), JSON.stringify(result.rows));
  check('places are always distinct even on a tie', result.rows[0].place === 1 && result.rows[1].place === 2, JSON.stringify(result.rows));
}
{
  const teamIds = ['A', 'B', 'C'];
  const result = aggregate(teamIds, [
    ['A', 'B'], // missing C: outdated
    ['A', 'B', 'C', 'D'], // extra team: outdated
    ['A', 'A', 'C'], // duplicate: outdated
    ['A', 'B', 'C'], // valid
  ]);
  check('a ballot missing, adding or duplicating a team is ignored and counted as outdated', result.judgeCount === 1 && result.outdatedCount === 3, JSON.stringify(result));
}
{
  const result = aggregate(['A', 'B'], []);
  check('no ballots: no ties reported, order falls back to play order', !result.rows.some((r) => r.tie) && result.judgeCount === 0, JSON.stringify(result));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
