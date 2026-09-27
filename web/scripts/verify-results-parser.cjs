/* eslint-disable @typescript-eslint/no-require-imports */
// Checks the Results Parser's validation rules and the mapping of Claude's answer
// into editor rounds (no database, no API call).
// Run with: node scripts/verify-results-parser.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};
const lib = (name) => require(path.join(__dirname, '..', 'lib', 'results-parser', name));
const { validateResults } = lib('validate.ts');
const { buildResult, ResultsSchema, allNames, resolveDivision, resolveRound } = lib('build.ts');
const { toSaveRounds } = lib('types.ts');
const { applyResolution, nameKey } = require(path.join(__dirname, '..', 'lib', 'roster-review.ts'));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};

const team = (place, ...players) => ({ place, players });
const round = (n, ...pools) => ({ round: n, pools: pools.map((teams, i) => ({ letter: 'ABCD'[i], teams })) });
const problems = (rounds) => validateResults(rounds);
const has = (rounds, re) => problems(rounds).some((p) => re.test(p));

// ---- validation ----
check('a plain finals is valid', problems([round(1, [team(1, 'a', 'b'), team(2, 'c', 'd'), team(3, 'e', 'f')])]).length === 0, problems([round(1, [team(1, 'a', 'b')])]));
check('ties are valid (1, 1, 3)', problems([round(1, [team(1, 'a'), team(1, 'b'), team(3, 'c')])]).length === 0, '');
check('a tie at the end is valid (1, 2, 2)', problems([round(1, [team(1, 'a'), team(2, 'b'), team(2, 'c')])]).length === 0, '');
check('places restart in each pool', problems([round(2, [team(1, 'a'), team(2, 'b')], [team(1, 'c'), team(2, 'd')]), round(1, [team(1, 'a'), team(2, 'c')])]).length === 0, problems([]));
check('no rounds is an error', has([], /at least one round/), '');
check('a gap in places (1, 3) is an error', has([round(1, [team(1, 'a'), team(3, 'b')])], /places must run/), '');
check('places not starting at 1 are an error', has([round(1, [team(2, 'a'), team(3, 'b')])], /places must run/), '');
check('a missing place is an error', has([round(1, [team(null, 'a')])], /needs a place/), '');
check('a fractional place is an error', has([round(1, [team(1.5, 'a')])], /needs a place/), '');
check('a zero place is an error', has([round(1, [team(0, 'a')])], /needs a place/), '');
check('an empty slot is an error', has([round(1, [team(1, 'a', null)])], /empty player slot/), '');
check('a team with no players is an error', has([round(1, [team(1)])], /has no players/), '');
check('a pool with no teams is an error', has([round(1, [])], /has no teams/), '');
check('a round with no pools is an error', has([{ round: 1, pools: [] }], /has no pools/), '');
check('a player on two teams in one round is an error', has([round(1, [team(1, 'a'), team(2, 'a')])], /on two teams/), '');
check('a player on two teams across pools of a round is an error', has([round(2, [team(1, 'a')], [team(1, 'a')])], /on two teams/), '');
check('the same player in two different rounds is fine', problems([round(1, [team(1, 'a')]), round(2, [team(1, 'a')])]).length === 0, '');
check('a round twice is an error', has([round(1, [team(1, 'a')]), round(1, [team(1, 'b')])], /appears twice/), '');
check('an unknown round is an error', has([round(9, [team(1, 'a')])], /Unknown round/), '');
check('an unknown pool is an error', has([{ round: 1, pools: [{ letter: 'Z', teams: [team(1, 'a')] }] }], /unknown pool/), '');
check('a pool twice is an error', has([{ round: 1, pools: [{ letter: 'A', teams: [team(1, 'a')] }, { letter: 'A', teams: [team(1, 'b')] }] }], /twice/), '');

// ---- toSaveRounds ----
const editor = [{ round: 1, pools: [{ letter: 'A', teams: [{ key: 'k', place: 1, players: [{ id: 'p1', name: 'X', input: 'x' }, { id: null, name: '' }] }] }] }];
check('toSaveRounds keeps only ids and places', JSON.stringify(toSaveRounds(editor)) === JSON.stringify([{ round: 1, pools: [{ letter: 'A', teams: [{ place: 1, players: ['p1', null] }] }] }]), JSON.stringify(toSaveRounds(editor)));

