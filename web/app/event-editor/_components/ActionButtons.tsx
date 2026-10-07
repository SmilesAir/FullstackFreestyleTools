'use client';

// Opens in a new tab without taking focus away from the Event Editor: the
// browser's own target="_blank" switches focus to the new tab, so this pulls
// it straight back (window.focus() needs to run from the click's own event
// handler to be allowed - a deferred call still counts, a later one wouldn't).
function openInBackground() {
  setTimeout(() => window.focus(), 0);
}

export function ActionButtons({ eventId }: { eventId: string }) {
  const btn = 'rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50';
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/events?event=${eventId}`} target="_blank" rel="noopener noreferrer" onClick={openInBackground} className={btn}>
        Open Event Creator
      </a>
      <a href={`/head-judge?event=${eventId}`} target="_blank" rel="noopener noreferrer" onClick={openInBackground} className={btn}>
        Open Head Judge
      </a>
      <a href={`/results-parser?event=${eventId}`} target="_blank" rel="noopener noreferrer" onClick={openInBackground} className={btn}>
        Open Results Parser
      </a>
    </div>
  );
}
