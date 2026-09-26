import { useCallback, useState } from 'react';

const LIMIT = 200;

type State<T> = { past: T[]; present: T; future: T[] };

// A value with undo and redo. `set` takes the next value or a function of the current one.
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [] });

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(s.present) : next;
      if (value === s.present) return s;
      return { past: [...s.past.slice(-(LIMIT - 1)), s.present], present: value, future: [] };
    });
  }, []);
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);
  const undo = useCallback(
    () => setState((s) => (s.past.length === 0 ? s : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] })),
    []
  );
  const redo = useCallback(
    () => setState((s) => (s.future.length === 0 ? s : { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) })),
    []
  );

  return { present: state.present, set, reset, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
