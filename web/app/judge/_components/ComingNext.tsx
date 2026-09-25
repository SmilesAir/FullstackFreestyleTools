import { Tabs } from '@/app/_components/Tabs';
import { judgePath, type JudgingCategory } from '@/lib/judging';

// The Play and Review tabs of a judging screen that isn't built yet.
export function ComingNext({
  category,
  eventId,
  playerId,
  tab,
}: {
  category: JudgingCategory;
  eventId: string;
  playerId: string;
  tab: string | undefined;
}) {
  const base = judgePath(category, eventId, playerId);
  const message = (what: string) => (
    <p className="mx-auto max-w-xl text-sm text-gray-500">
      The {category.label} {what} is coming next.
    </p>
  );
  return (
    <Tabs
      initialActive={tab === 'review' ? 'review' : 'play'}
      tabs={[
        { id: 'play', label: 'Play', href: `${base}?tab=play`, content: message('play screen') },
        { id: 'review', label: 'Review', href: `${base}?tab=review`, content: message('review screen') },
      ]}
    />
  );
}
