/* eslint-disable @typescript-eslint/no-require-imports */
// Checks the rankings and ratings library against the output of the original
// PointsService, which Planning/AllFrisbeeData-*.json holds next to its inputs.
// Run with: node scripts/verify-points.cjs [path to the json]
// (The library is TypeScript: it is compiled on the fly with the project's own
// typescript package.)
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};
const lib = (name) => require(path.join(__dirname, '..', 'lib', 'points', name));
const { DEFAULT_PARAMS, validateParams, resolveParams } = lib('params.ts');
const { buildRankings } = lib('rankings.ts');
const { buildRatings } = lib('ratings.ts');
const { divisionCounts } = lib('divisions.ts');
void Module;

const file = process.argv[2] || path.join(__dirname, '..', '..', 'Planning', 'AllFrisbeeData-2026-8-12.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ' -> ' + detail}`);
};

// ---- The data as the library takes it -------------------------------------------------
const players = new Map();
for (const [id, p] of Object.entries(data.playersData)) {
  players.set(id, { id, firstName: p.firstName ?? null, lastName: p.lastName ?? null, aliasId: p.aliasKey ?? null, gender: p.gender ?? null });
}

// Hidden divisions are not part of the published data.
function resultsOf(r) {
  const rounds = [];
  for (const [roundKey, round] of Object.entries(r.resultsData)) {
    if (!roundKey.startsWith('round')) continue;
    const teams = [];
    for (const [poolKey, pool] of Object.entries(round)) {
      if (!poolKey.startsWith('pool')) continue;
      for (const team of pool.teamData) teams.push({ players: team.players, place: team.place });
    }
    rounds.push({ round: parseInt(roundKey.replace('round', ''), 10), teams });
  }
  // Given in ascending order on purpose: the library puts them in the order it is set to read them.
  rounds.sort((a, b) => a.round - b.round);
  return { id: r.key, eventId: r.eventId, eventName: r.eventName, divisionName: r.divisionName, createdAt: r.createdAt, rounds };
}

function eventsOf() {
  const byEvent = new Map();
  for (const r of Object.values(data.resultsData)) {
    if (r.eventId === undefined || r.isHidden) continue;
    if (!byEvent.has(r.eventId)) byEvent.set(r.eventId, []);
    byEvent.get(r.eventId).push(resultsOf(r));
  }
  return Object.entries(data.eventsData).map(([id, e]) => ({
    id,
    name: e.eventName,
    startDate: e.startDate,
    startMs: Date.parse(e.startDate),
    results: byEvent.get(id) ?? [],
  }));
}
const allEvents = eventsOf();
const divisionById = new Map(allEvents.flatMap((e) => e.results.map((r) => [r.id, { ...r, startMs: e.startMs }])));

// ---- Rankings -------------------------------------------------------------------------
const selected = new Set();
for (const kind of ['ranking-open', 'ranking-women']) {
  for (const row of data.pointsData[kind]) for (const item of row.pointsList) selected.add(item.resultsId);
}
console.log(`\nRankings: ${selected.size} divisions were counted by the original service`);

// The data file was saved after the last division was edited but its rankings were
// published before, so a division edited in between is expected to differ. Everything
// else has to match exactly.
function compareRankings(kind, expected, params) {
  const results = allEvents.flatMap((e) => e.results).filter((r) => selected.has(r.id) && divisionCounts(r.divisionName, kind, params));
  const rows = buildRankings(results, players, kind, params);
  const want = new Map(expected.map((row) => [row.id, row]));
  const drifted = new Set();
  const problems = [];
  if (rows.length !== expected.length) problems.push(`${rows.length} rows, expected ${expected.length}`);
  for (const row of rows) {
    const other = want.get(row.id);
    if (!other) {
      problems.push(`extra player ${row.fullName}`);
      continue;
    }
    const a = new Map(row.pointsList.map((i) => [i.resultsId, i.points]));
    const b = new Map(other.pointsList.map((i) => [i.resultsId, i.points]));
    for (const id of new Set([...a.keys(), ...b.keys()])) if (a.get(id) !== b.get(id)) drifted.add(id);
  }
  return { problems, drifted, rows, want };
}

let editedDivisions = new Set();
for (const kind of ['open', 'women']) {
  const result = compareRankings(kind, data.pointsData[`ranking-${kind}`], DEFAULT_PARAMS);
  const names = [...result.drifted].map((id) => `${divisionById.get(id)?.eventName} / ${divisionById.get(id)?.divisionName}`);
  check(
    `${kind} ranking: points in every division match, apart from ${names.length} edited since (${names.join('; ') || 'none'})`,
    result.problems.length === 0 && result.drifted.size <= 1,
    `${result.problems.slice(0, 3).join('; ')} ${names.join('; ')}`
  );
  if (kind === 'open') editedDivisions = result.drifted;
  // Players who did not play an edited division have identical totals and results counts.
  const bad = result.rows.filter((row) => {
    const other = result.want.get(row.id);
    const own = row.pointsList.some((i) => result.drifted.has(i.resultsId));
    return !own && (row.points !== other.points || row.resultsCount !== other.resultsCount);
  });
  check(`${kind} ranking: totals and results counts match for every player not in an edited division`, bad.length === 0, bad.slice(0, 3).map((r) => r.fullName).join(', '));
}
const bestFirst = { ...DEFAULT_PARAMS, roundOrder: 'best-first' };
const differsBest = compareRankings('open', data.pointsData['ranking-open'], bestFirst).drifted.size;
console.log(`info: reading rounds best-first instead of PointsService's order changes the points in ${differsBest} of ${selected.size} divisions`);

