import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

config({ path: '.env.local' });

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const passwordHash = await bcrypt.hash(password, 12);

await client.query(
  `INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, true)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = true`,
  [email, passwordHash]
);

console.log(`User ${email} created/updated.`);
await client.end();
