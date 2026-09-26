import { notFound, preflight, publicGet } from '@/lib/points-api';
import { getSnapshotBody } from '@/lib/points-snapshots';

// One published snapshot, by the key the manifest lists: { data: [...] }
const KEY = /^[a-z]+-[a-z]+_\d{4}-\d{1,2}-\d{1,2}$/;

export const OPTIONS = preflight;
export const GET = publicGet<{ key: string }>('points', async (_request, { key }) => {
  const wanted = decodeURIComponent(key);
  if (!KEY.test(wanted)) return notFound('No such data.');
  return (await getSnapshotBody(wanted)) ?? notFound('No such data.');
});
