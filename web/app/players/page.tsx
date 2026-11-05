import { getT } from '@/lib/i18n/server';
export default async function PlayersIndexPage() {
  const t = await getT();
  return (
    <p className="text-sm text-gray-500">
      {t.players.selectPlayer}
    </p>
  );
}
