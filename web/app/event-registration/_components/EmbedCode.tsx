'use client';

import { useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/locales';
import { cleanStyle, type FormStyle, type PublicForm } from '@/lib/registration';
import { saveStyle, type MyRegistrationState } from '@/lib/registration-actions';
import { HEIGHT_MESSAGE, RegistrationForm } from '@/app/_components/registration/RegistrationForm';

const noSubscribe = () => () => {};

// The Embed tab: how the form looks on the tournament's site, and the code to paste there.
export function EmbedCode({ form }: { form: PublicForm }) {
  const tr = useT().eventRegistration;
  const router = useRouter();
  const [style, setStyle] = useState<FormStyle>(form.style);
  const [savedStyle, setSavedStyle] = useState(JSON.stringify(form.style));
  const [lang, setLang] = useState<Locale | ''>('');
  const [kind, setKind] = useState<'iframe' | 'link'>('iframe');
  const [signedInPreview, setSignedInPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The address the code points at: this site, as the person copying it sees it.
  // (Empty on the server, which can't know it.)
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => ''
  );
  const dirty = JSON.stringify(style) !== savedStyle;

  const change = (c: Partial<FormStyle>) => {
    setStyle((s) => ({ ...s, ...c }));
    setCopied(false);
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveStyle(form.id, style);
      setError(result.error);
      if (result.error) return;
      setSavedStyle(JSON.stringify(cleanStyle(style)));
      router.refresh();
    });

  const query = lang ? `?lang=${lang}` : '';
  const embedUrl = `${origin}/embed/register/${form.id}${query}`;
  const pageUrl = `${origin}/register/${form.id}`;
  const frameId = `fft-registration-${form.id.slice(0, 8)}`;
  const code =
    kind === 'link'
      ? pageUrl
      : `<iframe id="${frameId}" src="${embedUrl}" title="${(form.title || form.eventName).replace(/"/g, '&quot;')}" style="width:100%;max-width:680px;height:640px;border:0;" loading="lazy"></iframe>
<script>
  // Sizes the form to fit as it changes.
  window.addEventListener('message', function (e) {
    if (e.origin !== '${origin}' || !e.data || e.data.type !== '${HEIGHT_MESSAGE}' || e.data.formId !== '${form.id}') return;
    document.getElementById('${frameId}').style.height = e.data.height + 'px';
  });
</script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const preview = useMemo<PublicForm>(() => ({ ...form, isOpen: true, style }), [form, style]);
  const previewState = useMemo<MyRegistrationState>(
    () =>
      signedInPreview
        ? { signedIn: true, registrant: { playerId: 'preview', name: tr.previewName, email: null }, registration: null, invites: [], names: {} }
        : { signedIn: false, registrant: null, registration: null, invites: [], names: {} },
    [signedInPreview, tr.previewName]
  );

  const label = 'flex flex-col gap-1 text-sm';
  const toggleBtn = (active: boolean) => `cursor-pointer px-3 py-1 ${active ? 'bg-gray-800 text-white' : 'hover:bg-gray-50'}`;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        {!form.isOpen && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{tr.formClosedWarning}</p>}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tr.look}</h2>
          <div className="flex flex-wrap gap-6">
            <label className={label}>
              <span>{tr.accentColour}</span>
              <input type="color" value={style.accent} onChange={(e) => change({ accent: e.target.value })} className="h-9 w-16 cursor-pointer" />
            </label>
            <div className={label}>
              <span>{tr.theme}</span>
              <div role="group" className="flex overflow-hidden rounded border border-gray-300 text-xs">
                {(['light', 'dark'] as const).map((th) => (
                  <button key={th} type="button" aria-pressed={style.theme === th} onClick={() => change({ theme: th })} className={toggleBtn(style.theme === th)}>
                    {tr.themes[th]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className={label}>
            <span>{tr.buttonText}</span>
            <input
              value={style.buttonText}
              onChange={(e) => change({ buttonText: e.target.value })}
              placeholder={tr.register}
              className="w-64 rounded border border-gray-300 px-3 py-1.5 text-sm"
              maxLength={60}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={style.showEventInfo} onChange={(e) => change({ showEventInfo: e.target.checked })} />
            {tr.showEventInfo}
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-default disabled:opacity-50"
            >
              {pending ? tr.saving : tr.save}
            </button>
            {dirty && <span className="text-xs text-amber-700">{tr.unsavedLook}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tr.embedCode}</h2>
          <div className="flex flex-wrap gap-6">
            <div className={label}>
              <span>{tr.codeKind}</span>
              <div role="group" className="flex overflow-hidden rounded border border-gray-300 text-xs">
                {(['iframe', 'link'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={toggleBtn(kind === k)}>
                    {tr.codeKinds[k]}
                  </button>
                ))}
              </div>
            </div>
            {kind === 'iframe' && (
              <label className={label}>
                <span>{tr.language}</span>
                <select value={lang} onChange={(e) => setLang(e.target.value as Locale | '')} className="rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">{tr.languageAuto}</option>
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_NAMES[l]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="text-xs text-gray-500">{kind === 'iframe' ? tr.iframeHelp : tr.linkHelp}</p>
          <pre className="overflow-x-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs">
            <code>{origin ? code : ''}</code>
          </pre>
          <div className="flex items-center gap-3">
            <button type="button" onClick={copy} disabled={!origin} className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
              {copied ? tr.copied : tr.copyCode}
            </button>
            <a href={kind === 'iframe' ? embedUrl : pageUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
              {tr.openInNewTab}
            </a>
          </div>
          {dirty && <p className="text-xs text-amber-700">{tr.codeUsesSaved}</p>}
        </section>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{tr.preview}</h2>
          <div role="group" className="flex overflow-hidden rounded border border-gray-300 text-xs">
            {[false, true].map((s) => (
              <button key={String(s)} type="button" aria-pressed={signedInPreview === s} onClick={() => setSignedInPreview(s)} className={toggleBtn(signedInPreview === s)}>
                {s ? tr.previewSignedIn : tr.previewVisitor}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-100 p-4 lg:sticky lg:top-12">
          {/* inert: the preview's buttons and links don't go anywhere. */}
          <div inert>
            <RegistrationForm key={String(signedInPreview)} form={preview} initial={previewState} mode="preview" />
          </div>
        </div>
      </div>
    </div>
  );
}
