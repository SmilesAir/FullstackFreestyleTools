/* eslint-disable @typescript-eslint/no-require-imports */
// Checks the Claude cost arithmetic and the prompt registry (no database, no API call).
// Run with: node scripts/verify-claude-usage.cjs
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
const { MODEL_PRICES, costUsd, formatUsd } = lib('claude-pricing.ts');
const { CLAUDE_MODEL, CLAUDE_PROMPTS, promptById } = lib('claude-prompts.ts');

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) ++failures;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---- cost ----
check('1,200 in and 800 out on claude-opus-5 is $0.026', near(costUsd('claude-opus-5', 1200, 800), 0.026), costUsd('claude-opus-5', 1200, 800));
check('a million in and a million out is the two prices added', near(costUsd('claude-opus-5', 1e6, 1e6), 30), costUsd('claude-opus-5', 1e6, 1e6));
check('no tokens cost nothing', costUsd('claude-opus-5', 0, 0) === 0, '');
check('a model with a different price uses it', near(costUsd('claude-opus-5-5', 1e6, 1e6), 24), costUsd('claude-opus-5-5', 1e6, 1e6));
check('an unknown model has no cost, not a guess', costUsd('claude-nope', 1000, 1000) === null, '');
check('the model in use has a price', !!MODEL_PRICES[CLAUDE_MODEL], CLAUDE_MODEL);
check('money under a dollar shows four decimals', formatUsd(0.026) === '$0.0260' && formatUsd(0) === '$0.0000', formatUsd(0.026));
check('money over a dollar shows cents', formatUsd(12.4) === '$12.40', formatUsd(12.4));
check('an unknown price says so', formatUsd(null) === 'price unknown', formatUsd(null));

// ---- prompt registry ----
check('three prompts with distinct ids', CLAUDE_PROMPTS.length === 3 && new Set(CLAUDE_PROMPTS.map((p) => p.id)).size === 3, CLAUDE_PROMPTS.map((p) => p.id).join());
check('every prompt has text, a model with a price and sane limits', CLAUDE_PROMPTS.every((p) => p.system.length > 200 && MODEL_PRICES[p.model] && p.maxTokens >= 1000 && p.usedIn && p.outputSummary), '');
check('promptById finds each one', CLAUDE_PROMPTS.every((p) => promptById(p.id) === p), '');
check('promptById refuses an unknown id', (() => { try { promptById('nope'); return false; } catch { return true; } })(), '');
check('the results prompt names the real divisions and rounds', /Open Pairs, Mixed Pairs, Open Co-op, Women Pairs/.test(promptById('results').system) && /Finals, Semifinals/.test(promptById('results').system), '');
check('no prompt has an unresolved ${} left in it', CLAUDE_PROMPTS.every((p) => !p.system.includes('${')), '');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
