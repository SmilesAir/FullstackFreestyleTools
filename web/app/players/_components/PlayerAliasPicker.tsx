'use client';

import { useState } from 'react';
import { useAliasPicker } from './AliasPickerContext';

export function PlayerAliasPicker({
  initialId,
  initialLabel,
  excludeId,
}: {
  initialId: string | null;
  initialLabel: string | null;
  excludeId?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [label, setLabel] = useState(initialLabel ?? '');
  const { picking, setHighlightedId, startPicking, cancelPicking } = useAliasPicker();

  function onStartPicking() {
    startPicking(excludeId, (id, name) => {
      setSelectedId(id);
      setLabel(name);
    });
  }

  function clear() {
    setSelectedId(null);
    setLabel('');
  }

  return (
    <div>
      <input type="hidden" name="alias_id" value={selectedId ?? ''} />
      <input
        type="text"
        readOnly
        value={label}
        placeholder="No alias set"
        onMouseEnter={() => selectedId && setHighlightedId(selectedId)}
        onMouseLeave={() => setHighlightedId(null)}
        className="w-full cursor-default rounded border border-gray-300 bg-gray-50 px-3 py-2"
      />
      <div className="mt-1 flex gap-3 text-xs">
        {picking ? (
          <button type="button" onClick={cancelPicking} className="text-red-600 underline">
            Cancel Set Alias
          </button>
        ) : (
          <button type="button" onClick={onStartPicking} className="text-blue-600 underline">
            Set Alias
          </button>
        )}
        {!picking && selectedId && (
          <button type="button" onClick={clear} className="text-gray-500 underline">
            Clear alias
          </button>
        )}
      </div>
    </div>
  );
}
