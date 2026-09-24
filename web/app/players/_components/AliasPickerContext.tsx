'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type OnPick = (id: string, name: string) => void;

type AliasPickerContextValue = {
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;
  picking: boolean;
  excludeId?: string;
  startPicking: (excludeId: string | undefined, onPick: OnPick) => void;
  cancelPicking: () => void;
  pickPlayer: (id: string, name: string) => void;
  refreshKey: number;
  triggerRefresh: () => void;
};

const AliasPickerContext = createContext<AliasPickerContextValue | null>(null);

export function AliasPickerProvider({ children }: { children: React.ReactNode }) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [excludeId, setExcludeId] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const onPickRef = useRef<OnPick | null>(null);

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const startPicking = useCallback((exclude: string | undefined, onPick: OnPick) => {
    onPickRef.current = onPick;
    setExcludeId(exclude);
    setPicking(true);
  }, []);

  const cancelPicking = useCallback(() => {
    onPickRef.current = null;
    setPicking(false);
  }, []);

  const pickPlayer = useCallback((id: string, name: string) => {
    onPickRef.current?.(id, name);
    onPickRef.current = null;
    setPicking(false);
  }, []);

  return (
    <AliasPickerContext.Provider
      value={{
        highlightedId,
        setHighlightedId,
        picking,
        excludeId,
        startPicking,
        cancelPicking,
        pickPlayer,
        refreshKey,
        triggerRefresh,
      }}
    >
      {children}
    </AliasPickerContext.Provider>
  );
}

export function useAliasPicker() {
  const ctx = useContext(AliasPickerContext);
  if (!ctx) throw new Error('useAliasPicker must be used within AliasPickerProvider');
  return ctx;
}
