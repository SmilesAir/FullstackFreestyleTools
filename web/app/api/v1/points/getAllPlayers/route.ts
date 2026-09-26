import { preflight, publicGet } from '@/lib/points-api';
import { getAllPlayersBody } from '@/lib/points-snapshots';

// The players in the published rankings and ratings: { players: { [id]: { firstName, lastName } } }
export const OPTIONS = preflight;
export const GET = publicGet('points', () => getAllPlayersBody());
