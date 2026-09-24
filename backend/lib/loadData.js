import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', '..', 'Planning', 'AllFrisbeeData-2026-8-12.json');

export function loadData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  const playerIds = new Set(Object.keys(data.playersData));
  const eventIds = new Set(Object.keys(data.eventsData));
  const resultIds = new Set(Object.keys(data.resultsData));

  return { data, playerIds, eventIds, resultIds };
}
