// Hash-based tab switching.
import { $$ } from './dom.js';
import { setRoute, subscribe } from './state.js';

const ROUTES = ['lineup', 'rate', 'pick'];

function current() {
  const r = location.hash.replace('#', '');
  return ROUTES.includes(r) ? r : 'lineup';
}

function show(route) {
  $$('[data-page]').forEach((p) => { p.hidden = p.dataset.page !== route; });
  $$('[data-tab]').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === route));
  window.scrollTo({ top: 0 });
}

export function initNav() {
  subscribe((s, patch) => { if ('route' in patch) show(s.route); });
  window.addEventListener('hashchange', () => setRoute(current()));
  setRoute(current());
  show(current());
}

export const go = (route) => { location.hash = route; };
