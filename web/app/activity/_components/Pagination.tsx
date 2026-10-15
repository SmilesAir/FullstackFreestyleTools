import Link from 'next/link';

export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const link = 'rounded border border-gray-300 px-3 py-1 hover:bg-gray-50';
  const disabled = 'rounded border border-gray-200 px-3 py-1 text-gray-300';

  return (
    <nav className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link href={`/activity?page=${page - 1}`} className={link}>
          ← Newer
        </Link>
      ) : (
        <span className={disabled}>← Newer</span>
      )}
      <span className="text-gray-600">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={`/activity?page=${page + 1}`} className={link}>
          Older →
        </Link>
      ) : (
        <span className={disabled}>Older →</span>
      )}
    </nav>
  );
}