// ---- Claude answer -> editor ----
const answer = {
  eventName: '  Test Jam  ',
  startDate: '2025-06-01',
  endDate: 'June 2',
  divisions: [
    {
      divisionName: 'Open Pairs',
      rounds: [
        { round: 'Finals', pools: [{ pool: null, teams: [{ place: 1, players: ['Jane Doe', 'John Smith'] }, { place: 2, players: ['Ann Lee'] }] }] },
        {
          round: 'Preliminaries',
          pools: [
            { pool: 'Pool B', teams: [{ place: 1.0, players: ['Ann Lee', ' Jane Doe '] }] },
            { pool: null, teams: [{ place: null, players: ['Zed Unknown'] }, { place: 2, players: [] }] },
          ],
        },
        { round: 'Preliminaries', pools: [{ pool: 'B', teams: [{ place: 2, players: ['John Smith'] }] }] },
      ],
    },
  ],
  unparsed: ['  Judges: Bob ', ''],
};
check('the schema accepts a well-formed answer', ResultsSchema.safeParse(answer).success, JSON.stringify(ResultsSchema.safeParse(answer).error?.issues));
check('the schema takes any division text (mapped afterwards)', ResultsSchema.safeParse({ ...answer, divisions: [{ divisionName: 'Singles', rounds: [] }] }).success, '');
const divs = { 'Open Pairs': 'Open Pairs', open: 'Open Pairs', 'OPEN PAIR': 'Open Pairs', 'Open Co-op': 'Open Co-op', coop: 'Open Co-op', 'Open Coop': 'Open Co-op', 'Women Pairs': 'Women Pairs', "Women's Pairs": 'Women Pairs', Women: 'Women Pairs', 'Mixed Pairs': 'Mixed Pairs', mixed: 'Mixed Pairs', Singles: null, 'Open Singles': null };
for (const [input, want] of Object.entries(divs)) check(`division "${input}" -> ${want}`, resolveDivision(input) === want, String(resolveDivision(input)));
const rnds = { Finals: 1, Final: 1, 'Semi Finals': 2, Semifinals: 2, semis: 2, Quarterfinals: 3, 'Quarter-finals': 3, Preliminaries: 4, Prelims: 4, 'Pool play': 4, 'Round of 16': null, Bronze: null };
for (const [input, want] of Object.entries(rnds)) check(`round "${input}" -> ${want}`, resolveRound(input) === want, String(resolveRound(input)));
check('allNames trims and skips blanks', JSON.stringify(allNames(answer)) === JSON.stringify(['Jane Doe', 'John Smith', 'Ann Lee', 'Ann Lee', 'Jane Doe', 'Zed Unknown', 'John Smith']), JSON.stringify(allNames(answer)));

const slot = (input, id, name, status) => ({ input, status, selectedId: id, candidates: id ? [{ id, name, country: null, membership: null, score: 0.9 }] : [] });
const matches = new Map([
  ['Jane Doe', slot('Jane Doe', 'p-jane', 'Jane Doe', 'matched')],
  ['John Smith', slot('John Smith', null, '', 'uncertain')],
  ['Ann Lee', slot('Ann Lee', 'p-ann', 'Ann Lee', 'matched')],
]);
const built = buildResult(answer, matches);
const div = built.divisions[0];
check('event name is trimmed, a bad date is dropped', built.eventName === 'Test Jam' && built.startDate === '2025-06-01' && built.endDate === null, JSON.stringify(built));
check('left-out lines are kept, blanks dropped', JSON.stringify(built.unparsed) === JSON.stringify(['Judges: Bob']), JSON.stringify(built.unparsed));
check('rounds come out Finals first, duplicates merged', JSON.stringify(div.rounds.map((r) => r.round)) === '[1,4]', JSON.stringify(div.rounds.map((r) => r.round)));
const finals = div.rounds[0];
check('an unnamed pool is pool A', finals.pools.length === 1 && finals.pools[0].letter === 'A', JSON.stringify(finals.pools.map((p) => p.letter)));
const prelims = div.rounds[1];
check('named pool B and an unnamed pool get different letters', JSON.stringify(prelims.pools.map((p) => p.letter)) === '["A","B"]', JSON.stringify(prelims.pools.map((p) => p.letter)));
check('pool B merged the repeated round', prelims.pools[1].teams.length === 2, JSON.stringify(prelims.pools[1].teams.map((t) => t.players.length)));
check('a team with no players is dropped', prelims.pools[0].teams.length === 1, String(prelims.pools[0].teams.length));
const jane = finals.pools[0].teams[0].players[0];
check('a confident match is selected with its name', jane.id === 'p-jane' && jane.name === 'Jane Doe' && jane.status === 'matched', JSON.stringify(jane));
const john = finals.pools[0].teams[0].players[1];
check('an unsure match stays unpicked but keeps candidates and the written name', john.id === null && john.input === 'John Smith' && john.status === 'uncertain', JSON.stringify(john));
const zed = prelims.pools[0].teams[0].players[0];
check('a name with no match entry becomes a "new player?" slot', zed.id === null && zed.status === 'none' && zed.input === 'Zed Unknown', JSON.stringify(zed));
check('a null place takes its position in the pool and a float place is rounded', prelims.pools[0].teams[0].place === 1 && prelims.pools[1].teams[0].place === 1, JSON.stringify(prelims.pools.map((p) => p.teams.map((t) => t.place))));
const placesOf = (teams) =>
  buildResult(
    { eventName: null, startDate: null, endDate: null, unparsed: [], divisions: [{ divisionName: 'Open Pairs', rounds: [{ round: 'Finals', pools: [{ pool: null, teams }] }] }] },
    matches
  ).divisions[0].rounds[0].pools[0].teams.map((t) => t.place);
