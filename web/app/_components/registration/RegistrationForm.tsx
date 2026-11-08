'use client';

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatDay, formatDayRange, formatDateTime } from '@/lib/i18n/format';
import {
  applyInvites,
  askedDivisions,
  lookingKey,
  eventDays,
  teammateSlots,
  teammatesKey,
  isFormTab,
  type Answers,
  type AnswerValue,
  type FormTab,
  type PublicForm,
  type Question,
  type RosterDivision,
} from '@/lib/registration';
import type { PlayerOption } from '@/lib/registration-queries';
import { canDonate, hasPayment } from '@/lib/registration-payment';
import { PayView } from './PayView';
import { DonateView } from './DonateView';
import {
  choosePackage,
  collectHandoff,
  loadMyRegistration,
  loadRoster,
  searchTeammates,
  submitRegistration,
  withdrawRegistration,
  type MyRegistrationState,
} from '@/lib/registration-actions';

// What the embed tells the page around it: its height, so the embed code can size
// the iframe to fit (see the Event Registration tool's Embed tab).
export const HEIGHT_MESSAGE = 'fft-registration-height';
// What the page around the embed can send it: a tab to show ({type, formId, tab}), so a
// Donate button on the tournament's site can open the Donate tab.
export const TAB_MESSAGE = 'fft-registration-tab';
const tokenKey = (formId: string) => `registration-token-${formId}`;
const POLL_MS = 2000;
const POLL_FOR_MS = 10 * 60 * 1000;

type Mode = 'embed' | 'page' | 'preview';

// Whether the page is inside a frame (another site's iframe). Never changes, so nothing to
// subscribe to; false while rendering on the server.
const noSubscribe = () => () => {};
const inFrame = () => window.self !== window.top;

// The player's registration form.
// - embed: in an iframe on a tournament's site; signs in through a window of this
//   site (see registration-queries.ts)
// - page: this site's /register/<form> page, signed in by cookie
// - preview: the staff tool's live preview, shown as if signed in; never sent
// Tabs: Register; Pay when the form has packages or ways to pay (opened after
// registering); Donate when it takes donations (anyone, signed in or not); Players &
// teams with a roster (not in the preview).


