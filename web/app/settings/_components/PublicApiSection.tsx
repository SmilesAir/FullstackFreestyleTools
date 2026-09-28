import { PUBLIC_APIS } from '@/lib/public-apis';

// The public API: every endpoint with what it gives (from lib/public-apis.ts),
// how all of them behave, then the rate limit settings (passed in).
// `site` is the public site address, for the full URLs shown; the "open" links
// are relative, so they try this server (a laptop or dev server too).
export function PublicApiSection({
  site,
  limitForms,
  limits,
}: {
  site: string;
  limitForms: React.ReactNode;
  limits: { perMinute: string; perDay: string; perMonth: string; windowSeconds: string };
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Public API</h2>

      <div className="flex flex-col gap-2 rounded border border-gray-300 p-3 text-sm">
        <div className="font-medium">How every endpoint behaves</div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
          <li>Read-only GET requests, no login needed.</li>
          <li>Any website can call them from a browser (CORS allows every origin).</li>
          <li>
            Cached for about 10 minutes by the CDN, so most calls never reach the database and a new publish can take up to 10 minutes to
            show.
          </li>
          <li>
            Rate limited per IP address to {limits.perMinute} calls every {limits.windowSeconds} seconds and {limits.perDay} a day, and to{' '}
            {limits.perMonth} calls a month from everyone together (the settings below). A refused call gets HTTP 429 with Retry-After;
            every answer carries X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset.
          </li>
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
                    open ↗
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-600">{endpoint.description}</p>
              <p className="text-xs text-gray-500">
                Returns: <code className="break-words">{endpoint.returns}</code>
              </p>
            </div>
          ))}
        </div>
      ))}

      {limitForms}
    </section>
  );
}
