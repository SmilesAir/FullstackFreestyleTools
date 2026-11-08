'use client';

import { useState } from 'react';
import { useLocale, useT } from '@/lib/i18n/client';
import { INTL_LOCALE } from '@/lib/i18n/locales';
import type { PublicForm } from '@/lib/registration';
import { currenciesInUse, formatMoney, isWholeUnits, paymentNote } from '@/lib/registration-payment';
import { MethodCard } from './PayView';

// The form's Donate tab: open to anyone (no sign-in) and not recorded. Pick a currency
// (when the ways to pay take more than one), a suggested amount or one of your own, then
// each way to pay in that currency with the amount and a note marking it a donation.
export function DonateView({ form, defaultName = '' }: { form: PublicForm; defaultName?: string }) {
  const tr = useT().eventRegistration;
  const intl = INTL_LOCALE[useLocale()];
  const { methods, donations } = form.payment;
  const currencies = currenciesInUse(methods);
  const [currency, setCurrency] = useState(currencies[0]);
  const shownCurrency = currencies.includes(currency) ? currency : currencies[0];
  const suggested = donations.amounts[shownCurrency] ?? [];
  // A suggested amount picked, or what's typed in Other amount (one or the other).
  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [name, setName] = useState(defaultName);
  // Typed as people write it: "25", "25,50" or "25.50"; "450.000" in a currency without cents.
  const typed = Number(isWholeUnits(shownCurrency) ? custom.replace(/[.,]/g, '') : custom.replace(',', '.'));
  const amount = custom.trim() ? (Number.isFinite(typed) && typed > 0 ? typed : null) : picked;
  const note = paymentNote(form.title || form.eventName, name.trim(), tr.donation);
  const shownMethods = methods.filter((m) => m.currency === shownCurrency);

  const chip = (active: boolean) =>
    `cursor-pointer rounded border px-3 py-1.5 text-sm ${
      active ? 'border-[var(--accent)] bg-[var(--accent)] font-medium text-white' : 'border-[var(--line)] hover:border-[var(--accent)]'
    }`;
  const input = 'rounded border border-[var(--line)] bg-[var(--field)] px-3 py-1.5 text-sm';

  return (
    <div className="flex flex-col gap-5">
      <p className="whitespace-pre-line text-sm">{donations.intro || tr.donateIntro}</p>

      {currencies.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{tr.donateCurrency}</span>
          <div role="group" className="flex flex-wrap gap-2">
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === shownCurrency}
                onClick={() => {
                  setCurrency(c);
                  setPicked(null);
                }}
                className={chip(c === shownCurrency)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{tr.donateAmount}</span>
        <div className="flex flex-wrap items-center gap-2">
          {suggested.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={!custom.trim() && picked === n}
              onClick={() => {
                setPicked(n);
                setCustom('');
              }}
              className={chip(!custom.trim() && picked === n)}
            >
              {formatMoney(intl, n, shownCurrency)}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">{suggested.length ? tr.customAmount : ''}</span>
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder={shownCurrency}
              aria-label={tr.customAmount}
              className={`${input} w-32`}
              maxLength={12}
            />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{tr.yourNameOptional}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-full max-w-sm`} maxLength={80} />
      </label>

      <div className="flex flex-col gap-3">
        {!amount && <p className="text-sm text-[var(--muted)]">{tr.pickAmount}</p>}
        {shownMethods.map((m) => (
          <MethodCard key={m.id} method={m} price={amount} note={note} />
        ))}
        <p className="text-xs text-[var(--muted)]">{tr.donateThanks}</p>
      </div>
    </div>
  );
}
