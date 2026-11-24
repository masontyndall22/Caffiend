// The only module that writes state. Pages read via get() and react via subscribe().
import * as api from './api.js';
import * as push from './push.js';
import { key, findRating, replaceRating, norm } from './derive.js';

const PIN_KEY = 'ke.pin';
const NAME_KEY = 'ke.name';                // display name used for likes
const CACHE_KEY = 'ke.cache';             // last ratings from the API, for offline starts
const PREVIEW_KEY = 'ke.previewRatings';  // preview mode only (no API_BASE)
const SEEN_KEY = 'ke.seen';               // ratings this phone has viewed in the Lineup (for the NEW badge)

const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const readJson = (k) => { try { return JSON.parse(read(k) || 'null'); } catch { return null; } };

let state = {
  ratings: [],
  updated: null,
  loading: true,
  error: null,
  route: 'lineup',
  pin: read(PIN_KEY) || '',
  name: read(NAME_KEY) || '',
  settingsOpen: false,
  editing: null, // rating open in the Rate form ({id?, brand, flavor, rating, date, note}), or null
  push: { status: 'checking', endpoint: null, busy: false }, // status: on | off | denied | needs-install | unsupported | not-configured
};
const subs = new Set();

// ---------- "New" ratings (per phone) ----------
// A rating is new until this phone has had it on screen in the Lineup. The first time the app runs with this
// feature, everything already rated counts as seen, so only ratings added after that light up.
const ratingId = (r) => (r.id != null ? `i${r.id}` : `k${key(r.brand, r.flavor)}`);
let seen = (() => { const a = readJson(SEEN_KEY); return Array.isArray(a) ? new Set(a) : null; })();
const saveSeen = () => store(SEEN_KEY, JSON.stringify([...seen]));
export const isNew = (r) => Boolean(seen) && !seen.has(ratingId(r));
export const newCount = (ratings = state.ratings) => ratings.filter(isNew).length;
// rerender: true also redraws the Lineup (used after this phone's own save, so it never shows as new)
export function markSeen(list, { rerender = false } = {}) {
  const fresh = list.filter(isNew);
  if (!fresh.length) return;
  fresh.forEach((r) => seen.add(ratingId(r)));
  saveSeen();
  set(rerender ? { seenAt: Date.now(), ratings: state.ratings } : { seenAt: Date.now() });
}
function baselineSeen(ratings) {
  if (seen) {
    // forget ids that no longer exist so the list doesn't grow forever
    const live = new Set(ratings.map(ratingId));
    if ([...seen].some((id) => !live.has(id)) && ratings.length) { seen = new Set([...seen].filter((id) => live.has(id))); saveSeen(); }
    return;
  }
  seen = new Set(ratings.map(ratingId));
  saveSeen();
}

export const get = () => state;
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function set(patch) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn(state, patch));
}

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- Ratings ----------

function applyRatings(snap) {
  const ratings = Array.isArray(snap?.ratings) ? snap.ratings : [];
  if (ratings.length) baselineSeen(ratings);
  set({ ratings, updated: snap?.updated || null, loading: false, error: null });
  if (api.hasApi()) store(CACHE_KEY, JSON.stringify({ ratings, updated: snap?.updated || null }));
}

export async function load() {
  if (!state.ratings.length) {
    const cached = api.hasApi() ? readJson(CACHE_KEY) : null;
    if (cached) applyRatings(cached); else set({ loading: true });
  }
  try {
    if (api.hasApi()) {
      applyRatings(await api.fetchRatings());
    } else {
      const snap = await api.fetchSnapshot();
      applyRatings({ ...snap, ratings: readJson(PREVIEW_KEY) || snap.ratings });
    }
  } catch (e) {
    set({ loading: false, error: e.message });
  }
}

export function setRoute(route) { if (route !== state.route) set({ route }); }

export function setPin(pin) {
  store(PIN_KEY, pin || null);
  set({ pin });
}

export function setName(name) {
  const n = norm(name).slice(0, 24);
  store(NAME_KEY, n || null);
  set({ name: n });
}

export function openSettings() { set({ settingsOpen: true }); }
export function closeSettings() { if (state.settingsOpen) set({ settingsOpen: false }); }

// ---------- Likes (by display name, no accounts) ----------

export const likedByMe = (r) => Boolean(state.name) && (r.likes || []).some((n) => n.toLowerCase() === state.name.toLowerCase());

