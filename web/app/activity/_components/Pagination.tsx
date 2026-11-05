import Link from 'next/link';
import { getT } from '@/lib/i18n/server';

export async function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const t = await getT();
  const link = 'rounded border border-gray-300 px-3 py-1 hover:bg-gray-50';
  const disabled = 'rounded border border-gray-200 px-3 py-1 text-gray-300';

  return (
    <nav className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link href={`/activity?page=${page - 1}`} className={link}>
          {t.activity.newer}
        </Link>
      ) : (
        <span className={disabled}>{t.activity.newer}</span>
      )}
      <span className="text-gray-600">
        {t.activity.page(page, pageCount)}
      </span>
      {page < pageCount ? (
        <Link href={`/activity?page=${page + 1}`} className={link}>
          {t.activity.older}
        </Link>
      ) : (
        <span className={disabled}>{t.activity.older}</span>
      )}
    </nav>
  );
}
