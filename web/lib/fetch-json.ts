// Reads JSON from the server, giving up after `timeoutMs`. A phone's connection
// can leave a request waiting forever (after the screen wakes or the network
// changes), and a poller that waits for its last request would then never ask
// again. The timeout covers reading the whole answer. Throws on a timeout, a
// failed request or an error status, which is what the pollers treat as "no
// connection".
export async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
