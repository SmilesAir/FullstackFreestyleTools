'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Refreshes the page's server data once a useActionState form's submission finishes without
// an error - the same signal PlayerForm.tsx uses, since useActionState has no on-success
// hook of its own: `pending` going true -> false with no error is the only client-visible
// sign a submission just succeeded.
export function useRefreshOnSuccess(error: string | null, pending: boolean) {
  const router = useRouter();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !error) router.refresh();
    wasPending.current = pending;
  }, [pending, error, router]);
}
