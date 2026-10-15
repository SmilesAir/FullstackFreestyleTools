'use client';

import { useRef, useState } from 'react';
import { PRESET_TIMECALLS, parseTimecall, timecallLabel } from '@/lib/head-judge';

const ON = 'border-green-600 bg-green-600 text-white hover:bg-green-700';
const OFF = 'border-gray-300 bg-background text-gray-700 hover:bg-gray-50';

// The playing team's time calls: the presets toggle on and off, any other
// value shows only while it is on (turning it off removes it), and Custom adds
// one. Then the mute button for the callouts, when there is one to show.
export function TimecallControls({
  timecalls,
  routineSeconds,
  disabled,
  muted,
  onChange,
  onToggleMute,
  align = 'end',
}: {
  // Seconds left when each call is made (0 = "Time").
  timecalls: number[];
  routineSeconds: number;
  // No team is up or the pool is locked.
  disabled: boolean;
  onChange: (timecalls: number[]) => void;
  // Left out where nothing is called out (a player setting their own).
  muted?: boolean;
  onToggleMute?: () => void;
  // Right-aligned beside the timer, with its own "Time calls" caption; 'start'
  // sits under a heading of the caller's.
  align?: 'start' | 'end';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const on = new Set(timecalls);
  const buttons = [...new Set([...PRESET_TIMECALLS, ...timecalls])].sort((a, b) => a - b);
  const toggle = (seconds: number) =>
    onChange(on.has(seconds) ? timecalls.filter((s) => s !== seconds) : [...timecalls, seconds]);

  const openCustom = () => {
    setText('');
    setProblem(null);
    dialog.current?.showModal();
  };
  const addCustom = () => {
    const seconds = parseTimecall(text);
    if (seconds === null || seconds <= 0) return setProblem('Enter seconds (45) or minutes:seconds (1:30).');
    if (seconds >= routineSeconds) return setProblem('It has to be shorter than the routine.');
    if (!on.has(seconds)) onChange([...timecalls, seconds]);
    dialog.current?.close();
  };

  return (
    <div className={`flex flex-col gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <div className={`flex flex-wrap items-center gap-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
        {buttons.map((seconds) => (
          <button
            key={seconds}
            type="button"
            onClick={() => toggle(seconds)}
            disabled={disabled}
            aria-pressed={on.has(seconds)}
            className={`cursor-pointer rounded border px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
              on.has(seconds) ? ON : OFF
            }`}
          >
            {timecallLabel(seconds)}
          </button>
        ))}
        <button
          type="button"
          onClick={openCustom}
          disabled={disabled}
          className={`cursor-pointer rounded border px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${OFF}`}
        >
          Custom…
        </button>
        {onToggleMute && (
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            title={muted ? 'Callouts muted: click to hear them' : 'Callouts on: click to mute'}
            className={`cursor-pointer rounded border px-3 py-1.5 text-sm font-semibold ${
              muted ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100' : OFF
            }`}
          >
            {muted ? '🔇 Muted' : '🔊 Sound on'}
          </button>
        )}
      </div>
      {align === 'end' && <div className="text-xs text-gray-500">Time calls</div>}

      <dialog
        ref={dialog}
        className="m-auto w-80 rounded-lg border border-gray-300 bg-background p-4 text-foreground backdrop:bg-black/40"
      >
        <form
          method="dialog"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <h3 className="text-lg font-semibold">Custom time call</h3>
          <label className="flex flex-col gap-1 text-sm">
            Time left when it is called
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="1:00 or 45"
              inputMode="numeric"
              className="rounded border border-gray-300 bg-background px-3 py-2 text-base"
            />
          </label>
          {problem && <p className="text-sm text-red-700">{problem}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              Add
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
