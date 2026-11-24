// Service worker: cache-first app shell, network-first data.json, and web push display.
// Bump VERSION whenever a shell file changes so installed apps pick up the update.
const VERSION = 'ke-v4';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.json',
  'js/app.js', 'js/config.js', 'js/dom.js', 'js/format.js', 'js/derive.js',
  'js/api.js', 'js/push.js', 'js/state.js', 'js/nav.js',
  'js/pages/lineup.js', 'js/pages/rate.js', 'js/pages/pick.js', 'js/pages/alerts.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API, fonts: straight to network

  if (url.pathname.endsWith('/data.json')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('data.json', copy));
        return res;
      }).catch(() => caches.match('data.json')),
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)),
  );
});

// ---- Push ----

self.addEventListener('push', (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(msg.title || 'Kyle Energy', {
    body: msg.body || 'A new can was rated.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: msg.tag,
    data: { url: msg.url || './#lineup' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) { await win.focus(); return win.navigate(target).catch(() => {}); }
    return self.clients.openWindow(target);
  })());
});