const listed = placesOf([team(null, 'a'), team(null, 'b'), team(null, 'c')]);
check('a list with no places is numbered in order', JSON.stringify(listed) === '[1,2,3]', JSON.stringify(listed));
const afterTie = placesOf([team(1, 'a'), team(1, 'b'), team(null, 'c')]);
check('a missing place after a tie skips ahead (1, 1, 3)', JSON.stringify(afterTie) === '[1,1,3]', JSON.stringify(afterTie));
const messy = buildResult(
  {
    eventName: null, startDate: null, endDate: null, unparsed: [],
    divisions: [
      { divisionName: 'open', rounds: [{ round: 'Semi Finals', pools: [{ pool: 'A', teams: [{ place: 1, players: ['Ann Lee'] }] }] }, { round: 'Bronze match', pools: [] }] },
      { divisionName: 'Open Singles', rounds: [] },
      { divisionName: 'Open Pairs', rounds: [] },
    ],
  },
  matches
);
check('names are mapped, unknown ones are left out with a reason', messy.divisions.length === 1 && messy.divisions[0].divisionName === 'Open Pairs' && messy.divisions[0].rounds[0].round === 2, JSON.stringify(messy.divisions.map((d) => [d.divisionName, d.rounds.map((r) => r.round)])));
check('skipped and repeated items are reported', messy.unparsed.length === 3 && /Bronze match/.test(messy.unparsed[0]) && /Open Singles/.test(messy.unparsed[1]) && /twice/.test(messy.unparsed[2]), JSON.stringify(messy.unparsed));
const keys = new Set(div.rounds.flatMap((r) => r.pools.flatMap((p) => p.teams.map((t) => t.key))));
check('every team gets its own key', keys.size === 5, String(keys.size));

// ---- fixing a name once fixes it everywhere (roster review) ----
const sl = (input, selectedId = null) => ({ input, status: selectedId ? 'matched' : 'none', candidates: [], selectedId, selectedName: selectedId ? 'x' : null });
const teamsIn = [[sl('Mafer Bonilla'), sl('Ann Lee', 'p-ann')], [sl('mafer  bonilla '), sl('Bob Jones')], [sl('Mafer Bonilla', 'p-other')]];
const fixed = applyResolution(teamsIn, 'Mafer Bonilla', { selectedId: 'p-mafer', selectedName: 'Mafer Bonilla', created: true });
check('nameKey ignores case and extra spaces', nameKey(' Mafer  BONILLA ') === 'mafer bonilla', nameKey(' Mafer  BONILLA '));
check('every unresolved copy of the name gets the player', fixed[0][0].selectedId === 'p-mafer' && fixed[1][0].selectedId === 'p-mafer', JSON.stringify(fixed));
check('a copy already resolved is left alone', fixed[2][0].selectedId === 'p-other' && !fixed[2][0].created, JSON.stringify(fixed[2][0]));
check('other names are untouched', fixed[0][1].selectedId === 'p-ann' && fixed[1][1].selectedId === null, JSON.stringify(fixed));
check('the input is not mutated', teamsIn[0][0].selectedId === null, '');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
