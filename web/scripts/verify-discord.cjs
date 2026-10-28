/* eslint-disable @typescript-eslint/no-require-imports */
// Checks the pure pieces behind the event's Discord posts: reading a pasted
// channel link, and the pool standings the results image draws (no database,
// no Discord).
// Run with: node scripts/verify-discord.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};
const lib = (name) => require(path.join(__dirname, '..', 'lib', name));
const { parseChannelInput } = lib('discord-channel.ts');
const { poolStandings, byPlace } = lib('pool-standings.ts');

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};

// ---- parseChannelInput
const channel = '1234567890123456789';
const inputs = {
  [`https://discord.com/channels/987654321098765432/${channel}`]: channel,
  [`  https://discordapp.com/channels/987654321098765432/${channel}  `]: channel,
  [`https://discord.com/channels/987654321098765432/${channel}/1111111111111111111`]: channel,
  [channel]: channel,
  'general': null,
  'https://example.com/channels/1/2': null,
  '': null,
};
for (const [input, want] of Object.entries(inputs)) {
  const got = parseChannelInput(input);
  check(`channel input ${JSON.stringify(input.trim()).slice(0, 60)} -> ${want}`, got === want, String(got));
}

// ---- poolStandings
const teams = ['a', 'b', 'c', 'd'].map((id) => ({ id, players: [id.toUpperCase()] }));
const judges = [{ judges: [{ playerId: 'j1', name: 'J1', categoryType: 'Ex' }, { playerId: 'j2', name: 'J2', categoryType: 'Ex' }] }];
const scored = (...scores) => ({
  routineId: 'r',
  curves: [],
  judges: Object.fromEntries(scores.map((s, i) => [`j${i + 1}`, { counts: {}, points: 0, submitted: s === null ? null : { score: s } }])),
});
// a: 5 + 4.555 = 9.56 (rounded), b: 6 + 4 = 10, c: 5 + 5 = 10 (tie with b), d: nothing yet.
const data = { a: scored(5, 4.555), b: scored(6, 4), c: scored(5, 5) };
const rows = poolStandings(teams, data, judges);
check('totals add every submitted score (to 2 decimals)', JSON.stringify(rows.map((r) => r.total)) === '[9.56,10,10,null]', JSON.stringify(rows.map((r) => r.total)));
check('equal totals and categories: the later team wins on seed', JSON.stringify(rows.map((r) => r.place)) === '[3,2,1,null]', JSON.stringify(rows.map((r) => r.place)));
check('the seed tie is marked on both teams', JSON.stringify(rows.map((r) => r.tieBreak)) === '[null,"seed","seed",null]', JSON.stringify(rows.map((r) => r.tieBreak)));
// Categories with one judge each: Ex (j1), Diff (j2), AI (j3).
const oneJudge = (n, categoryType) => ({ judges: [{ playerId: `j${n}`, name: `J${n}`, categoryType }] });
const twoCats = [oneJudge(1, 'Ex'), oneJudge(2, 'Diff')];
// a: 6 + 6 = 12, b: 8 + 4 = 12: b wins Ex, a wins Diff, so b (plays later) wins on seed.
const oneEach = poolStandings(teams.slice(0, 2), { a: scored(6, 6), b: scored(8, 4) }, twoCats);
check('one category each: the later team wins on seed', JSON.stringify(oneEach.map((r) => [r.place, r.tieBreak])) === '[[2,"seed"],[1,"seed"]]', JSON.stringify(oneEach.map((r) => [r.place, r.tieBreak])));
// a: 5 + 5 + 0 = 10, b: 4 + 4 + 2 = 10: a wins Ex and Diff, b only AI, so a wins though it plays first.
const onCats = poolStandings(teams.slice(0, 2), { a: scored(5, 5, 0), b: scored(4, 4, 2) }, [...twoCats, oneJudge(3, 'AI')]);
check('more categories won beats seed', JSON.stringify(onCats.map((r) => [r.place, r.tieBreak])) === '[[1,"categories"],[2,"categories"]]', JSON.stringify(onCats.map((r) => [r.place, r.tieBreak])));
check('rows stay in play order', JSON.stringify(rows.map((r) => r.playIndex)) === '[0,1,2,3]', JSON.stringify(rows.map((r) => r.playIndex)));
const sorted = [...rows].sort(byPlace).map((r) => r.team.id);
check('by place: best first, no total last', JSON.stringify(sorted) === '["c","b","a","d"]', JSON.stringify(sorted));
const partial = poolStandings([teams[0]], { a: scored(7, null) }, judges)[0];
check('a missing judge score is left out of the total', partial.total === 7 && partial.categories[0].scores[1] === null, JSON.stringify(partial));
check('no adjustment when every total is above zero', JSON.stringify(rows.map((r) => r.adjustment)) === '[0,0,0,null]', JSON.stringify(rows.map((r) => r.adjustment)));
// a: -5.8, b: 3, c: -6: the lowest is -6, so 7 lifts it over 0.
const negative = poolStandings(teams, { a: scored(-5.8, null), b: scored(3, null), c: scored(-6, null) }, judges);
check('a negative lowest total adds the next whole number to every team', JSON.stringify(negative.map((r) => [r.adjustment, r.total])) === '[[7,1.2],[7,10],[7,1],[null,null]]', JSON.stringify(negative.map((r) => [r.adjustment, r.total])));
check('the adjustment keeps places', JSON.stringify(negative.map((r) => r.place)) === '[2,1,3,null]', JSON.stringify(negative.map((r) => r.place)));
const lowest58 = poolStandings([teams[0]], { a: scored(-5.8, null) }, judges)[0];
check('a lowest of -5.8 adds 6', lowest58.adjustment === 6 && lowest58.total === 0.2, JSON.stringify(lowest58));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
