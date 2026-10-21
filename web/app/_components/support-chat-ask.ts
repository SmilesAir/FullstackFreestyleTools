'use client';

import { useSyncExternalStore } from 'react';

// Lets another part of the page put a question in the support chat (opening
// it), such as the Head Judge's Explain these results button. The chat
// registers itself while it is on the page; with no chat there is nothing to
// ask, so the button hides.

let ask: ((text: string) => void) | null = null;
const listeners = new Set<() => void>();

// Called by the chat: `handler` opens it with `text` in the box, ready to send.
export function registerSupportChat(handler: (text: string) => void): () => void {
  ask = handler;
  listeners.forEach((l) => l());
  return () => {
    if (ask === handler) ask = null;
    listeners.forEach((l) => l());
  };
}

export function askSupportChat(text: string) {
  ask?.(text);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Whether there is a chat on the page to ask.
export function useSupportChatAvailable(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ask !== null,
    () => false
  );
}
