import { preflight, publicGet } from '@/lib/points-api';
import { getAllResultsBody } from '@/lib/points-snapshots';

// The event and division behind each result the rankings refer to: { results: { [id]: { eventName, divisionName, ... } } }
export const OPTIONS = preflight;
export const GET = publicGet('points', () => getAllResultsBody());
