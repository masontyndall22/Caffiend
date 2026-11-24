// Entry point: register the service worker, wire pages, load data.
import { initNav } from './nav.js';
import { load } from './state.js';
import { initLineup } from './pages/lineup.js';
import { initRate } from './pages/rate.js';
import { initPick } from './pages/pick.js';
import { initAlerts } from './pages/alerts.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

initLineup();
initRate();
initPick();
initAlerts();
initNav();
load();

// Refresh when the app comes back to the foreground (common on phones).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });

// A tapped notification, or a push while the app is open, should show the newest ratings.
navigator.serviceWorker?.addEventListener('message', () => load());
