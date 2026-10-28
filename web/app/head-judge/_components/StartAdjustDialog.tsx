"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { OTHER_COLOR, OTHER_LABEL } from "@/app/judge/_components/noteStyles";
import { fetchJson } from "@/lib/fetch-json";
import { mmss, timeTicks } from "@/lib/graph-view";
import type {
  RoutineStartData,
  RoutineStartNote,
} from "@/lib/head-judge-queries";
import { formatElapsed } from "@/lib/head-judge-state";
import {
  JUDGING_CATEGORIES,
  noteCategoryOf,
  noteFullLabel,
} from "@/lib/judging";

const POLL_MS = 2000;
// How far back a start can go (the server refuses older, see MAX_CLICK_AGE).
const MAX_AGE_MS = 10 * 60 * 1000 - 5000;
// Room on the axis before the earliest note or start, and after now.
const LEAD_MS = 10_000;
const TAIL_MS = 2_000;
const SNAP_MS = 100;

const MARGIN = { l: 44, r: 14, t: 26, b: 28 };
const LANE_H = 64;
const UNCOUNTED = "#9ca3af";

// Seconds, with a minus sign before the start.
const signedMmss = (t: number) => (t < 0 ? `-${mmss(-t)}` : mmss(t));

// A dot's radius: bigger for a note worth more, like the score graph's dots.
const dotRadius = (points: number) => 4 + Math.min(5, Math.abs(points) * 0.6);

// Pop-up for when Start was pressed late: every judge's note on the running
// routine as a dot on a timeline (one row per category), and the start as a
// line that can be dragged. Notes left of the line don't count. Apply moves the
// start for every screen; scores already submitted are worked out again.
export function StartAdjustDialog({
  open,
  ...props
}: {
  open: boolean;
  eventId: string;
  clockOffset: number;
  onApply: (routineId: string, startedAt: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      aria-label="Adjust routine start"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] max-w-none rounded-lg border border-gray-300 bg-background p-4 text-foreground backdrop:bg-black/40"
    >
      {/* Only while open, so the line starts at the routine's start each time. */}
      {open && <Body {...props} />}
    </dialog>
  );
}