export async function toggleLike(r) {
  if (!state.name) throw Object.assign(new Error('Add your name first so your likes are yours.'), { needsName: true });
  const liked = !likedByMe(r);
  const me = state.name;
  const k = key(r.brand, r.flavor);
  const nextLikes = liked ? [...(r.likes || []), me] : (r.likes || []).filter((n) => n.toLowerCase() !== me.toLowerCase());
  const before = state.ratings;
  const ratings = state.ratings.map((x) => (key(x.brand, x.flavor) === k ? { ...x, likes: nextLikes } : x));
  set({ ratings }); // optimistic
  if (!api.hasApi()) { store(PREVIEW_KEY, JSON.stringify(ratings)); return liked; }
  try {
    applyRatings(await api.setLike(r.id, me, liked));
  } catch (e) {
    set({ ratings: before });
    throw e;
  }
  return liked;
}

export function startEdit(brand, flavor) {
  const hit = findRating(state.ratings, brand, flavor);
  if (hit) set({ editing: { ...hit } });
}
export function cancelEdit() { if (state.editing) set({ editing: null }); }

// entry: {brand, flavor, rating, note}, already cleaned by the form. Throws with a readable message.
export async function saveRating(entry) {
  const original = state.editing;
  const full = { ...entry, date: original?.date || localDate() };

  // Duplicate guard (the form and the database check too).
  const clash = findRating(state.ratings, full.brand, full.flavor);
  if (clash && (!original || key(clash.brand, clash.flavor) !== key(original.brand, original.flavor))) {
    throw new Error(`${clash.brand} ${clash.flavor} is already rated ${clash.rating.toFixed(1)}.`);
  }

  if (!api.hasApi()) {
    const ratings = original ? replaceRating(state.ratings, original, { ...full, likes: original.likes || [] }) : [...state.ratings, { ...full, likes: [] }];
    store(PREVIEW_KEY, JSON.stringify(ratings));
    set({ ratings, editing: null });
    markSeen(ratings.filter((r) => key(r.brand, r.flavor) === key(full.brand, full.flavor)), { rerender: true });
    return { preview: true, edited: Boolean(original) };
  }
  if (!state.pin) throw Object.assign(new Error('Enter the crew PIN first: tap the bell in the top right.'), { needsPin: true });
  const res = await api.saveRating(full, state.pin, original, state.push.endpoint);
  applyRatings(res);
  set({ editing: null });
  markSeen(state.ratings.filter((r) => key(r.brand, r.flavor) === key(full.brand, full.flavor)), { rerender: true });
  return { preview: false, edited: Boolean(original) };
}

// ---------- Push notifications ----------

function setPush(patch) { set({ push: { ...state.push, ...patch } }); }

export async function refreshPush() {
  const s = push.support();
  if (s !== 'ok' || !api.hasApi()) {
    setPush({ status: s === 'ok' ? 'not-configured' : s, endpoint: null });
    return;
  }
  if (push.permission() === 'denied') { setPush({ status: 'denied', endpoint: null }); return; }
  const sub = await push.currentSubscription().catch(() => null);
  setPush({ status: sub ? 'on' : 'off', endpoint: sub?.endpoint || null });
  if (sub) api.pushSubscribe(sub.toJSON()).catch(() => {}); // re-register in case the server forgot it
}

export async function enablePush() {
  setPush({ busy: true });
  try {
    const sub = await push.subscribe();
    await api.pushSubscribe(sub.toJSON());
    setPush({ status: 'on', endpoint: sub.endpoint });
  } catch (e) {
    if (push.permission() === 'denied') setPush({ status: 'denied' });
    throw e;
  } finally {
    setPush({ busy: false });
  }
}

export async function disablePush() {
  setPush({ busy: true });
  try {
    const endpoint = await push.unsubscribe();
    if (endpoint) await api.pushUnsubscribe(endpoint).catch(() => {});
    setPush({ status: 'off', endpoint: null });
  } finally {
    setPush({ busy: false });
  }
}

export async function testPush() {
  if (!state.pin) throw Object.assign(new Error('Enter the crew PIN first: tap the bell in the top right.'), { needsPin: true });
  if (!state.push.endpoint) throw new Error('Turn on alerts first.');
  await api.pushTest(state.pin, state.push.endpoint);
}
