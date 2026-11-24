// Site settings. Nothing here is secret: the repo and site are public.

// Cloudflare Worker URL, e.g. 'https://kyle-energy-api.<you>.workers.dev'. Leave '' for preview mode,
// where the app reads data.json and saves only on this device.
export const API_BASE = '';

// VAPID public key from worker/gen-vapid.mjs. Public by design; the private half lives only in the Worker.
export const VAPID_PUBLIC_KEY = '';

// Sample data used in preview mode only.
export const DATA_URL = 'data.json';
