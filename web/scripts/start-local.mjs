// Starts the app for a local-server event: reachable from every device on the
// hotspot, and prints the addresses the judges open. Build first (npm run build).
// Run with: npm run start:local   (PORT=3000 by default)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) {
  console.error('There is no build yet. Run: npm run build');
  process.exit(1);
}
if (!process.env.LOCAL_DATABASE_URL) {
  console.warn('Note: LOCAL_DATABASE_URL is not set, so only Neon can be used (see the README).');
}

const port = process.env.PORT || '3000';
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
console.log('\nJudges open one of these on their phones (same hotspot):');
for (const [name, list] of Object.entries(os.networkInterfaces())) {
  for (const item of list ?? []) {
    if (item.family === 'IPv4' && !item.internal && PRIVATE.test(item.address)) {
      console.log(`  http://${item.address}:${port}   (${name})`);
    }
  }
}
console.log(`  http://${os.hostname()}.local:${port}   (by name)`);
console.log('The Head Judge page shows these too, with a QR code.\n');

const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [next, 'start', '-H', '0.0.0.0', '-p', port], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? 'true' },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
