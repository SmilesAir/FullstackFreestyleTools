import { getT } from '@/lib/i18n/server';

export default async function NoAccessPage() {
  const t = await getT();
  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold">{t.home.noAccessTitle}</h1>
      <p className="text-sm text-gray-500">{t.home.noAccessBody}</p>
    </main>
  );
}