export function RegistrationForm({
  form,
  initial,
  mode,
  roster: initialRoster,
  initialTab = 'register',
}: {
  form: PublicForm;
  initial: MyRegistrationState;
  mode: Mode;
  roster?: RosterDivision[];
  initialTab?: FormTab;
}) {
  const t = useT();
  const tr = t.eventRegistration;
  const locale = useLocale();
  const [state, setState] = useState(initial);
  const [token, setToken] = useState<string | null>(null);
  const [editing, setEditing] = useState(!initial.registration);
  // The answers to edit: as saved, plus the divisions and teammates of anyone who named
  // this player as their teammate (applyInvites).
  const [answers, setAnswers] = useState<Answers>(() => applyInvites(form, initial.registration?.answers ?? {}, initial.invites).answers);
  const [names, setNames] = useState<Record<string, string>>(initial.names);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Inside a frame the sign-in cookie isn't sent, so signing in goes through a window of
  // this site and a token (see registration-queries.ts): always in the embed, and on
  // /register/<form> when someone has put that page in an iframe.
  const framed = useSyncExternalStore(noSubscribe, inFrame, () => false);
  const popupSignIn = mode === 'embed' || (mode === 'page' && framed);
  const [chosenTab, setTab] = useState<FormTab>(initialTab);
  const [roster, setRoster] = useState(initialRoster ?? null);
  const payable = hasPayment(form.payment);
  const donatable = canDonate(form.payment);
  const tabs: FormTab[] = [
    'register',
    ...(payable ? (['pay'] as const) : []),
    ...(donatable ? (['donate'] as const) : []),
    ...(roster ? (['players'] as const) : []),
  ];
  // A tab the form doesn't have (?tab=donate with donations off) shows Register.
  const tab = tabs.includes(chosenTab) ? chosenTab : 'register';
  // The package picked in the Pay tab: the registration's, else one picked here (before
  // registering, or in the preview), else the only one there is.
  const [pickedPackage, setPickedPackage] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const refreshRoster = useCallback(() => {
    if (initialRoster) loadRoster(form.id).then(setRoster).catch(() => {});
  }, [form.id, initialRoster]);

  // Starts over from a registration as saved (or none).
  const showState = useCallback((next: MyRegistrationState) => {
    setState(next);
    setEditing(!next.registration);
    setAnswers(applyInvites(form, next.registration?.answers ?? {}, next.invites).answers);
    setNames((n) => ({ ...n, ...next.names }));
    setMissing([]);
  }, [form]);

  const acceptToken = useCallback(
    (tok: string) => {
      startTransition(async () => {
        // Tried twice: a browser can cancel a request as the sign-in window closes.
        const next = await loadMyRegistration(form.id, tok).catch(
          () => new Promise<MyRegistrationState>((resolve, reject) => setTimeout(() => loadMyRegistration(form.id, tok).then(resolve, reject), 1000))
        );
        try {
          if (next.signedIn) sessionStorage.setItem(tokenKey(form.id), tok);
          else sessionStorage.removeItem(tokenKey(form.id));
        } catch {}
        if (!next.signedIn) return;
        setToken(tok);
        showState(next);
      });
    },
    [form.id, showState]
  );

  // A token kept from earlier in this tab (the iframe's own storage).
  useEffect(() => {
    if (!popupSignIn || initial.signedIn) return;
    let kept: string | null = null;
    try {
      kept = sessionStorage.getItem(tokenKey(form.id));
    } catch {}
    if (kept) acceptToken(kept);
  }, [popupSignIn, initial.signedIn, form.id, acceptToken]);

  // After opening the sign-in window: ask every 2 seconds, for 10 minutes, whether
  // the player has signed in and pressed Continue there.
  useEffect(() => {
    if (!waitingFor) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const tick = async () => {
      const tok = await collectHandoff(form.id, waitingFor).catch(() => null);
      if (stopped) return;
      if (tok) {
        setWaitingFor(null);
        acceptToken(tok);
      } else if (Date.now() - started < POLL_FOR_MS) timer = setTimeout(tick, POLL_MS);
      else setWaitingFor(null);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waitingFor, form.id, acceptToken]);

  // Keeps the page around the embed told how tall the form is.
  useEffect(() => {
    if (!popupSignIn || window.parent === window) return;
    const send = () =>
      window.parent.postMessage({ type: HEIGHT_MESSAGE, formId: form.id, height: document.documentElement.scrollHeight }, '*');
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    send();
    return () => observer.disconnect();
  }, [popupSignIn, form.id]);

  // The page around the embed asking for a tab (its Donate button, a #donate link).
  useEffect(() => {
    if (!popupSignIn || window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !e.data || e.data.type !== TAB_MESSAGE || e.data.formId !== form.id) return;
      if (isFormTab(e.data.tab)) {
        setTab(e.data.tab);
        if (e.data.tab === 'players') refreshRoster();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [popupSignIn, form.id, refreshRoster]);

  const openSignIn = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const url = `/register/${form.id}/connect?n=${code}`;
    // With pop-ups blocked it opens as a tab instead; the embed collects the sign-in either way.
    if (!window.open(url, 'fft-registration-signin', 'width=480,height=720')) window.open(url, '_blank');
    setWaitingFor(code);
  };

  const setAnswer = (id: string, value: AnswerValue) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setMissing((m) => m.filter((x) => x !== id));
  };
  const pickPlayer = (p: PlayerOption) => setNames((n) => ({ ...n, [p.id]: p.name }));
  const search = useCallback((q: string) => searchTeammates(form.id, token, q), [form.id, token]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'preview') return;
    setError(null);
    startTransition(async () => {
      const result = await submitRegistration(form.id, token, answers, locale);
      setMissing(result.missing ?? []);
      if (result.error) return setError(result.error);
      // Registering (not changing answers) goes on to paying.
      if (!state.registration && payable && result.registration) setTab('pay');
      showState({ ...state, registration: result.registration ?? null });
      refreshRoster();
    });
  };

  const pickPackage = (packageId: string) => {
    setPickedPackage(packageId);
    setPayError(null);
    if (mode === 'preview' || !state.registration) return;
    startTransition(async () => {
      const result = await choosePackage(form.id, token, packageId, locale);
      if (result.error) setPayError(result.error);
      if (result.registration !== undefined) setState((s) => ({ ...s, registration: result.registration ?? null }));
    });
  };

  const withdraw = () => {
    setError(null);
    startTransition(async () => {
      const result = await withdrawRegistration(form.id, token, locale);
      if (result.error) return setError(result.error);
      showState({ ...state, registration: null });
      refreshRoster();
    });
  };

  const style = form.style;
  const theme =
    style.theme === 'dark'
      ? 'bg-neutral-900 text-neutral-100 [--line:#525252] [--muted:#a3a3a3] [--field:#171717]'
      : 'bg-white text-neutral-900 [--line:#d4d4d4] [--muted:#737373] [--field:#ffffff]';
  const button =
    'inline-block cursor-pointer rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:cursor-default disabled:opacity-60';
  const quiet = 'cursor-pointer rounded border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60';
  const registration = state.registration;
  const packages = form.payment.packages;
  const known = (id: string | null | undefined) => (id && packages.some((p) => p.id === id) ? id : null);
  const selectedPackage =
    (registration?.paid ? known(registration.packageId) : null) ??
    known(pickedPackage) ??
    known(registration?.packageId) ??
    (packages.length === 1 ? packages[0].id : null);
  // Players register as the player linked to their account (Profile), so an account
  // with none is asked to link one first.
  const hasPlayer = !!state.registrant?.playerId;
  const showForm = state.signedIn && hasPlayer && editing && form.isOpen;
  // Invites that add something to the saved registration (or to a new one).
  const invitesAdding = applyInvites(form, registration?.answers ?? {}, state.invites).applied;
  const divisionName = (id: string) => form.divisions.find((d) => d.id === id)?.name ?? '';
  const inviteNotes = invitesAdding.map((i) => (
    <li key={`${i.divisionId}-${i.fromName}`}>
      {tr.invitedBy(i.fromName, divisionName(i.divisionId), i.playerIds.map((id) => names[id] ?? '?').join(', '))}
    </li>
  ));

  const checkAgain = () =>
    startTransition(async () => {
      const next = await loadMyRegistration(form.id, token);
      if (next.signedIn) showState(next);
    });

  return (
    <div className={`flex flex-col gap-4 rounded-lg p-4 sm:p-6 ${theme}`} style={{ ['--accent' as string]: style.accent }}>
      {(style.showEventInfo || form.title) && (
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">{form.title || form.eventName}</h1>
          {style.showEventInfo && (
            <p className="text-sm text-[var(--muted)]">
              {form.title && `${form.eventName} · `}
              {formatDayRange(locale, form.startDate, form.endDate)}
            </p>
          )}
        </header>
      )}
      {form.intro && <p className="whitespace-pre-line text-sm">{form.intro}</p>}

      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 border-b border-[var(--line)] text-sm">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                if (id === 'players') refreshRoster();
              }}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2 ${
                tab === id ? 'border-[var(--accent)] font-semibold' : 'border-transparent text-[var(--muted)] hover:text-inherit'
              }`}
            >
              {id === 'register' ? tr.tabRegister : id === 'pay' ? tr.tabPay : id === 'donate' ? tr.tabDonate : tr.tabPlayers(countPlayers(roster ?? []))}
            </button>
          ))}
        </div>
      )}

      {roster && tab === 'players' ? (
        <RosterView roster={roster} />
      ) : tab === 'donate' ? (
        <DonateView form={form} defaultName={registration?.name || state.registrant?.name || ''} />
      ) : tab === 'pay' ? (
        <PayView
          form={form}
          registration={registration}
          playerName={registration?.name || state.registrant?.name || ''}
          selectedId={selectedPackage}
          onChoose={pickPackage}
          onGoRegister={() => setTab('register')}
          pending={pending}
          error={payError}
        />
      ) : (
        <>
      {!form.isOpen && !registration && <p className="text-sm text-[var(--muted)]">{tr.closed}</p>}

      {form.isOpen && !state.signedIn && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm">{tr.signInPrompt}</p>
          {popupSignIn ? (
            <>
              <button type="button" onClick={openSignIn} className={button} disabled={pending}>
                {pending ? tr.checking : tr.signInToRegister}
              </button>
              {/* The fallback: the whole registration as a page of its own, signed in as usual. */}
              <a href={`/register/${form.id}`} target="_blank" rel="noreferrer" className="text-xs text-[var(--muted)] underline">
                {tr.registerInNewTab}
              </a>
            </>
          ) : (
            <a href={`/login?callbackUrl=${encodeURIComponent(`/register/${form.id}`)}`} className={button}>
              {tr.signInToRegister}
            </a>
          )}
          {waitingFor && <p className="text-xs text-[var(--muted)]">{tr.waitingForSignIn}</p>}
        </div>
      )}

      {state.signedIn && !hasPlayer && form.isOpen && !registration && mode !== 'preview' && (
        <div className="flex flex-col items-start gap-2 rounded border border-amber-400 p-3 text-sm">
          <p>{tr.linkPlayerFirst}</p>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/profile" target="_blank" rel="noreferrer" className={button}>
              {tr.openProfile}
            </a>
            <button type="button" className={quiet} onClick={checkAgain} disabled={pending}>
              {pending ? tr.checking : tr.checkAgain}
            </button>
          </div>
          {state.registrant?.email && <span className="text-xs text-[var(--muted)]">{tr.signedInAs(state.registrant.email)}</span>}
        </div>
      )}

      {state.signedIn && registration && !editing && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 rounded border border-[var(--line)] p-3 text-sm">
            <span className="font-medium">✓ {tr.youAreRegistered(registration.name)}</span>
            <span className="text-[var(--muted)]">{tr.registeredOn(formatDateTime(locale, registration.createdAt))}</span>
            {registration.packageName && (
              <span>
                {tr.packageHeading}: <span className="font-medium">{registration.packageName}</span>
              </span>
            )}
            <span className={registration.paid ? 'text-green-600' : 'text-[var(--muted)]'}>
              {registration.paid ? tr.paymentReceived : tr.paymentNotYet}
              {!registration.paid && payable && (
                <>
                  {' '}
                  <button type="button" onClick={() => setTab('pay')} className="cursor-pointer text-[var(--accent)] underline">
                    {tr.tabPay}
                  </button>
                </>
              )}
            </span>
          </div>
          {form.isOpen && inviteNotes.length > 0 && (
            <div className="flex flex-col items-start gap-2 rounded border border-[var(--accent)] p-3 text-sm">
              <ul className="list-disc pl-5">{inviteNotes}</ul>
              <button type="button" className={button} onClick={() => setEditing(true)} disabled={pending}>
                {tr.addToMyRegistration}
              </button>
            </div>
          )}
          {form.isOpen && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={quiet} onClick={() => setEditing(true)} disabled={pending}>
                {tr.editAnswers}
              </button>
              {!registration.paid && (
                <button type="button" className={quiet} onClick={withdraw} disabled={pending}>
                  {tr.withdraw}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <p className="text-sm">
            {tr.registeringAs} <span className="font-semibold">{state.registrant?.name}</span>
          </p>
          {inviteNotes.length > 0 && (
            <div className="rounded border border-[var(--accent)] p-3 text-sm">
              <p>{tr.addedFromTeammates}</p>
              <ul className="list-disc pl-5">{inviteNotes}</ul>
            </div>
          )}
          {form.questions.map((q) => (
            <QuestionInput
              key={q.id}
              q={q}
              form={form}
              answers={answers}
              onSet={setAnswer}
              invalid={missing.includes(q.id)}
              names={names}
              onPick={pickPlayer}
              search={search}
            />
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={button} disabled={pending || mode === 'preview'}>
              {pending ? tr.saving : registration ? tr.saveChanges : style.buttonText || tr.register}
            </button>
            {registration && (
              <button type="button" className={quiet} onClick={() => showState(state)} disabled={pending}>
                {t.common.cancel}
              </button>
            )}
            {state.registrant?.email && <span className="text-xs text-[var(--muted)]">{tr.signedInAs(state.registrant.email)}</span>}
          </div>
        </form>
      )}
      {error && !showForm && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}

// Players registered in any division, each once.
const countPlayers = (roster: RosterDivision[]) =>
  new Set(roster.flatMap((d) => [...d.teams.flatMap((t) => t.members.filter((m) => m.registered).map((m) => m.id)), ...d.looking.map((p) => p.id), ...d.solo.map((p) => p.id)])).size;

// The Players & teams tab: each division's teams, who's looking for a partner (with a
// Discord button when they have Discord), and who's registered on their own.
function RosterView({ roster }: { roster: RosterDivision[] }) {
  const tr = useT().eventRegistration;
  if (roster.length === 0) return <p className="text-sm text-[var(--muted)]">{tr.nobodyYet}</p>;
  const heading = 'text-xs font-medium tracking-wide text-[var(--muted)] uppercase';
  return (
    <div className="flex flex-col gap-6">
      {roster.map((d) => (
        <section key={d.id} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">
            {d.name} <span className="text-sm font-normal text-[var(--muted)]">· {tr.registeredCount(d.players)}</span>
          </h2>
          {d.teams.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className={heading}>{tr.teams}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {d.teams.map((team) => (
                  <li key={team.members.map((m) => m.id).join('-')}>
                    {team.members.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && ' & '}
                        <span className={m.registered ? '' : 'text-[var(--muted)]'}>{m.name}</span>
                        {!m.registered && <span className="text-xs text-[var(--muted)]"> ({tr.notRegisteredYet})</span>}
                      </span>
                    ))}
                    {team.looking && <span className="text-xs text-[var(--muted)]"> · {tr.lookingForMore}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.looking.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className={heading}>{tr.lookingForPartner}</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {d.looking.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    {p.name}
                    {p.discordId && (
                      <a
                        href={`https://discord.com/users/${p.discordId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-[#5865F2] px-2 py-0.5 text-xs font-medium text-white hover:brightness-110"
                        aria-label={tr.messageOnDiscord(p.name)}
                      >
                        <DiscordMark />
                        {tr.discordDm}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.solo.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className={heading}>{tr.registeredNoPartner}</h3>
              <p className="text-sm">{d.solo.map((p) => p.name).join(', ')}</p>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="currentColor">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1A19.9 19.9 0 0 0 6.2 21l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.7ZM8.3 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.4 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  );
}

