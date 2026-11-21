// Copies the old FPA Judging System's front end (one index.html and one bundle.js, from
// its CloudFront distribution) into public/old/, patched to run at /old instead of `/`.
// It still calls its own APIs on AWS; only the page itself is served from this app.
//
// The old app is a React Router app with no basename (routes /, /quick, /creator, /admin,
// /viewer) and builds its permalinks from the site root, so the minified bundle is patched
// by plain string replacement. Every patch must match exactly once or nothing is written:
// if the old app is ever redeployed and the code moved, fix the patterns here.
// next.config.ts sends /old and /old/<anything> to public/old/index.html.
//   node scripts/fetch-legacy-site.mjs              fetch from the production distribution
//   node scripts/fetch-legacy-site.mjs <origin>     fetch from another address
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, '..', 'public', 'old');
const origin = (process.argv[2] || 'https://dgtjhs1oj3tvk.cloudfront.net').replace(/\/+$/, '');

const BUNDLE_PATCHES = [
  {
    // S is the bundle's BrowserRouter (S=w.BrowserRouter), wrapping the nav and routes.
    what: 'router basename',
    from: 'createElement(S,null,p.createElement("nav",null,r)',
    to: 'createElement(S,{basename:"/old"},p.createElement("nav",null,r)',
  },
  {
    what: 'permalinks point at /old',
    from: 'new URL(window.location.origin)',
    to: 'new URL(window.location.origin+"/old")',
  },
  {
    what: '"new Admin Wizard" link',
    from: '"https://freestylejudge.com/?startup=adminTools"',
    to: '"/old?startup=adminTools"',
  },
];

// Relative paths would resolve against `/` at the address /old (no trailing slash).
const HTML_PATCHES = [
  { what: 'script path', from: 'src="bundle.js"', to: 'src="/old/bundle.js"' },
  { what: 'icon path', from: 'href="favicon.ico"', to: 'href="/favicon.ico"' },
];

async function fetchText(file) {
  const res = await fetch(`${origin}/${file}`);
  if (!res.ok) throw new Error(`${origin}/${file}: HTTP ${res.status}`);
  return res.text();
}

function applyPatches(name, text, patches) {
  for (const { what, from, to } of patches) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${name}: "${what}" pattern matched ${count} times (expected 1): ${from}`);
    text = text.replace(from, () => to);
    console.log(`  ${name}: ${what}`);
  }
  return text;
}

console.log(`Fetching from ${origin}`);
const [html, bundle, license] = await Promise.all([
  fetchText('index.html'),
  fetchText('bundle.js'),
  fetchText('bundle.js.LICENSE.txt'),
]);

const files = {
  'index.html': applyPatches('index.html', html, HTML_PATCHES),
  'bundle.js': applyPatches('bundle.js', bundle, BUNDLE_PATCHES),
  'bundle.js.LICENSE.txt': license,
};

await fs.mkdir(OUT_DIR, { recursive: true });
for (const [name, text] of Object.entries(files)) {
  await fs.writeFile(path.join(OUT_DIR, name), text);
  console.log(`Wrote public/old/${name} (${text.length.toLocaleString()} characters)`);
}