function Body({
  eventId,
  clockOffset,
  onApply,
  onClose,
}: {
  eventId: string;
  clockOffset: number;
  onApply: (routineId: string, startedAt: number) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<RoutineStartData | null>(null);
  const [failed, setFailed] = useState(false);
  // Where the line is (ms, server clock); null = the routine's start.
  const [proposed, setProposed] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now() + clockOffset);

  // Read the notes now and every couple of seconds: judges' taps from before
  // Start arrive once their screens hear that the routine started.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await fetchJson<RoutineStartData>(
          `/api/head-judge/routine-start?event=${encodeURIComponent(eventId)}`,
        );
        if (!stopped) {
          setData(next);
          setFailed(false);
        }
      } catch {
        if (!stopped) setFailed(true);
      }
      if (!stopped) timer = setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [eventId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() + clockOffset), 500);
    return () => clearInterval(tick);
  }, [clockOffset]);

  // The graph's width follows its box (which only appears once the notes are read).
  const [width, setWidth] = useState(700);
  const observer = useRef<ResizeObserver | null>(null);
  const box = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.current.observe(el);
  }, []);

  const dragging = useRef(false);

  if (failed && !data)
    return (
      <Frame onClose={onClose}>
        Could not read the judges&apos; notes. Trying again…
      </Frame>
    );
  if (!data)
    return <Frame onClose={onClose}>Reading the judges&apos; notes…</Frame>;
  if (data.routineId === null || data.startedAt === null) {
    return (
      <Frame onClose={onClose}>
        No routine is running, so there is no start to move.
      </Frame>
    );
  }
  const routineId = data.routineId;
  const original = data.startedAt;
  const notes = data.notes;

  const earliest = Math.max(now - MAX_AGE_MS, 0);
  const clampStart = (t: number) =>
    Math.min(now, Math.max(earliest, Math.round(t / SNAP_MS) * SNAP_MS));
  const start = proposed ?? original;

  // The axis: from a little before the earliest note (or the start) to now.
  const first = notes.length > 0 ? notes[0].notedAt : original;
  const last = notes.length > 0 ? notes[notes.length - 1].notedAt : original;
  const lo = Math.max(earliest, Math.min(first, original, start) - LEAD_MS);
  const hi = Math.max(now, last) + TAIL_MS;

  const lanes = JUDGING_CATEGORIES.filter((c) =>
    notes.some((n) => n.category === c.type),
  ).map((c) => c.type as string);
  if (lanes.length === 0)
    lanes.push(...JUDGING_CATEGORIES.map((c) => c.type as string));
  const height = MARGIN.t + lanes.length * LANE_H + MARGIN.b;
  const iw = width - MARGIN.l - MARGIN.r;
  const x = (t: number) => MARGIN.l + ((t - lo) / (hi - lo)) * iw;
  const timeAt = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (clientX - rect.left - MARGIN.l) / iw),
    );
    return lo + fraction * (hi - lo);
  };

  // Each note's spot: its category's row, stacked upward where dots would overlap.
  const placed = lanes.flatMap((category, lane) => {
    const levels: number[] = []; // per level, the right edge of its last dot
    const baseline = MARGIN.t + (lane + 1) * LANE_H - 14;
    return notes
      .filter((n) => n.category === category)
      .map((n) => {
        const r = dotRadius(n.points);
        const cx = x(n.notedAt);
        let level = levels.findIndex((right) => right < cx - r);
        if (level === -1) level = levels.length;
        if (level > 3) level = 3;
        levels[level] = cx + r;
        return { note: n, cx, cy: baseline - level * 11, r };
      });
  });

  const counted = (n: RoutineStartNote) => n.notedAt >= start;
  const notCounted = notes.filter((n) => !counted(n)).length;
  const moved = start - original;
  const changed = Math.abs(moved) >= SNAP_MS / 2;
  const ticks = timeTicks({
    start: (lo - start) / 1000,
    end: (hi - start) / 1000,
  });

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setProposed(clampStart(timeAt(e.clientX, e.currentTarget)));
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current)
      setProposed(clampStart(timeAt(e.clientX, e.currentTarget)));
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 1000 : SNAP_MS;
    if (e.key === "ArrowLeft") setProposed(clampStart(start - step));
    else if (e.key === "ArrowRight") setProposed(clampStart(start + step));
    else return;
    e.preventDefault();
  };

  const startX = x(start);
  const originalX = x(original);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold">Adjust routine start</h3>
        <p className="text-sm text-gray-600">
          Drag the green line to the first throw. Notes left of the line
          don&apos;t count. Every judge&apos;s timer moves with it.
        </p>
      </div>

      <div ref={box} className="w-full">
        <svg
          width={width}
          height={height}
          role="slider"
          tabIndex={0}
          aria-label="Routine start"
          aria-valuemin={lo}
          aria-valuemax={now}
          aria-valuenow={start}
          aria-valuetext={`${changed ? `${mmss(Math.abs(moved) / 1000)} ${moved < 0 ? "earlier" : "later"}` : "unchanged"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="cursor-ew-resize touch-none select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {/* Time labels, measured from the line. */}
          {ticks.map((t) => {
            const tx = x(start + t * 1000);
            return (
              <g key={t}>
                <line
                  x1={tx}
                  x2={tx}
                  y1={MARGIN.t}
                  y2={height - MARGIN.b}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <text
                  x={tx}
                  y={height - MARGIN.b + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  opacity={0.6}
                >
                  {signedMmss(t)}
                </text>
              </g>
            );
          })}

          {/* Before the start: shaded, its notes don't count. */}
          <rect
            x={MARGIN.l}
            y={MARGIN.t}
            width={Math.max(0, startX - MARGIN.l)}
            height={lanes.length * LANE_H}
            fill={UNCOUNTED}
            opacity={0.12}
          />

          {/* One row per category. */}
          {lanes.map((category, lane) => {
            const y = MARGIN.t + (lane + 1) * LANE_H - 14;
            return (
              <g key={category}>
                <line
                  x1={MARGIN.l}
                  x2={width - MARGIN.r}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.25}
                />
                <text
                  x={MARGIN.l - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={600}
                  fill={OTHER_COLOR[category]}
                >
                  {category}
                  <title>{OTHER_LABEL[category]}</title>
                </text>
              </g>
            );
          })}

          {/* Now: the routine can't have started later than this. */}
          <line
            x1={x(now)}
            x2={x(now)}
            y1={MARGIN.t}
            y2={height - MARGIN.b}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="2 3"
          />
          <text
            x={x(now)}
            y={MARGIN.t - 8}
            textAnchor="end"
            fontSize={10}
            fill="currentColor"
            opacity={0.6}
          >
            now
          </text>

          {placed.map(({ note, cx, cy, r }) => {
            const ok = counted(note);
            const category = noteCategoryOf(note.category);
            const label = category
              ? noteFullLabel(category, note.noteType)
              : note.noteType;
            const color = ok
              ? (OTHER_COLOR[note.category] ?? "#2563eb")
              : UNCOUNTED;
            return (
              <circle
                key={note.id}
                cx={cx}
                cy={cy}
                r={r}
                fill={note.points < 0 ? "var(--background, white)" : color}
                stroke={color}
                strokeWidth={note.points < 0 ? 2 : 1}
                fillOpacity={ok ? 0.9 : 0.5}
              >
                <title>
                  {`${note.judge} · ${label} · ${signedMmss((note.notedAt - start) / 1000)}${ok ? "" : " (not counted)"}`}
                </title>
              </circle>
            );
          })}

          {/* The routine's start as it was, if the line has moved. */}
          {changed && (
            <line
              x1={originalX}
              x2={originalX}
              y1={MARGIN.t}
              y2={height - MARGIN.b}
              stroke="#16a34a"
              strokeOpacity={0.5}
              strokeDasharray="4 4"
            />
          )}

          {/* The start line and its handle. */}
          <line
            x1={startX}
            x2={startX}
            y1={MARGIN.t - 4}
            y2={height - MARGIN.b}
            stroke="#16a34a"
            strokeWidth={3}
          />
          <rect
            x={startX - 22}
            y={2}
            width={44}
            height={18}
            rx={4}
            fill="#16a34a"
          />
          <text
            x={startX}
            y={15}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill="white"
          >
            Start
          </text>
        </svg>
      </div>

      <p className="text-sm">
        {changed ? (
          <>
            Start moved <strong>{mmss(Math.abs(moved) / 1000)}</strong>{" "}
            {moved < 0 ? "earlier" : "later"} · timer will read{" "}
          </>
        ) : (
          <>Timer reads </>
        )}
        <strong className="font-mono tabular-nums">
          {formatElapsed(Math.max(0, now - start))}
        </strong>
        {" · "}
        {notCounted === 0
          ? "every note counts"
          : `${notCounted} note${notCounted === 1 ? "" : "s"} not counted`}
      </p>
      {data.submitted > 0 && changed && (
        <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {data.submitted} submitted score{data.submitted === 1 ? "" : "s"} will
          be worked out again from the new start.
        </p>
      )}
      {failed && (
        <p className="text-sm text-amber-700">
          Lost the connection, showing the last notes read.
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={notes.length === 0}
            onClick={() =>
              setProposed(clampStart(Math.floor(first / SNAP_MS) * SNAP_MS))
            }
            className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Snap to first note
          </button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => setProposed(null)}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => {
              onApply(routineId, start);
              onClose();
            }}
            className="cursor-pointer rounded bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function Frame({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Adjust routine start</h3>
      <p className="text-sm text-gray-600">{children}</p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
