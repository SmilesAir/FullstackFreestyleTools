import { preflight, publicGet } from '@/lib/points-api';
import { getManifestBody } from '@/lib/points-snapshots';

// The published versions: { manifest: { "<type>-<division>_<date>": { key, date, divisionName, createdAt, dataPath, isHidden } } }
export const OPTIONS = preflight;
export const GET = publicGet('points', () => getManifestBody());
