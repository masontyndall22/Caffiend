// Network calls. Returns plain data; never touches the DOM or state.
import { API_BASE, DATA_URL } from './config.js';

export const hasApi = () => Boolean(API_BASE);

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(API_BASE.replace(/\/+$/, '') + path, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No connection. Try again when you have signal.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

// Preview mode only: the bundled sample file.
export async function fetchSnapshot() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data.json HTTP ${res.status}`);
  return res.json();
}

export const fetchRatings = () => call('GET', '/api/ratings');

// original is the rating being edited (needs its id), or null for a new one.
// endpoint is this device's push endpoint, so it doesn't notify itself.
export function saveRating(entry, pin, original, endpoint) {
  const body = { ...entry, pin, endpoint };
  return original ? call('PUT', `/api/ratings/${original.id}`, body) : call('POST', '/api/ratings', body);
}

export const pushSubscribe = (subscription) => call('POST', '/api/push/subscribe', { subscription });
export const pushUnsubscribe = (endpoint) => call('POST', '/api/push/unsubscribe', { endpoint });
export const pushTest = (pin, endpoint) => call('POST', '/api/push/test', { pin, endpoint });
