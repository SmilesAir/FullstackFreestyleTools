'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Wraps a section that flashes once (the `pulse-once` style in globals.css) when Profile is
// opened straight after signing in (?welcome=1). Then drops ?welcome from the address, so a
// refresh or going back doesn't flash it again.
export function PulseOnce({ active, id, children }: { active: boolean; id: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (active) router.replace('/profile', { scroll: false });
  }, [active, router]);

  return (
    <div id={id} className={`-m-2 rounded p-2 ${active ? 'pulse-once' : ''}`}>
      {children}
    </div>
  );
}
