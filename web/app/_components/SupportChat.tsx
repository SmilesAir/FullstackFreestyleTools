'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type Position = { x: number; y: number };

// The conversation and whether the box is open, kept for this browser tab so
// moving between Head Judge and the Event Creator keeps the chat going.
const CHAT_KEY = 'support-chat';
// Where the box was dragged to, kept on this device.
const POSITION_KEY = 'support-chat-position';
// What the server takes: the latest questions and answers, starting with a question.
const MAX_SENT = 29;
const MARGIN = 8;

const newId = () => crypto.randomUUID();

function readJson<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the chat just isn't kept.
  }
}

// The tech support chat: a button in the corner that opens a box to ask Claude
// how to use the tools. The box can be dragged by its title bar and stays inside
// the window. Answers stream in as they are written.
export function SupportChat({ page }: { page: 'head-judge' | 'events' }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [loaded, setLoaded] = useState(false);

  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const request = useRef<AbortController | null>(null);

  // Keeps a position inside the window, given the box's size.
  const clamp = useCallback((p: Position): Position => {
    const box = panel.current;
    const width = box?.offsetWidth ?? 384;
    const height = box?.offsetHeight ?? 544;
    return {
      x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
      y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
    };
  }, []);

  // What was kept in this tab and on this device (read after the first render).
  useEffect(() => {
    const read = setTimeout(() => {
      const saved = readJson<{ conversationId: string; messages: Message[]; open: boolean }>(() => sessionStorage, CHAT_KEY);
      if (saved && Array.isArray(saved.messages)) {
        setConversationId(saved.conversationId);
        setMessages(saved.messages);
        setOpen(saved.open);
      } else {
        setConversationId(newId());
      }
      setPosition(readJson<Position>(() => localStorage, POSITION_KEY));
      setLoaded(true);
    }, 0);
    return () => clearTimeout(read);
  }, []);

  useEffect(() => {
    if (loaded && conversationId) writeJson(() => sessionStorage, CHAT_KEY, { conversationId, messages, open });
  }, [loaded, conversationId, messages, open]);

  // Opening: put the box where it was (or the bottom-right corner), inside the window.
  useEffect(() => {
    if (!open) return;
    const place = setTimeout(() => {
      const box = panel.current;
      const fallback = {
        x: window.innerWidth - (box?.offsetWidth ?? 384) - 16,
        y: window.innerHeight - (box?.offsetHeight ?? 544) - 16,
      };
      setPosition((p) => clamp(p ?? fallback));
      textarea.current?.focus();
    }, 0);
    const onResize = () => setPosition((p) => (p ? clamp(p) : p));
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(place);
      window.removeEventListener('resize', onResize);
    };
  }, [open, clamp]);

  // The newest message in view.
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, open]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button') || !position) return;
    drag.current = { dx: e.clientX - position.x, dy: e.clientY - position.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPosition(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  }
  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    if (position) writeJson(() => localStorage, POSITION_KEY, position);
  }

  function newChat() {
    request.current?.abort();
    setMessages([]);
    setError(null);
    setBusy(false);
    setConversationId(newId());
    textarea.current?.focus();
  }

  async function send() {
    const question = input.trim();
    if (!question || busy || !conversationId) return;
    const before = messages;
    const asked: Message[] = [...messages, { role: 'user', content: question }];
    setMessages([...asked, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setBusy(true);

    const controller = new AbortController();
    request.current = controller;
    const showAnswer = (content: string) =>
      setMessages((current) => [...current.slice(0, -1), { role: 'assistant', content }]);
    try {
      const response = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, page, messages: asked.slice(-MAX_SENT) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        // Not asked after all: put the question back to try again.
        setMessages(before);
        setInput(question);
        setError(data?.error ?? 'Something went wrong. Try again.');
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        showAnswer(answer);
      }
      answer += decoder.decode();
      // An empty answer can't be sent back as part of the conversation.
      if (answer.trim()) showAnswer(answer);
      else {
        setMessages(before);
        setInput(question);
        setError('No answer came back. Try again.');
      }
    } catch {
      if (controller.signal.aborted) return;
      setMessages(before);
      setInput(question);
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  if (!loaded) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Tech support"
        title="Tech support"
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 print:hidden"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      </button>
    );
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Tech support chat"
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      style={position ? { left: position.x, top: position.y } : { right: 16, bottom: 16 }}
      className="fixed z-50 flex h-[min(34rem,calc(100dvh-1rem))] w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border border-gray-300 bg-background shadow-2xl print:hidden"
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex cursor-move touch-none select-none items-center gap-2 bg-blue-600 px-3 py-2 text-white"
      >
        <span className="font-semibold">Tech support</span>
        <button
          type="button"
          onClick={newChat}
          disabled={messages.length === 0 && !busy}
          className="ml-auto cursor-pointer rounded px-2 py-0.5 text-xs hover:bg-blue-500 disabled:cursor-default disabled:opacity-50"
        >
          New chat
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="cursor-pointer rounded px-2 text-lg leading-none hover:bg-blue-500"
        >
          ×
        </button>
      </div>

      <div ref={list} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && (
          <p className="text-gray-500">
            Ask how to do something with these tools or how to run your event. For example: &ldquo;How do I publish a
            pool&apos;s results?&rdquo; or &ldquo;A judge&apos;s screen isn&apos;t updating.&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 ${
              m.role === 'user' ? 'self-end bg-blue-600 text-white' : 'self-start bg-gray-100 text-gray-900'
            }`}
          >
            {m.content || (busy && i === messages.length - 1 ? <span className="text-gray-500">Thinking…</span> : null)}
          </div>
        ))}
      </div>

      {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 border-t border-gray-200 px-3 py-2"
      >
        <textarea
          ref={textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Ask a question…"
          className="max-h-32 min-h-10 flex-1 resize-y rounded border border-gray-300 bg-background px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="cursor-pointer rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-default disabled:opacity-50"
        >
          Send
        </button>
      </form>
      <p className="px-3 pb-2 text-[11px] leading-snug text-gray-500">
        Answers are from Claude and can be wrong. Chats are kept 90 days so admins can improve this help.
      </p>
    </div>
  );
}
