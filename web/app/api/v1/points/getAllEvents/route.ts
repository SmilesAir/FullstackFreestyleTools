import { preflight, publicGet } from '@/lib/points-api';
import { getAllEventsBody } from '@/lib/points-snapshots';

// { allEventSummaryData: { [id]: { eventName, startDate, endDate } } }
export const OPTIONS = preflight;
export const GET = publicGet('points', () => getAllEventsBody());
