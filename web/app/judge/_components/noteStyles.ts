// The colour of each note, by note type (Execution's and Artistic Impression's):
// strong for its button, pale for its "−" button. Also used by the head judge's
// Settings and Results so they match the Play tab. Artistic Impression's colours
// go by area: blues for Teamwork, violets for Music, and red / green for Form's
// Bad / Good.
export const NOTE_STYLE: Record<string, string> = {
  large_error: 'bg-red-700 text-white',
  medium_error: 'bg-orange-600 text-white',
  minor_error: 'bg-amber-400 text-black',
  average_completion: 'bg-slate-500 text-white',
  clean_completion: 'bg-green-600 text-white',
  teamwork_minor: 'bg-sky-300 text-black',
  teamwork_decent: 'bg-sky-500 text-white',
  teamwork_great: 'bg-blue-700 text-white',
  music_decent: 'bg-violet-400 text-black',
  music_great: 'bg-purple-700 text-white',
  form_bad: 'bg-red-600 text-white',
  form_good: 'bg-green-600 text-white',
  // Difficulty's ratings of a move.
  bad: 'bg-red-600 text-white',
  average: 'bg-slate-500 text-white',
  good: 'bg-green-600 text-white',
};

// The same colours as the buttons, for the dots on the graph.
export const NOTE_COLOR: Record<string, string> = {
  large_error: '#b91c1c',
  medium_error: '#ea580c',
  minor_error: '#fbbf24',
  average_completion: '#64748b',
  clean_completion: '#16a34a',
  teamwork_minor: '#7dd3fc',
  teamwork_decent: '#0ea5e9',
  teamwork_great: '#1d4ed8',
  music_decent: '#a78bfa',
  music_great: '#7e22ce',
  form_bad: '#dc2626',
  form_good: '#16a34a',
  bad: '#dc2626',
  average: '#64748b',
  good: '#16a34a',
};

// Dot size on the graph relative to what the note's weight gives (1 if not listed).
export const NOTE_DOT_SCALE: Record<string, number> = {
  minor_error: 0.77,
  average_completion: 0.77,
};

export const NOTE_TINT: Record<string, string> = {
  large_error: 'bg-red-200 text-red-900',
  medium_error: 'bg-orange-200 text-orange-900',
  minor_error: 'bg-amber-200 text-amber-900',
  average_completion: 'bg-slate-300 text-slate-800',
  clean_completion: 'bg-green-200 text-green-900',
  teamwork_minor: 'bg-sky-100 text-sky-900',
  teamwork_decent: 'bg-sky-200 text-sky-900',
  teamwork_great: 'bg-blue-200 text-blue-900',
  music_decent: 'bg-violet-100 text-violet-900',
  music_great: 'bg-purple-200 text-purple-900',
  form_bad: 'bg-red-200 text-red-900',
  form_good: 'bg-green-200 text-green-900',
  bad: 'bg-red-200 text-red-900',
  average: 'bg-slate-300 text-slate-800',
  good: 'bg-green-200 text-green-900',
};

// The colour of each judge category's averaged line, drawn under the judge's own
// graph (muted on the graph).
export const OTHER_COLOR: Record<string, string> = {
  Ex: '#0d9488',
  AI: '#ea580c',
  Diff: '#7c3aed',
};

export const OTHER_LABEL: Record<string, string> = {
  Ex: 'Execution',
  AI: 'Artistic Impression',
  Diff: 'Difficulty',
};
