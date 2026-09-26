// The visible part of a graph's time axis, in seconds. Zooming and panning
// change the view; the height scale is not part of it.

export type View = { start: number; end: number };

// The closest a graph zooms in (or the whole routine, if that is shorter).
export const MIN_SPAN = 5;

export const fullView = (duration: number): View => ({ start: 0, end: duration });

export const isZoomed = (view: View, duration: number): boolean => view.end - view.start < duration - 1e-6;

const spanLimits = (duration: number) => ({ min: Math.min(MIN_SPAN, duration), max: duration });

// Keeps the span within its limits and the window inside 0..duration.
export function clampView(view: View, duration: number): View {
  const { min, max } = spanLimits(duration);
  const span = Math.min(max, Math.max(min, view.end - view.start));
  const start = Math.min(Math.max(0, view.start), duration - span);
  return { start, end: start + span };
}

// A window `span` seconds wide with `anchor` (a time) at `fraction` of its width.
export function viewAt(anchor: number, fraction: number, span: number, duration: number): View {
  const { min, max } = spanLimits(duration);
  const s = Math.min(max, Math.max(min, span));
  return clampView({ start: anchor - fraction * s, end: anchor - fraction * s + s }, duration);
}

// Zooms in by `factor` (above 1) or out (below 1), keeping the moment `focus`
// where it is on screen.
export function zoomAround(view: View, factor: number, focus: number, duration: number): View {
  const span = view.end - view.start;
  const fraction = span > 0 ? (focus - view.start) / span : 0.5;
  return viewAt(focus, fraction, span / factor, duration);
}

// Moves the window by `delta` seconds (positive = later), keeping its width.
export function panBy(view: View, delta: number, duration: number): View {
  return clampView({ start: view.start + delta, end: view.end + delta }, duration);
}

// A pinch: the fingers started `startDistance` apart with the window
// `startView`, and are now `distance` apart. The moment `anchor` (under the
// fingers' midpoint when they went down) is kept under their midpoint, which is
// now at `fraction` of the graph's width.
export function pinchTo(
  startView: View,
  startDistance: number,
  distance: number,
  anchor: number,
  fraction: number,
  duration: number
): View {
  if (startDistance <= 0 || distance <= 0) return startView;
  return viewAt(anchor, fraction, (startView.end - startView.start) * (startDistance / distance), duration);
}

const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60] as const;

// The times to label: whole multiples of a round step, chosen to give about 5 to 8.
export function timeTicks(view: View): number[] {
  const span = view.end - view.start;
  const step = TIME_STEPS.find((s) => span / s <= 8) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(view.start / step - 1e-9) * step; t <= view.end + 1e-9; t += step) ticks.push(t);
  return ticks;
}
