import type { Ref } from 'react';

// The embedded YouTube or Spotify player of a team's music link. `className`
// replaces the default size; `ref` is the iframe, to talk to the player.
export function MusicEmbed({
  embedUrl,
  kind,
  className,
  ref,
}: {
  embedUrl: string;
  kind: 'youtube' | 'spotify';
  className?: string;
  ref?: Ref<HTMLIFrameElement>;
}) {
  return kind === 'youtube' ? (
    <iframe
      ref={ref}
      src={embedUrl}
      title="YouTube player"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className={`rounded border-0 ${className ?? 'aspect-video w-full'}`}
    />
  ) : (
    <iframe
      ref={ref}
      src={embedUrl}
      title="Spotify player"
      allow="autoplay; clipboard-write; encrypted-media"
      className={`rounded-xl border-0 ${className ?? 'h-20 w-full'}`}
    />
  );
}
