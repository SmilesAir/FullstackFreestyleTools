// Event Registration payments: the packages players pick from and the ways to pay,
// shown in the form's Pay tab. Payment goes straight to the organizers (no payment
// provider, no fees taken), so this only builds the details, links and notes; staff
// mark registrations paid by hand. Plain data with no server imports, so client
// components can use it too.

export const METHOD_TYPES = ['venmo', 'revolut', 'bank_co', 'paypal'] as const;
export type MethodType = (typeof METHOD_TYPES)[number];

// Currencies a method can take. Venmo is always USD and a Colombian bank transfer COP.
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'COP', 'CAD', 'MXN', 'AUD', 'CHF'] as const;
export const FIXED_CURRENCY: Partial<Record<MethodType, string>> = { venmo: 'USD', bank_co: 'COP' };
// Paid in whole units (no cents).
const WHOLE_UNITS = new Set(['COP']);
export const isWholeUnits = (currency: string) => WHOLE_UNITS.has(currency);

export const ID_TYPES = ['CC', 'CE', 'NIT', 'PP'] as const;

// One way to pay. Every field is always present (empty when the type doesn't use it).
export type PaymentMethod = {
  id: string;
  type: MethodType;
  currency: string;
  username: string; // Venmo, Revolut (revtag), PayPal.me
  email: string; // PayPal
  // Bank transfer (Colombia)
  bank: string;
  accountType: 'savings' | 'checking';
  accountNumber: string;
  holder: string;
  idType: string;
  idNumber: string;
  key: string; // Bre-B key, Nequi number…
  // PayPal: added on top so the whole price reaches the organizers
  feePercent: number;
  feeFixed: number;
  instructions: string;
};

// A registration tier, priced in each currency the methods use.
export type PaymentPackage = { id: string; name: string; description: string; prices: Record<string, number> };

// Donations, in the form's Donate tab: open to anyone (no sign-in) and not recorded, paid
// with the same ways to pay. amounts: the suggested amounts per currency (donors can also
// type their own).
export type PaymentDonations = { enabled: boolean; intro: string; amounts: Record<string, number[]> };

export type PaymentSettings = { packages: PaymentPackage[]; methods: PaymentMethod[]; donations: PaymentDonations };

export const EMPTY_DONATIONS: PaymentDonations = { enabled: false, intro: '', amounts: {} };
export const EMPTY_PAYMENT: PaymentSettings = { packages: [], methods: [], donations: EMPTY_DONATIONS };

// Whether the form has a Pay tab (packages or ways to pay) and a Donate tab.
export const hasPayment = (p: PaymentSettings) => p.packages.length > 0 || p.methods.length > 0;
export const canDonate = (p: PaymentSettings) => p.donations.enabled && p.methods.length > 0;

const MAX_SUGGESTED = 6;

export const newPaymentId = () => Math.random().toString(36).slice(2, 10);

export function newMethod(type: MethodType): PaymentMethod {
  return {
    id: newPaymentId(),
    type,
    currency: FIXED_CURRENCY[type] ?? 'USD',
    username: '',
    email: '',
    bank: '',
    accountType: 'savings',
    accountNumber: '',
    holder: '',
    idType: 'CC',
    idNumber: '',
    key: '',
    feePercent: type === 'paypal' ? 5.4 : 0,
    feeFixed: type === 'paypal' ? 0.3 : 0,
    instructions: '',
  };
}

const ID = /^[a-z0-9]{1,20}$/i;
const text = (v: unknown, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, max: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};
// Usernames as typed, without a leading @ or $ (Venmo, Revolut).
const handle = (v: unknown) => text(v).replace(/^[@$]+/, '').replace(/\s+/g, '');

export function cleanPayment(raw: unknown): PaymentSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const packages: PaymentPackage[] = [];
  for (const p of Array.isArray(r.packages) ? r.packages.slice(0, 30) : []) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (typeof o.id !== 'string' || !ID.test(o.id) || seen.has(o.id)) continue;
    seen.add(o.id);
    const prices: Record<string, number> = {};
    const rawPrices = (o.prices && typeof o.prices === 'object' ? o.prices : {}) as Record<string, unknown>;
    for (const c of CURRENCIES) {
      const n = num(rawPrices[c], 1e9);
      if (n > 0) prices[c] = n;
    }
    packages.push({ id: o.id, name: text(o.name), description: text(o.description, 1000), prices });
  }
  const types = new Set<MethodType>();
  const methods: PaymentMethod[] = [];
  for (const m of Array.isArray(r.methods) ? r.methods : []) {
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const type = o.type as MethodType;
    if (!METHOD_TYPES.includes(type) || types.has(type) || typeof o.id !== 'string' || !ID.test(o.id)) continue;
    types.add(type);
    const base = newMethod(type);
    const currency = FIXED_CURRENCY[type] ?? (CURRENCIES.includes(o.currency as never) ? (o.currency as string) : 'USD');
    methods.push({
      ...base,
      id: o.id,
      currency,
      username: type === 'bank_co' ? '' : handle(o.username),
      email: type === 'paypal' ? text(o.email) : '',
      ...(type === 'bank_co' && {
        bank: text(o.bank),
        accountType: o.accountType === 'checking' ? 'checking' : 'savings',
        accountNumber: text(o.accountNumber, 40),
        holder: text(o.holder),
        idType: ID_TYPES.includes(o.idType as never) ? (o.idType as string) : 'CC',
        idNumber: text(o.idNumber, 40),
        key: text(o.key),
      }),
      feePercent: type === 'paypal' ? num(o.feePercent, 50) : 0,
      feeFixed: type === 'paypal' ? num(o.feeFixed, 1e6) : 0,
      instructions: text(o.instructions, 1000),
    });
  }
  return { packages, methods, donations: cleanDonations(r.donations) };
}

