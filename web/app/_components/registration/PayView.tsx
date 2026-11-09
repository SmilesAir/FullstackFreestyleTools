'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useLocale, useT } from '@/lib/i18n/client';
import { INTL_LOCALE } from '@/lib/i18n/locales';
import type { PublicForm } from '@/lib/registration';
import type { Registration } from '@/lib/registration-queries';
import {
  currenciesInUse,
  amountFor,
  formatMoney,
  packagePrices,
  paymentNote,
  paypalLink,
  revolutLink,
  venmoLink,
  type PaymentMethod,
} from '@/lib/registration-payment';

// The form's Pay tab: pick a package, then each way to pay with the amount for it and
// a note naming the event, player and package (Venmo also as a link and QR code with
// all of it filled in). Before registering, only the packages and their prices.
export function PayView({
  form,
  registration,
  playerName,
  selectedId,
  onChoose,
  onGoRegister,
  pending,
  error,
}: {
  form: PublicForm;
  registration: Registration | null;
  playerName: string;
  selectedId: string | null;
  onChoose: (packageId: string) => void;
  onGoRegister: (() => void) | null;
  pending: boolean;
  error: string | null;
}) {
  const tr = useT().eventRegistration;
  const intl = INTL_LOCALE[useLocale()];
  const { packages, methods } = form.payment;
  const currencies = currenciesInUse(methods);
  const pkg = packages.find((p) => p.id === selectedId) ?? null;
  const locked = !!registration?.paid;
  const note = paymentNote(form.title || form.eventName, playerName, pkg?.name ?? null);

  return (
    <div className="flex flex-col gap-5">
      {registration?.paid ? (
        <p className="rounded border border-green-600 p-3 text-sm text-green-600">✓ {tr.paidFor(registration.packageName)}</p>
      ) : (
        <p className="text-sm">{tr.payIntro}</p>
      )}

      {packages.length > 0 && (
        <fieldset className="flex flex-col gap-2" disabled={locked || pending}>
          <legend className="mb-2 text-sm font-medium">{tr.packageHeading}</legend>
          {packages.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm ${
                p.id === selectedId ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--line)]'
              } ${locked ? 'cursor-default opacity-80' : ''}`}
            >
              <input type="radio" name="package" checked={p.id === selectedId} onChange={() => onChoose(p.id)} className="mt-1 accent-[var(--accent)]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{p.name}</span>
                  <span className="font-medium">{packagePrices(intl, p, currencies)}</span>
                </span>
                {p.description && <span className="whitespace-pre-line text-xs text-[var(--muted)]">{p.description}</span>}
              </span>
            </label>
          ))}
          {locked && <p className="text-xs text-[var(--muted)]">{tr.packageLocked}</p>}
        </fieldset>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!registration ? (
        <div className="flex flex-col items-start gap-2 rounded border border-[var(--line)] p-3 text-sm">
          <p>{tr.registerBeforePaying}</p>
          {onGoRegister && (
            <button type="button" onClick={onGoRegister} className="cursor-pointer rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110">
              {tr.goToRegister}
            </button>
          )}
        </div>
      ) : (
        !registration.paid &&
        methods.length > 0 && (
          <div className="flex flex-col gap-3">
            {packages.length > 0 && !pkg && <p className="text-sm text-[var(--muted)]">{tr.pickPackage}</p>}
            {methods.map((m) => (
              <MethodCard key={m.id} method={m} price={pkg?.prices[m.currency] ?? null} note={note} />
            ))}
            <p className="text-xs text-[var(--muted)]">{tr.addNote}</p>
          </div>
        )
      )}
    </div>
  );
}

// One way to pay, with the amount to send for a price in its currency (PayPal's fee added)
// and the note; also used by the Donate tab.
export function MethodCard({ method: m, price, note }: { method: PaymentMethod; price: number | null; note: string }) {
  const tr = useT().eventRegistration;
  const intl = INTL_LOCALE[useLocale()];
  const due = amountFor(m, price);
  const money = (n: number) => formatMoney(intl, n, m.currency);
  const linkButton = 'inline-block rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110';

  const amountRow = due && <CopyRow label={tr.amount} shown={money(due.amount)} value={String(due.amount)} strong />;
  let body: React.ReactNode;
  switch (m.type) {
    case 'venmo': {
      const link = venmoLink(m, due?.amount ?? null, note);
      body = (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 grow basis-64 flex-col gap-2">
            <CopyRow label={tr.payTo} value={`@${m.username}`} />
            {amountRow}
            <CopyRow label={tr.note} value={note} />
            <a href={link} target="_blank" rel="noreferrer" className={`${linkButton} self-start`}>
              {tr.payWithVenmo}
            </a>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Qr text={link} label={tr.payWithVenmo} />
            <span className="text-xs text-[var(--muted)]">{tr.scanToPay}</span>
          </div>
        </div>
      );
      break;
    }
    case 'revolut': {
      const link = revolutLink(m);
      body = (
        <div className="flex flex-col gap-2">
          <CopyRow label={tr.payTo} value={`@${m.username}`} />
          {amountRow}
          <CopyRow label={tr.reference} value={note} />
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className={`${linkButton} self-start`}>
              {tr.openRevolut}
            </a>
          )}
        </div>
      );
      break;
    }
    case 'bank_co':
      body = (
        <div className="flex flex-col gap-2">
          <CopyRow label={tr.bank} value={m.bank} copy={false} />
          <CopyRow label={tr.accountType} value={tr.accountTypes[m.accountType]} copy={false} />
          <CopyRow label={tr.accountNumber} value={m.accountNumber} />
          <CopyRow label={tr.accountHolder} value={m.holder} />
          {m.idNumber && <CopyRow label={tr.holderId} shown={`${tr.idTypes[m.idType] ?? m.idType} ${m.idNumber}`} value={m.idNumber} />}
          {m.key && <CopyRow label={tr.breBKey} value={m.key} />}
          {amountRow}
          <CopyRow label={tr.reference} value={note} />
        </div>
      );
      break;
    case 'paypal': {
      const link = paypalLink(m, due?.amount ?? null);
      body = (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-amber-600">{tr.paypalLastResort}</p>
          {m.email && <CopyRow label={tr.payTo} value={m.email} />}
          {!m.email && m.username && <CopyRow label={tr.payTo} value={`paypal.me/${m.username}`} />}
          {amountRow}
          {due && due.fee > 0 && <p className="text-xs text-[var(--muted)]">{tr.paypalFee(money(due.fee))}</p>}
          <CopyRow label={tr.note} value={note} />
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className={`${linkButton} self-start`}>
              {tr.openPaypal}
            </a>
          )}
        </div>
      );
      break;
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-[var(--line)] p-3">
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        {tr.methodNames[m.type]}
        <span className="text-xs font-normal text-[var(--muted)]">{m.currency}</span>
      </h3>
      {body}
      {m.instructions && <p className="whitespace-pre-line text-xs text-[var(--muted)]">{m.instructions}</p>}
    </section>
  );
}

// A label and a value, with a button that copies the value (or `value` when what's shown
// is formatted differently, such as an amount).
function CopyRow({ label, value, shown, strong = false, copy = true }: { label: string; value: string; shown?: string; strong?: boolean; copy?: boolean }) {
  const tr = useT().eventRegistration;
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-2 text-sm">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-2">
        <span className={`break-all ${strong ? 'text-base font-semibold' : 'font-medium'}`}>{shown ?? value}</span>
        {copy && (
          <button type="button" onClick={doCopy} className="cursor-pointer text-xs text-[var(--muted)] underline hover:text-inherit">
            {copied ? tr.copiedShort : tr.copy}
          </button>
        )}
      </span>
    </div>
  );
}

// The clipboard, when the page around the embed allows it; else the old way.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

// A QR code of a link, dark on white whatever the form's theme (so phones can read it).
function Qr({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text, { type: 'svg', margin: 2, width: 160, errorCorrectionLevel: 'M' })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(''));
    return () => {
      cancelled = true;
    };
  }, [text]);
  return <div role="img" aria-label={label} className="h-40 w-40 rounded bg-white" dangerouslySetInnerHTML={{ __html: svg }} />;
}
