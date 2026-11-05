import { PUBLIC_APIS } from '@/lib/public-apis';
import { getT } from '@/lib/i18n/server';

// The public API: every endpoint with what it gives (from lib/public-apis.ts),
// how all of them behave, then the rate limit settings (passed in).
// `site` is the public site address, for the full URLs shown; the "open" links
// are relative, so they try this server (a laptop or dev server too).
export async function PublicApiSection({
  site,
  limitForms,
  limits,
}: {
  site: string;
  limitForms: React.ReactNode;
  limits: { perMinute: string; perDay: string; perMonth: string; windowSeconds: string };
}) {
  const t = await getT();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded border border-gray-300 p-3 text-sm">
        <div className="font-medium">{t.admin.apiBehaves}</div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
          <li>{t.admin.apiReadOnly}</li>
          <li>{t.admin.apiCors}</li>
          <li>{t.admin.apiCached}</li>
          <li>{t.admin.apiRateLimit(limits.perMinute, limits.windowSeconds, limits.perDay, limits.perMonth)}</li>
        </ul>
      </div>

      {PUBLIC_APIS.map((group) => (
        <div key={group.name} className="flex flex-col gap-3 rounded border border-gray-300 p-3">
          <div>
            <div className="font-medium">{group.name}</div>
            <p className="text-xs text-gray-500">{group.description}</p>
          </div>
          {group.endpoints.map((endpoint) => (
            <div key={endpoint.path} className="flex flex-col gap-1 rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <code className="break-all text-sm">
                  <span className="text-gray-500">GET {site}</span>
                  {endpoint.path}
                </code>
                {endpoint.example && (
                  <a href={endpoint.example} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-blue-600 underline">
                    {t.admin.open}
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-600">{endpoint.description}</p>
              <p className="text-xs text-gray-500">
                {t.admin.returns('')}<code className="break-words">{endpoint.returns}</code>
              </p>
            </div>
          ))}
        </div>
      ))}

      {limitForms}
    </section>
  );
}