// ---- Ratings --------------------------------------------------------------------------
// The original service swapped the two K factors: worlds 48, majors 64.
const legacy = resolveParams({ ratings: { kMajor: 64, kWorlds: 48 } });
console.log('\nRatings (all events):');
const ratingRows = buildRatings(allEvents, players, legacy);
const expectedRatings = data.pointsData['rating-open'];
const wantRating = new Map(expectedRatings.map((r) => [r.id, r]));
const firstEdited = Math.min(...[...editedDivisions].map((id) => divisionById.get(id).startMs));
const touched = new Set();
for (const e of allEvents) {
  if (e.startMs < firstEdited) continue;
  for (const r of e.results) for (const round of r.rounds) for (const t of round.teams) for (const id of t.players) touched.add(id);
}
const untouched = ratingRows.filter((r) => !touched.has(r.id));
const close = (a, b) => Math.abs(a - b) < 1e-6;
const differs = (r) => {
  const o = wantRating.get(r.id);
  return !o || !close(r.rating, o.rating) || r.matchCount !== o.matchCount || !close(r.highestRating, o.highestRating) ||
    r.highestRatingDate !== o.highestRatingDate || r.highestRank !== o.highestRank || r.highestRankDate !== o.highestRankDate;
};
const badRating = untouched.filter(differs);
check(
  `ratings match exactly for the ${untouched.length} players not in the events edited since (rating, matches, peak rating and date, peak rank and date)`,
  badRating.length === 0,
  `${badRating.length} differ, e.g. ${badRating.slice(0, 3).map((r) => r.fullName).join(', ')}`
);
check('the same players are rated', ratingRows.length === expectedRatings.length && ratingRows.every((r) => wantRating.has(r.id)));
console.log(`info: ${ratingRows.filter(differs).length} of ${ratingRows.length} ratings differ in total: players in or after the edited event`);
const fixedRows = buildRatings(allEvents, players, DEFAULT_PARAMS);
console.log(`info: with the fixed K factors (worlds 64, majors 48) ${fixedRows.filter((r) => !close(r.rating, wantRating.get(r.id)?.rating ?? NaN)).length} of ${fixedRows.length} ratings differ from the original`);

// ---- Tunables -------------------------------------------------------------------------
console.log('\nTunables:');
const D = DEFAULT_PARAMS;
check('defaults are the original constants',
  D.rankings.kOpen === 4 && D.rankings.kWomen === 10 && D.rankings.majorBonus === 100 && D.rankings.worldsBonus === 200 &&
  D.rankings.topResults === 8 && D.ratings.kDefault === 32 && D.ratings.startingRating === 400 && D.ratings.eloScale === 400 &&
  D.ratings.minMatchesForPeakRank === 100 && D.rankings.worldsNames.join() === 'FPAW');
const ok = validateParams(JSON.parse(JSON.stringify(D)));
check('the defaults validate and round-trip', ok.ok && JSON.stringify(ok.params) === JSON.stringify(D));
const bad = [
  ['rankings.kOpen', -1], ['rankings.kOpen', 'x'], ['rankings.kOpen', NaN], ['rankings.topResults', 0], ['rankings.topResults', 2.5],
  ['rankings.playerExponent', 5], ['ratings.eloScale', 10], ['ratings.minRating', 5000], ['rankings.majorNames', 'FPAW'],
  ['rankings.majorNames', ['']], ['rankings.worldsNames', new Array(51).fill('x')],
];
for (const [field, value] of bad) {
  const draft = JSON.parse(JSON.stringify(D));
  const [group, key] = field.split('.');
  draft[group][key] = value;
  const result = validateParams(draft);
  check(`rejects ${field} = ${JSON.stringify(value)?.slice(0, 20)}`, !result.ok && result.problems.some((p) => p.path === field));
}
check('rejects a missing group', !validateParams({}).ok);
const lenient = resolveParams({ rankings: { kOpen: 6, topResults: 'x' }, ratings: 5 });
check('resolveParams keeps good values and defaults the rest', lenient.rankings.kOpen === 6 && lenient.rankings.topResults === 8 && lenient.ratings.kDefault === 32);

// A changed tunable changes exactly the expected outputs.
const results = allEvents.flatMap((e) => e.results).filter((r) => selected.has(r.id) && divisionCounts(r.divisionName, 'open', D));
const base = buildRankings(results, players, 'open', D);
const k5 = buildRankings(results, players, 'open', { ...D, rankings: { ...D.rankings, kOpen: 5 } });
check('open K 4 to 5 changes points but not the women ranking',
  base.some((r) => r.points !== k5.find((x) => x.id === r.id).points) &&
  JSON.stringify(buildRankings(results, players, 'women', D)) === JSON.stringify(buildRankings(results, players, 'women', { ...D, rankings: { ...D.rankings, kOpen: 5 } })));
const top6 = buildRankings(results, players, 'open', { ...D, rankings: { ...D.rankings, topResults: 6 } });
check('top N 8 to 6 never raises a total and keeps results counts',
  top6.every((r) => r.points <= base.find((x) => x.id === r.id).points && r.resultsCount === base.find((x) => x.id === r.id).resultsCount));
const noBonus = buildRankings(results, players, 'open', { ...D, rankings: { ...D.rankings, worldsBonus: 0, majorBonus: 0 } });
check('removing the bonuses lowers the leaders', noBonus[0].points < base[0].points);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