function Field({
  label,
  help,
  required,
  invalid,
  group = false,
  children,
}: {
  label: string;
  help?: string;
  required?: boolean;
  invalid?: boolean;
  // A set of inputs (a fieldset with a legend) rather than one (a label).
  group?: boolean;
  children: React.ReactNode;
}) {
  const tr = useT().eventRegistration;
  const Outer = group ? 'fieldset' : 'label';
  const Title = group ? 'legend' : 'span';
  return (
    <Outer className={`flex min-w-0 flex-col gap-1.5 ${invalid ? 'rounded outline-2 outline-offset-4 outline-red-500' : ''}`}>
      <Title className="text-sm font-medium">
        {label}
        {required ? <span className="text-red-600"> *</span> : <span className="font-normal text-[var(--muted)]"> ({tr.optional})</span>}
      </Title>
      {help && <span className="whitespace-pre-line text-xs text-[var(--muted)]">{help}</span>}
      {children}
      {invalid && <span className="text-xs text-red-600">{tr.thisIsRequired}</span>}
    </Outer>
  );
}

function QuestionInput({
  q,
  form,
  answers,
  onSet,
  invalid,
  names,
  onPick,
  search,
}: {
  q: Question;
  form: PublicForm;
  answers: Answers;
  // Sets an answer by key: the question's own, or (divisions) its teammates.
  onSet: (key: string, v: AnswerValue) => void;
  invalid: boolean;
  names: Record<string, string>;
  onPick: (p: PlayerOption) => void;
  search: (q: string) => Promise<PlayerOption[]>;
}) {
  const onChange = (v: AnswerValue) => onSet(q.id, v);
  const tr = useT().eventRegistration;
  const locale = useLocale();
  const value = answers[q.id];
  const input = 'w-full rounded border border-[var(--line)] bg-[var(--field)] px-3 py-2 text-sm';
  const text = typeof value === 'string' ? value : '';
  const list = Array.isArray(value) ? value : [];
  const obj = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, string | string[]>;
  const toggle = (arr: string[], x: string) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  const field = { label: q.label, help: q.help, required: q.required, invalid };
  const check = 'accent-[var(--accent)]';

  const yesNo = (current: unknown, set: (v: string) => void, name: string) => (
    <div className="flex gap-4 text-sm">
      {(['yes', 'no'] as const).map((v) => (
        <label key={v} className="flex items-center gap-1.5">
          <input type="radio" name={name} checked={current === v} onChange={() => set(v)} className={check} />
          {v === 'yes' ? tr.yes : tr.no}
        </label>
      ))}
    </div>
  );

  switch (q.type) {
    case 'text':
      return (
        <Field {...field}>
          <input value={text} onChange={(e) => onChange(e.target.value)} className={input} maxLength={2000} />
        </Field>
      );
    case 'longtext':
      return (
        <Field {...field}>
          <textarea value={text} onChange={(e) => onChange(e.target.value)} className={input} rows={3} maxLength={2000} />
        </Field>
      );
    case 'date':
      return (
        <Field {...field}>
          <input type="date" value={text} onChange={(e) => onChange(e.target.value)} className={`${input} sm:w-auto`} />
        </Field>
      );
    case 'yesno':
      return (
        <Field {...field} group>
          {yesNo(text, onChange, q.id)}
        </Field>
      );
    case 'choice':
      return (
        <Field {...field} group>
          <div className="flex flex-col gap-1 text-sm">
            {q.options.map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input type="radio" name={q.id} checked={text === o} onChange={() => onChange(o)} className={check} />
                {o}
              </label>
            ))}
          </div>
        </Field>
      );
    case 'checkboxes':
      return (
        <Field {...field} group>
          <div className="flex flex-col gap-1 text-sm">
            {q.options.map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input type="checkbox" checked={list.includes(o)} onChange={() => onChange(toggle(list, o))} className={check} />
                {o}
              </label>
            ))}
          </div>
        </Field>
      );
    case 'divisions': {
      // Each ticked division asks for its teammates (optional): one in pairs, two in co-op.
      const key = teammatesKey(q.id);
      const raw = answers[key];
      const teammates = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, string[]>;
      const setMate = (divisionId: string, slot: number, playerId: string | null) => {
        const next = [...(teammates[divisionId] ?? [])];
        if (playerId) next[slot] = playerId;
        else next.splice(slot, 1);
        onSet(key, { ...teammates, [divisionId]: next.filter(Boolean) });
      };
      // "Looking for a partner", per division: offered while the team isn't full.
      const looking = Array.isArray(answers[lookingKey(q.id)]) ? (answers[lookingKey(q.id)] as string[]) : [];
      const setLooking = (divisionId: string) => onSet(lookingKey(q.id), toggle(looking, divisionId));
      return (
        <Field {...field} group>
          {form.divisions.length === 0 && <span className="text-sm text-[var(--muted)]">{tr.noDivisionsYet}</span>}
          <div className="flex flex-col gap-2 text-sm">
            {form.divisions.map((d) => {
              const ticked = list.includes(d.id);
              const mates = teammates[d.id] ?? [];
              const slots = teammateSlots(d.name);
              return (
                <div key={d.id} className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={ticked} onChange={() => onChange(toggle(list, d.id))} className={check} />
                    {d.name}
                  </label>
                  {ticked && (
                    <div className="ml-6 flex flex-col gap-1.5 border-l border-[var(--line)] pl-3">
                      {Array.from({ length: Math.min(slots, mates.length + 1) }, (_, slot) => (
                        <TeammatePicker
                          key={`${slot}-${mates[slot] ?? ''}`}
                          label={slots > 1 ? tr.teammateN(slot + 1) : tr.teammate}
                          playerId={mates[slot] ?? null}
                          name={mates[slot] ? (names[mates[slot]] ?? '?') : ''}
                          exclude={mates}
                          search={search}
                          onPick={(p) => {
                            onPick(p);
                            setMate(d.id, slot, p.id);
                          }}
                          onClear={() => setMate(d.id, slot, null)}
                        />
                      ))}
                      {mates.length < slots && (
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={looking.includes(d.id)} onChange={() => setLooking(d.id)} className={check} />
                          {slots > 1 ? tr.lookingForTeammates : tr.lookingForPartner}
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Field>
      );
    }
    case 'per_division_text':
    case 'per_division_yesno': {
      const asked = askedDivisions(form, answers);
      if (asked.length === 0) return null;
      return (
        <Field {...field} group>
          <div className="flex flex-col gap-2">
            {asked.map((d) => (
              <div key={d.id} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
                <span className="text-sm text-[var(--muted)]">{d.name}</span>
                {q.type === 'per_division_text' ? (
                  <input
                    aria-label={`${q.label}: ${d.name}`}
                    value={typeof obj[d.id] === 'string' ? (obj[d.id] as string) : ''}
                    onChange={(e) => onChange({ ...obj, [d.id]: e.target.value })}
                    className={input}
                    maxLength={2000}
                  />
                ) : (
                  yesNo(obj[d.id], (v) => onChange({ ...obj, [d.id]: v }), `${q.id}-${d.id}`)
                )}
              </div>
            ))}
          </div>
        </Field>
      );
    }
    case 'meals': {
      const days = eventDays(form.startDate, form.endDate);
      return (
        <Field {...field} group>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th />
                  {q.options.map((o) => (
                    <th key={o} className="px-3 py-1 text-center font-medium">
                      {o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const ticked = Array.isArray(obj[day]) ? (obj[day] as string[]) : [];
                  return (
                    <tr key={day} className="border-t border-[var(--line)]">
                      <td className="py-1 pr-3 whitespace-nowrap text-[var(--muted)]">{formatDay(locale, day)}</td>
                      {q.options.map((o) => (
                        <td key={o} className="px-3 py-1 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${formatDay(locale, day)}: ${o}`}
                            checked={ticked.includes(o)}
                            onChange={() => onChange({ ...obj, [day]: toggle(ticked, o) })}
                            className={check}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Field>
      );
    }
  }
}

// One teammate: search players by name and pick one, or clear the one picked.
function TeammatePicker({
  label,
  playerId,
  name,
  exclude,
  search,
  onPick,
  onClear,
}: {
  label: string;
  playerId: string | null;
  name: string;
  exclude: string[];
  search: (q: string) => Promise<PlayerOption[]>;
  onPick: (p: PlayerOption) => void;
  onClear: () => void;
}) {
  const tr = useT().eventRegistration;
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; players: PlayerOption[] } | null>(null);
  const typed = query.trim();

  // Searches a moment after typing stops; results are kept with the words they were for.
  useEffect(() => {
    if (playerId || typed.length < 2) return;
    let current = true;
    const timer = setTimeout(async () => {
      const players = await search(typed).catch(() => []);
      if (current) setFound({ query: typed, players });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [typed, playerId, search]);

  if (playerId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--muted)]">{label}</span>
        <span className="rounded border border-[var(--line)] bg-[var(--field)] px-2 py-1 font-medium">{name}</span>
        <button
          type="button"
          onClick={onClear}
          className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-[var(--muted)] underline hover:text-red-600"
          aria-label={tr.clearTeammate(name)}
        >
          ✕ {tr.clear}
        </button>
      </div>
    );
  }

  const searching = typed.length >= 2 && found?.query !== typed;
  const shown = typed.length >= 2 && found?.query === typed ? found.players.filter((p) => !exclude.includes(p.id)) : [];

  return (
    <div className="flex flex-col gap-1">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`${label} (${tr.optional}): ${tr.searchPlayer}`}
        aria-label={label}
        className="w-full max-w-sm rounded border border-[var(--line)] bg-[var(--field)] px-3 py-1.5 text-sm"
        maxLength={80}
      />
      {typed.length >= 2 && (
        <ul className="max-w-sm overflow-hidden rounded border border-[var(--line)] bg-[var(--field)] text-sm shadow-sm">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setQuery('');
                }}
                className="flex w-full cursor-pointer items-baseline gap-2 px-3 py-1.5 text-left hover:bg-[var(--accent)] hover:text-white"
              >
                {p.name}
                {p.country && <span className="text-xs opacity-70">{p.country}</span>}
              </button>
            </li>
          ))}
          {searching && <li className="px-3 py-1.5 text-xs text-[var(--muted)]">{tr.checking}</li>}
          {!searching && shown.length === 0 && <li className="px-3 py-1.5 text-xs text-[var(--muted)]">{tr.noPlayersFound}</li>}
        </ul>
      )}
    </div>
  );
}
