'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import type { PublicForm } from '@/lib/registration';
import {
  CURRENCIES,
  FIXED_CURRENCY,
  ID_TYPES,
  METHOD_TYPES,
  cleanPayment,
  currenciesInUse,
  isWholeUnits,
  newMethod,
  newPaymentId,
  type MethodType,
  type PaymentDonations,
  type PaymentMethod,
  type PaymentPackage,
  type PaymentSettings,
} from '@/lib/registration-payment';
import { savePayment, type MyRegistrationState } from '@/lib/registration-actions';
import { RegistrationForm } from '@/app/_components/registration/RegistrationForm';

// Where a newly added way to pay goes: in this order, PayPal (it takes a fee) last.
const DEFAULT_ORDER: MethodType[] = ['venmo', 'revolut', 'bank_co', 'paypal'];

const moveItem = <T,>(list: T[], index: number, by: number) => {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item);
  return next;
};

// Suggested donation amounts as staff type them, "10, 25, 50" ("50.000, 100.000" in COP).
const parseAmounts = (text: string, currency: string) =>
  text
    .split(/[,;\s]+/)
    .map((v) => Number(isWholeUnits(currency) ? v.replace(/\./g, '') : v))
    .filter((n) => Number.isFinite(n) && n > 0);

// The Payment tab: the packages players pick from, the ways to pay (in the order players
// see them), donations, and a preview of the form's Pay and Donate tabs.
export function PaymentEditor({ form }: { form: PublicForm }) {
  const tr = useT().eventRegistration;
  const router = useRouter();
  const [packages, setPackages] = useState<PaymentPackage[]>(form.payment.packages);
  const [methods, setMethods] = useState<PaymentMethod[]>(form.payment.methods);
  const [donations, setDonations] = useState<PaymentDonations>(form.payment.donations);
  // The suggested amounts as typed, per currency (parsed into donations as they change).
  const [amountText, setAmountText] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(form.payment.donations.amounts).map(([c, list]) => [c, list.join(', ')]))
  );
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(form.payment));
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const payment: PaymentSettings = useMemo(() => ({ packages, methods, donations }), [packages, methods, donations]);
  const dirty = JSON.stringify(payment) !== savedJson;
  const currencies = currenciesInUse(methods);

  const updatePackage = (id: string, change: Partial<PaymentPackage>) => setPackages((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const updateMethod = (id: string, change: Partial<PaymentMethod>) => setMethods((ms) => ms.map((m) => (m.id === id ? { ...m, ...change } : m)));
  const addMethod = (type: MethodType) =>
    setMethods((ms) => {
      const next = [...ms, newMethod(type)];
      // Keep the usual order when adding (staff can still move them after).
      const rank = (m: PaymentMethod) => DEFAULT_ORDER.indexOf(m.type);
      const at = ms.findIndex((m) => rank(m) > rank(next[next.length - 1]));
      return at < 0 ? next : [...ms.slice(0, at), next[next.length - 1], ...ms.slice(at)];
    });

  const save = () =>
    startTransition(async () => {
      const result = await savePayment(form.id, payment);
      if (result.error) return setMessage({ error: true, text: result.error });
      setSavedJson(JSON.stringify(cleanPayment(payment)));
      setPackages((ps) => cleanPayment({ packages: ps, methods: [] }).packages);
      setMethods((ms) => cleanPayment({ packages: [], methods: ms }).methods);
      setDonations(cleanPayment(payment).donations);
      setMessage({ error: false, text: tr.saved });
      router.refresh();
    });

  const preview = useMemo<PublicForm>(() => ({ ...form, isOpen: true, payment: cleanPayment(payment) }), [form, payment]);
  const previewState = useMemo<MyRegistrationState>(() => {
    const now = new Date().toISOString();
    return {
      signedIn: true,
      registrant: { playerId: 'preview', name: tr.previewName, email: null },
      registration: {
        id: 'preview', name: tr.previewName, email: null, playerId: 'preview', answers: {}, paid: false, paidAt: null,
        paidByName: null, paymentNote: '', packageId: null, packageName: '', createdAt: now, updatedAt: now, discordId: null,
      },
      invites: [],
      names: {},
    };
  }, [tr.previewName]);

  const input = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm';
  const small = 'cursor-pointer rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-default disabled:opacity-30';
  const mover = (index: number, count: number, onMove: (by: number) => void, onRemove: () => void, removeLabel: string) => (
    <span className="ml-auto flex">
      <button type="button" className={small} onClick={() => onMove(-1)} disabled={index === 0} aria-label={tr.moveUp}>
        ↑
      </button>
      <button type="button" className={small} onClick={() => onMove(1)} disabled={index === count - 1} aria-label={tr.moveDown}>
        ↓
      </button>
      <button type="button" className={`${small} text-red-600`} onClick={onRemove} aria-label={removeLabel}>
        ✕
      </button>
    </span>
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-6">
        <p className="text-sm text-gray-600">{tr.paymentIntro}</p>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tr.paymentMethods}</h2>
          <p className="-mt-2 text-xs text-gray-500">{tr.paymentMethodsHelp}</p>
          {methods.length === 0 && <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">{tr.noMethods}</p>}
          {methods.map((m, i) => (
            <div key={m.id} className="flex flex-col gap-2 rounded border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{tr.methodNames[m.type]}</span>
                {mover(i, methods.length, (by) => setMethods((ms) => moveItem(ms, i, by)), () => setMethods((ms) => ms.filter((x) => x.id !== m.id)), tr.removeMethod)}
              </div>
              <MethodFields method={m} onChange={(c) => updateMethod(m.id, c)} input={input} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {METHOD_TYPES.filter((type) => !methods.some((m) => m.type === type)).map((type) => (
              <button key={type} type="button" onClick={() => addMethod(type)} className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50">
                {tr.addMethod(tr.methodNames[type])}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tr.packages}</h2>
          <p className="-mt-2 text-xs text-gray-500">{tr.packagesHelp}</p>
          {packages.length === 0 && <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">{tr.noPackages}</p>}
          {packages.map((p, i) => (
            <div key={p.id} className="flex flex-col gap-2 rounded border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <input value={p.name} onChange={(e) => updatePackage(p.id, { name: e.target.value })} placeholder={tr.packageName} aria-label={tr.packageName} className={`${input} font-medium`} maxLength={100} />
                {mover(i, packages.length, (by) => setPackages((ps) => moveItem(ps, i, by)), () => setPackages((ps) => ps.filter((x) => x.id !== p.id)), tr.removePackage)}
              </div>
              <textarea
                value={p.description}
                onChange={(e) => updatePackage(p.id, { description: e.target.value })}
                placeholder={tr.packageDescription}
                aria-label={tr.packageDescription}
                rows={2}
                className={`${input} text-xs`}
                maxLength={1000}
              />
              <div className="flex flex-wrap gap-3">
                {currencies.map((c) => (
                  <label key={c} className="flex flex-col gap-1 text-xs text-gray-600">
                    {tr.price(c)}
                    <input
                      type="number"
                      min={0}
                      step={c === 'COP' ? 1000 : 1}
                      value={p.prices[c] ?? ''}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const prices = { ...p.prices };
                        if (e.target.value && n > 0) prices[c] = n;
                        else delete prices[c];
                        updatePackage(p.id, { prices });
                      }}
                      className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPackages((ps) => [...ps, { id: newPaymentId(), name: '', description: '', prices: {} }])}
            className="cursor-pointer self-start rounded border border-gray-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
          >
            {tr.addPackage}
          </button>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tr.donations}</h2>
          <p className="-mt-2 text-xs text-gray-500">{tr.donationsHelp}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={donations.enabled} onChange={(e) => setDonations((d) => ({ ...d, enabled: e.target.checked }))} />
            {tr.acceptDonations}
          </label>
          {donations.enabled && methods.length === 0 && <p className="text-xs text-amber-700">{tr.donationsNeedMethods}</p>}
          {donations.enabled && (
            <div className="flex flex-col gap-3 rounded border border-gray-200 p-3">
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                {tr.donationIntro}
                <textarea
                  value={donations.intro}
                  onChange={(e) => setDonations((d) => ({ ...d, intro: e.target.value }))}
                  placeholder={tr.donateIntro}
                  rows={2}
                  className={`${input} text-xs`}
                  maxLength={1000}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                {currencies.map((c) => (
                  <label key={c} className="flex flex-col gap-1 text-xs text-gray-600">
                    {tr.suggestedAmounts(c)}
                    <input
                      value={amountText[c] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAmountText((t) => ({ ...t, [c]: value }));
                        setDonations((d) => {
                          const amounts = { ...d.amounts };
                          const list = parseAmounts(value, c);
                          if (list.length) amounts[c] = list;
                          else delete amounts[c];
                          return { ...d, amounts };
                        });
                      }}
                      placeholder={c === 'COP' ? '20000, 50000, 100000' : '10, 25, 50'}
                      inputMode="decimal"
                      className="w-48 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      maxLength={100}
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500">{tr.suggestedAmountsHelp}</p>
            </div>
          )}
        </section>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-background py-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-default disabled:opacity-50"
          >
            {pending ? tr.saving : tr.save}
          </button>
          {dirty && <span className="text-xs text-amber-700">{tr.unsaved}</span>}
          {message && (message.error || !dirty) && <span className={`text-xs ${message.error ? 'text-red-600' : 'text-green-700'}`}>{message.text}</span>}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-semibold">{tr.preview}</h2>
        <p className="text-xs text-gray-500">{tr.payPreviewHelp}</p>
        <div className="rounded-lg border border-gray-200 shadow-sm lg:sticky lg:top-12">
          <RegistrationForm form={preview} initial={previewState} mode="preview" initialTab="pay" />
        </div>
      </div>
    </div>
  );
}

// One way to pay's own fields.
function MethodFields({ method: m, onChange, input }: { method: PaymentMethod; onChange: (c: Partial<PaymentMethod>) => void; input: string }) {
  const tr = useT().eventRegistration;
  const field = (label: string, key: 'username' | 'email' | 'bank' | 'accountNumber' | 'holder' | 'idNumber' | 'key', placeholder = '') => (
    <label className="flex flex-col gap-1 text-xs text-gray-600">
      {label}
      <input value={m[key]} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={placeholder} className={input} maxLength={100} />
    </label>
  );
  const select = 'rounded border border-gray-300 px-2 py-1.5 text-sm';
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {m.type === 'venmo' && field(tr.venmoUsername, 'username', '@username')}
      {m.type === 'revolut' && field(tr.revolutUsername, 'username', '@revtag')}
      {m.type === 'paypal' && (
        <>
          {field(tr.paypalUsername, 'username', 'paypal.me/…')}
          {field(tr.paypalEmail, 'email')}
        </>
      )}
      {m.type === 'bank_co' && (
        <>
          {field(tr.bank, 'bank', 'Bancolombia')}
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            {tr.accountType}
            <select value={m.accountType} onChange={(e) => onChange({ accountType: e.target.value as PaymentMethod['accountType'] })} className={select}>
              {(['savings', 'checking'] as const).map((a) => (
                <option key={a} value={a}>
                  {tr.accountTypes[a]}
                </option>
              ))}
            </select>
          </label>
          {field(tr.accountNumber, 'accountNumber')}
          {field(tr.accountHolder, 'holder')}
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {tr.holderId}
              <select value={m.idType} onChange={(e) => onChange({ idType: e.target.value })} className={select}>
                {ID_TYPES.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex-1">{field(' ', 'idNumber')}</div>
          </div>
          {field(tr.breBKey, 'key')}
        </>
      )}
      {!FIXED_CURRENCY[m.type] && (
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          {tr.currency}
          <select value={m.currency} onChange={(e) => onChange({ currency: e.target.value })} className={select}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      {m.type === 'paypal' && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <div className="flex gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {tr.feePercent}
              <input type="number" min={0} max={50} step={0.1} value={m.feePercent} onChange={(e) => onChange({ feePercent: Number(e.target.value) || 0 })} className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {tr.feeFixed} ({m.currency})
              <input type="number" min={0} step={0.01} value={m.feeFixed} onChange={(e) => onChange({ feeFixed: Number(e.target.value) || 0 })} className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <p className="text-xs text-gray-500">{tr.paypalFeeHelp}</p>
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs text-gray-600 sm:col-span-2">
        {tr.instructions}
        <textarea value={m.instructions} onChange={(e) => onChange({ instructions: e.target.value })} rows={2} className={input} maxLength={1000} />
      </label>
    </div>
  );
}
