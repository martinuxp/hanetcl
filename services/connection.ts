const TIMEOUT_MS = 8000;
// Any callable answers a request without a session with 401 when the servers are up.
const SERVER_PROBE = 'https://us-central1-hanet-edu.cloudfunctions.net/syncMyClaims';
// Answers whenever there is internet at all.
const INTERNET_PROBE = 'https://www.gstatic.com/generate_204';

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function hasInternet() {
  try {
    await fetchWithTimeout(INTERNET_PROBE, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether HaNet can reach its servers: 'ok', 'offline' (no internet on the
 * phone) or 'server' (internet works but the servers fail or do not answer).
 */
export async function checkConnection(): Promise<'ok' | 'offline' | 'server'> {
  try {
    const response = await fetchWithTimeout(SERVER_PROBE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"data":{}}',
      cache: 'no-store',
    });
    return response.status >= 500 ? 'server' : 'ok';
  } catch {
    return (await hasInternet()) ? 'server' : 'offline';
  }
}