function cleanDonations(raw: unknown): PaymentDonations {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawAmounts = (o.amounts && typeof o.amounts === 'object' ? o.amounts : {}) as Record<string, unknown>;
  const amounts: Record<string, number[]> = {};
  for (const c of CURRENCIES) {
    const list = Array.isArray(rawAmounts[c]) ? (rawAmounts[c] as unknown[]) : [];
    const clean = [...new Set(list.map((v) => num(v, 1e9)).filter((n) => n > 0))].slice(0, MAX_SUGGESTED);
    if (clean.length) amounts[c] = clean;
  }
  return { enabled: o.enabled === true, intro: text(o.intro, 1000), amounts };
}

// Whether a method is missing what players need to pay with it.
export function methodIncomplete(m: PaymentMethod): boolean {
  switch (m.type) {
    case 'venmo':
    case 'revolut':
      return !m.username;
    case 'paypal':
      return !m.username && !m.email;
    case 'bank_co':
      return !m.bank || !m.accountNumber || !m.holder;
  }
}

// The currencies the methods take, in the order they're listed (USD when there are none).
export function currenciesInUse(methods: PaymentMethod[]): string[] {
  const list = [...new Set(methods.map((m) => m.currency))];
  return list.length ? list : ['USD'];
}

const roundUp = (n: number, currency: string) => (WHOLE_UNITS.has(currency) ? Math.ceil(n) : Math.ceil(n * 100 - 1e-6) / 100);

// What to send with a method for a price in its currency, plus PayPal's fee on top
// ((price + fixed) / (1 - percent), so the fee leaves the whole price). Null without a price.
export function amountFor(m: PaymentMethod, price: number | null | undefined): { amount: number; fee: number } | null {
  if (!price || price <= 0) return null;
  if (m.type !== 'paypal' || (!m.feePercent && !m.feeFixed)) return { amount: roundUp(price, m.currency), fee: 0 };
  const amount = roundUp((price + m.feeFixed) / (1 - m.feePercent / 100), m.currency);
  return { amount, fee: Math.round((amount - price) * 100) / 100 };
}

// The same for a package: its price in the method's currency (null when it has none).
export const methodAmount = (m: PaymentMethod, pkg: PaymentPackage | null) => amountFor(m, pkg?.prices[m.currency]);

// The note sent with a payment, naming what it's for: "Worlds 2027 · Ann Lee · Full package".
export const paymentNote = (event: string, player: string, pkg: string | null) => [event, player, pkg].filter(Boolean).join(' · ');

// The amount as a link wants it: "120.00", or "450000" for COP.
const plainAmount = (amount: number, currency: string) => (WHOLE_UNITS.has(currency) ? String(Math.round(amount)) : amount.toFixed(2));

// Opens Venmo (the app on a phone) ready to pay: payee, amount and note filled in.
export function venmoLink(m: PaymentMethod, amount: number | null, note: string): string {
  const q = new URLSearchParams({ txn: 'pay', audience: 'private', recipients: m.username });
  if (amount) q.set('amount', plainAmount(amount, 'USD'));
  if (note) q.set('note', note);
  return `https://venmo.com/?${q.toString().replace(/\+/g, '%20')}`;
}

export const revolutLink = (m: PaymentMethod) => (m.username ? `https://revolut.me/${encodeURIComponent(m.username)}` : null);

// PayPal.me with the amount and currency filled in (PayPal.me can't carry a note).
export function paypalLink(m: PaymentMethod, amount: number | null): string | null {
  if (!m.username) return null;
  const base = `https://www.paypal.com/paypalme/${encodeURIComponent(m.username)}`;
  return amount ? `${base}/${plainAmount(amount, m.currency)}${m.currency}` : base;
}

export function formatMoney(intlLocale: string, amount: number, currency: string): string {
  const whole = WHOLE_UNITS.has(currency) || Number.isInteger(amount);
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

// A package's prices in the currencies in use: "US$120 · COP 450.000".
export const packagePrices = (intlLocale: string, pkg: PaymentPackage, currencies: string[]) =>
  currencies
    .filter((c) => pkg.prices[c])
    .map((c) => formatMoney(intlLocale, pkg.prices[c], c))
    .join(' · ');
