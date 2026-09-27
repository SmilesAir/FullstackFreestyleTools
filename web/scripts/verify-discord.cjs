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
check('equal totals share a place, the next skips ahead', JSON.stringify(rows.map((r) => r.place)) === '[3,1,1,null]', JSON.stringify(rows.map((r) => r.place)));
check('rows stay in play order', JSON.stringify(rows.map((r) => r.playIndex)) === '[0,1,2,3]', JSON.stringify(rows.map((r) => r.playIndex)));
const sorted = [...rows].sort(byPlace).map((r) => r.team.id);
check('by place: best first, no total last', JSON.stringify(sorted) === '["b","c","a","d"]', JSON.stringify(sorted));
const partial = poolStandings([teams[0]], { a: scored(7, null) }, judges)[0];
check('a missing judge score is left out of the total', partial.total === 7 && partial.categories[0].scores[1] === null, JSON.stringify(partial));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
