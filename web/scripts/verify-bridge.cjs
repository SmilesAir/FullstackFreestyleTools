/* eslint-disable @typescript-eslint/no-require-imports */
// Checks the Dynamo <-> Postgres bridge's pure mapping logic against real item shapes
// pulled from freestyle-judge-production-dataTable (FPAW 2026), as plain objects (what the
// DynamoDB Document Client hands the app, not the raw AttributeValue wire format). No
// database or AWS calls - just mapping.ts. Run with: node scripts/verify-bridge.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};
// mapping.ts imports 'server-only' and event-creator-layout's teamKey; stub the former (a
// no-op marker package) so it can be required outside of Next's server context.
require.cache[require.resolve('server-only')] = { exports: {} };
const {
  dynamoEventToCanonical,
  dynamoPoolToCanonical,
  dynamoPoolResultToCanonical,
  applyCanonicalToDynamoPool,
  dynamoPoolKey,
} = require(path.join(__dirname, '..', 'lib', 'bridge', 'mapping.ts'));
const { diff3 } = require(path.join(__dirname, '..', 'lib', 'bridge', 'reconcile.ts'));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- Event item (bare uuid key, FPAW 2026's real 77427e49-... item, Open Co-op division) ----
const eventItem = {
  key: '77427e49-792c-4a8e-b0e1-7577a47dd36e',
  eventName: 'FPAW 2026',
  dataVersion: 1,
  eventData: {
    divisionData: {
      'Open Co-op': {
        name: 'Open Co-op',
        roundData: {
          Semifinals: { name: 'Semifinals', lengthSeconds: 240, poolNames: ['A', 'B'] },
          Finals: { name: 'Finals', lengthSeconds: 240, poolNames: ['A'] },
        },
        teams: [
          ['8c2fc7a0-010f-4f67-af38-60e11e01bce5', '1993e4e6-5215-4080-ac1d-932211fe35c0', '361f438f-715a-400e-bfdd-7ef1c7b0888f'],
          ['fbf9401b-08b2-425d-9201-240038699893', 'dfdb565e-a39a-4533-9d61-58a3b04dd2f5', 'c2e6bd58-268f-43e3-88e0-403fe0ebc0fa'],
        ],
      },
    },
  },
};

const canonicalEvent = dynamoEventToCanonical(eventItem);
check('event: eventName', canonicalEvent.eventName === 'FPAW 2026', canonicalEvent.eventName);
check('event: division present', eq(Object.keys(canonicalEvent.divisions), ['Open Co-op']), canonicalEvent.divisions);
check('event: routineSeconds from round lengthSeconds', canonicalEvent.divisions['Open Co-op'].routineSeconds === 240, canonicalEvent.divisions['Open Co-op'].routineSeconds);
check('event: round pool letters', eq(canonicalEvent.divisions['Open Co-op'].rounds['Semifinals'].poolLetters, ['A', 'B']), canonicalEvent.divisions['Open Co-op'].rounds);
check('event: roster team count', canonicalEvent.divisions['Open Co-op'].roster.length === 2, canonicalEvent.divisions['Open Co-op'].roster);
check(
  'event: roster team 1 players in order',
  eq(canonicalEvent.divisions['Open Co-op'].roster[0], [
    '8c2fc7a0-010f-4f67-af38-60e11e01bce5',
    '1993e4e6-5215-4080-ac1d-932211fe35c0',
    '361f438f-715a-400e-bfdd-7ef1c7b0888f',
  ]),
  canonicalEvent.divisions['Open Co-op'].roster[0]
);
check('event: empty item -> no divisions, no throw', eq(dynamoEventToCanonical({}).divisions, {}), 'threw or non-empty');

// ---- Pool item (Open Pairs / Semifinals / A shape, judges not all scored yet) ----
const poolItemFpa = {
  key: dynamoPoolKey('48721b44-142a-437d-9d6e-5979dd06435c', 'Open Pairs', 'Semifinals', 'A'),
  isLocked: false,
  judges: {
    'f2cbb2e6-88c0-437c-a22c-62385546f191': 'Variety',
    '4f9222cb-01d1-4ae5-9022-4c8aa897b6e7': 'ExAi',
  },
  teamData: [
    {
      players: ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'],
      teamScore: 0,
      judgeData: {
        'f2cbb2e6-88c0-437c-a22c-62385546f191': { categoryType: 'Variety', rawScores: { general: 5, quantity: 46, quality: 6.5 } },
        // ExAi judge hasn't scored this team yet - the pool isn't finished.
      },
    },
    { players: ['bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002'], teamScore: 0, judgeData: {} },
  ],
};

const layout1 = dynamoPoolToCanonical(poolItemFpa);
check('pool: locked reads false', layout1.locked === false, layout1);
check(
  'pool: order is teamData in source order',
  eq(layout1.order, [
    ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'],
    ['bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002'],
  ]),
  layout1.order
);
check('pool result: incomplete judging -> null (never guesses a place mid-scoring)', dynamoPoolResultToCanonical(poolItemFpa) === null, dynamoPoolResultToCanonical(poolItemFpa));
check(
  'pool result: every judge scored every team but NOT locked -> still null (a real bug this caught: an imported event with places already filled in but never actually locked must not sync)',
  dynamoPoolResultToCanonical({
    ...poolItemFpa,
    isLocked: false,
    teamData: [
      { players: poolItemFpa.teamData[0].players, teamScore: 82.5, judgeData: { 'f2cbb2e6-88c0-437c-a22c-62385546f191': {}, '4f9222cb-01d1-4ae5-9022-4c8aa897b6e7': {} } },
      { players: poolItemFpa.teamData[1].players, teamScore: 91.25, judgeData: { 'f2cbb2e6-88c0-437c-a22c-62385546f191': {}, '4f9222cb-01d1-4ae5-9022-4c8aa897b6e7': {} } },
    ],
  }) === null,
  'expected null (not locked) but got a result'
);

// ---- Same pool, now every judge has scored every team ----
const poolItemFinished = {
  ...poolItemFpa,
  isLocked: true,
  teamData: [
    {
      players: poolItemFpa.teamData[0].players,
      teamScore: 82.5,
      judgeData: { 'f2cbb2e6-88c0-437c-a22c-62385546f191': {}, '4f9222cb-01d1-4ae5-9022-4c8aa897b6e7': {} },
    },
    {
      players: poolItemFpa.teamData[1].players,
      teamScore: 91.25,
      judgeData: { 'f2cbb2e6-88c0-437c-a22c-62385546f191': {}, '4f9222cb-01d1-4ae5-9022-4c8aa897b6e7': {} },
    },
  ],
};
check('pool: locked reads true once finished', dynamoPoolToCanonical(poolItemFinished).locked === true, poolItemFinished);
const result = dynamoPoolResultToCanonical(poolItemFinished);
const teamAKey = [...poolItemFpa.teamData[0].players].sort().join('|');
const teamBKey = [...poolItemFpa.teamData[1].players].sort().join('|');
check('pool result: higher teamScore -> place 1', eq(result[teamBKey], { score: 91.25, place: 1 }), result);
check('pool result: lower teamScore -> place 2', eq(result[teamAKey], { score: 82.5, place: 2 }), result);

// ---- Ties share a place, and the next distinct score skips ahead (1, 2, 2, 4) ----
const teamC = ['cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002'];
const teamD = ['dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002'];
const fourTeamPool = {
  judges: poolItemFpa.judges,
  isLocked: true,
  teamData: [
    { players: poolItemFpa.teamData[0].players, teamScore: 82.5, judgeData: poolItemFinished.teamData[0].judgeData },
    { players: poolItemFpa.teamData[1].players, teamScore: 91.25, judgeData: poolItemFinished.teamData[0].judgeData },
    { players: teamC, teamScore: 91.25, judgeData: poolItemFinished.teamData[0].judgeData },
    { players: teamD, teamScore: 70, judgeData: poolItemFinished.teamData[0].judgeData },
  ],
};
const tieResult = dynamoPoolResultToCanonical(fourTeamPool);
check('ties: both 91.25s take place 1', eq(tieResult[teamBKey], { score: 91.25, place: 1 }) && eq(tieResult[[...teamC].sort().join('|')], { score: 91.25, place: 1 }), tieResult);
check('ties: next distinct score skips to place 3', eq(tieResult[teamAKey], { score: 82.5, place: 3 }), tieResult);
check('ties: last place accounts for the tie above it', eq(tieResult[[...teamD].sort().join('|')], { score: 70, place: 4 }), tieResult);

// ---- diff3: a missing ancestor falls back to "empty", not "assume both sides changed" ----
// This is the exact case an event that only exists in Postgres hits on its very first run:
// Dynamo has nothing (reads as '' for a name), Postgres has a real value. That must be a
// clean "push to Dynamo", never a conflict - there was nothing on the Dynamo side to disagree
// with.
check(
  'diff3: postgres-only event name -> push to Dynamo, not a conflict',
  eq(diff3(undefined, '', '123 Four Seasons Hat Berlin - Summer 2026', ''), { action: 'to-dynamo', value: '123 Four Seasons Hat Berlin - Summer 2026' }),
  diff3(undefined, '', '123 Four Seasons Hat Berlin - Summer 2026', '')
);
check(
  'diff3: dynamo-only pool layout -> push to Postgres, not a conflict',
  eq(diff3(undefined, { locked: false, order: [['p1']] }, { locked: false, order: [] }, { locked: false, order: [] }), {
    action: 'to-postgres',
    value: { locked: false, order: [['p1']] },
  }),
  'wrong direction or false conflict'
);
check(
  'diff3: both sides empty -> noop',
  eq(diff3(undefined, '', '', ''), { action: 'noop', value: '' }),
  diff3(undefined, '', '', '')
);
check(
  'diff3: two sides already independently diverged with no known ancestor -> conflict',
  diff3(undefined, 'Dynamo Name', 'Postgres Name', '').action === 'conflict',
  diff3(undefined, 'Dynamo Name', 'Postgres Name', '')
);
check(
  'diff3: with a known ancestor, only one side moving is still a clean direction',
  eq(diff3('Old Name', 'Old Name', 'New Name', ''), { action: 'to-dynamo', value: 'New Name' }),
  diff3('Old Name', 'Old Name', 'New Name', '')
);

// ---- Round-trip: a new layout preserves judges/scores, only reorders teamData ----
const rebuilt = applyCanonicalToDynamoPool(poolItemFinished, poolItemFinished.key, {
  locked: false,
  order: [poolItemFpa.teamData[1].players, poolItemFpa.teamData[0].players], // swapped
});
check('rebuilt: key preserved', rebuilt.key === poolItemFinished.key, rebuilt.key);
check('rebuilt: isLocked updated to the new value', rebuilt.isLocked === false, rebuilt);
check('rebuilt: judges map untouched', eq(rebuilt.judges, poolItemFinished.judges), rebuilt.judges);
check(
  'rebuilt: teamData reordered but each team keeps its own teamScore/judgeData',
  eq(
    rebuilt.teamData.map((t) => ({ players: t.players, teamScore: t.teamScore })),
    [
      { players: poolItemFpa.teamData[1].players, teamScore: 91.25 },
      { players: poolItemFpa.teamData[0].players, teamScore: 82.5 },
    ]
  ),
  rebuilt.teamData
);

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
