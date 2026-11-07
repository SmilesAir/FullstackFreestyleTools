'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatDay, formatShortDateTime } from '@/lib/i18n/format';
import { answerText, eventDays, type PublicForm } from '@/lib/registration';
import type { Registration } from '@/lib/registration-queries';
import { removeRegistration, setPaid } from '@/lib/registration-actions';

type Filter = 'all' | 'paid' | 'unpaid';

// The Registrations tab: everyone registered with every answer, whether they've paid
// (marked here by hand), totals per division and meals per day, and a CSV download.
// names: the players picked as teammates, by id.
export function RegistrationsTable({
  form,
  registrations,
  names,
}: {
  form: PublicForm;
  registrations: Registration[];
  names: Record<string, string>;
}) {
  const t = useT();
  const tr = t.eventRegistration;
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const words = { yes: tr.yes, no: tr.no, with: tr.withTeammates, looking: tr.lookingTag };
  const playerName = (id: string) => names[id] ?? '?';
  const dayName = (d: string) => formatDay(locale, d);
  const shown = registrations.filter(
    (r) =>
      (filter === 'all' || (filter === 'paid') === r.paid) &&
      (!search || `${r.name} ${r.email ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  );
  const paidCount = registrations.filter((r) => r.paid).length;

  const totals = useMemo(() => {
    const divisionQ = form.questions.find((q) => q.type === 'divisions');
    const perDivision = divisionQ
      ? form.divisions.map((d) => ({
          name: d.name,
          count: registrations.filter((r) => {
            const v = r.answers[divisionQ.id];
            return Array.isArray(v) && v.includes(d.id);
          }).length,
        }))
      : [];
    const meals = form.questions
      .filter((q) => q.type === 'meals')
      .map((q) => ({
        label: q.label,
        options: q.options,
        days: eventDays(form.startDate, form.endDate).map((day) => ({
          day,
          counts: q.options.map((o) =>
            registrations.filter((r) => {
              const v = r.answers[q.id];
              const ticked = v && typeof v === 'object' && !Array.isArray(v) ? v[day] : undefined;
              return Array.isArray(ticked) && ticked.includes(o);
            }).length
          ),
        })),
      }));
    return { perDivision, meals };
  }, [form, registrations]);

  const downloadCsv = () => {
    const header = [tr.name, tr.email, ...form.questions.map((q) => q.label), tr.registeredAt, tr.paid, tr.paymentNote];
    const rows = registrations.map((r) => [
      r.name,
      r.email ?? '',
      ...form.questions.map((q) => answerText(q, r.answers, form.divisions, words, dayName, playerName)),
      r.createdAt,
      r.paid ? tr.yes : tr.no,
      r.paymentNote,
    ]);
    const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(form.title || form.eventName).replace(/[^\w\- ]+/g, '').trim() || 'registrations'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (registrations.length === 0) {
    return <p className="text-sm text-gray-500">{form.isOpen ? tr.noRegistrationsYet : tr.noRegistrationsClosed}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {tr.registeredCount(registrations.length)} · <span className="text-green-700">{tr.paidCount(paidCount)}</span> ·{' '}
          <span className="text-amber-700">{tr.unpaidCount(registrations.length - paidCount)}</span>
        </span>
        <div role="group" className="flex overflow-hidden rounded border border-gray-300 text-xs">
          {(['all', 'unpaid', 'paid'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`cursor-pointer px-2 py-1 ${filter === f ? 'bg-gray-800 text-white' : 'hover:bg-gray-50'}`}
            >
              {tr.filters[f]}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr.searchPlaceholder}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <button type="button" onClick={downloadCsv} className="ml-auto cursor-pointer rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">
          {tr.downloadCsv}
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">{tr.paid}</th>
              <th className="px-3 py-2 font-medium">{tr.name}</th>
              {form.questions.map((q) => (
                <th key={q.id} className="min-w-32 px-3 py-2 font-medium">
                  {q.label}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">{tr.registeredAt}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shown.map((r) => (
              <tr key={r.id} className={r.paid ? '' : 'bg-amber-50/40'}>
                <td className="px-3 py-2 align-top">
                  <PaidCell registration={r} />
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">{r.name}</div>
                  {r.email && <div className="text-gray-500">{r.email}</div>}
                </td>
                {form.questions.map((q) => (
                  <td key={q.id} className="max-w-64 px-3 py-2 align-top whitespace-pre-line">
                    {answerText(q, r.answers, form.divisions, words, dayName, playerName).replace(/; /g, '\n')}
                  </td>
                ))}
                <td className="px-3 py-2 align-top whitespace-nowrap text-gray-500">
                  {formatShortDateTime(locale, r.createdAt)}
                  {r.updatedAt !== r.createdAt && <div>{tr.changed(formatShortDateTime(locale, r.updatedAt))}</div>}
                </td>
                <td className="px-3 py-2 align-top">
                  <RemoveButton registration={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(totals.perDivision.length > 0 || totals.meals.length > 0) && (
        <div className="flex flex-wrap gap-8">
          {totals.perDivision.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{tr.perDivision}</h3>
              <table className="text-xs">
                <tbody>
                  {totals.perDivision.map((d) => (
                    <tr key={d.name}>
                      <td className="py-0.5 pr-4">{d.name}</td>
                      <td className="text-right font-medium">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totals.meals.map((m) => (
            <div key={m.label} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{m.label}</h3>
              <table className="text-xs">
                <thead>
                  <tr>
                    <th />
                    {m.options.map((o) => (
                      <th key={o} className="px-3 font-medium">
                        {o}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.days.map((d) => (
                    <tr key={d.day}>
                      <td className="py-0.5 pr-4">{formatDay(locale, d.day)}</td>
                      {d.counts.map((c, i) => (
                        <td key={i} className="px-3 text-center font-medium">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The Paid tick, with a note (e.g. "PayPal 12 Mar", "Revolut, cash") and who marked it.
function PaidCell({ registration: r }: { registration: Registration }) {
  const tr = useT().eventRegistration;
  const locale = useLocale();
  const router = useRouter();
  const [note, setNote] = useState(r.paymentNote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (paid: boolean, newNote: string) =>
    startTransition(async () => {
      const result = await setPaid(r.id, paid, newNote);
      setError(result.error);
      router.refresh();
    });

  return (
    <div className="flex w-44 flex-col gap-1">
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={r.paid} disabled={pending} onChange={(e) => save(e.target.checked, note)} />
        <span className={r.paid ? 'font-medium text-green-700' : 'text-amber-700'}>{r.paid ? tr.paid : tr.notPaid}</span>
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== r.paymentNote && save(r.paid, note)}
        placeholder={tr.paymentNotePlaceholder}
        className="rounded border border-gray-200 px-1.5 py-0.5"
        maxLength={500}
      />
      {r.paid && r.paidAt && <span className="text-gray-400">{tr.markedPaidBy(r.paidByName ?? '?', formatShortDateTime(locale, r.paidAt))}</span>}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

// Removing asks again first (the page has no pop-up dialogs).
function RemoveButton({ registration: r }: { registration: Registration }) {
  const tr = useT().eventRegistration;
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="cursor-pointer text-gray-400 hover:text-red-600" aria-label={tr.remove}>
        ✕
      </button>
    );
  }
  return (
    <span className="flex flex-col gap-1 whitespace-nowrap">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await removeRegistration(r.id);
            router.refresh();
          })
        }
        className="cursor-pointer text-red-600 underline"
      >
        {tr.confirmRemove(r.name)}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="cursor-pointer text-gray-500 underline">
        {tr.keep}
      </button>
    </span>
  );
}
