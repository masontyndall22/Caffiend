/**
 * Caffiend API: a Cloudflare Worker with a D1 (SQLite) database. No dependencies.
 *
 *   GET  /api/ratings                 all ratings
 *   POST /api/ratings                 add one        {pin, brand, flavor, rating, note, caffeine?, date?, endpoint?}
 *   PUT  /api/ratings/:id             edit one       {pin, brand, flavor, rating, note, endpoint?}
 *   POST /api/ratings/:id/like        like / unlike  {name, liked}   (no PIN: likes are low-stakes)
 *   POST /api/push/subscribe          save a device  {subscription}
 *   POST /api/push/unsubscribe        forget a device {endpoint}
 *   POST /api/push/test               push to one device {pin, endpoint}
 *
 * Writes return the full rating list so the app can update without a second request.
 * After a save, every subscribed device except the one that saved gets a web push.
 * Stores raw ratings only; averages and sorting stay in the front end (js/derive.js).
 */

const MAX = { brand: 40, flavor: 60, note: 140, name: 24 };

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env, ctx);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err.status || 500;
      return json({ ok: false, error: status === 500 ? 'Server error' : err.message }, status, cors);
    }
  },
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const m = request.method;

  if (m === 'GET' && path === '/api/ratings') return json({ ok: true, ...(await snapshot(env)) });

  if (m === 'POST' && path === '/api/ratings') {
    const body = await readBody(request);
    checkPin(body, env);
    const saved = await addRating(env, clean(body));
    ctx.waitUntil(notifyAll(env, saved, true, body.endpoint));
    return json({ ok: true, saved, ...(await snapshot(env)) }, 201);
  }

  const edit = path.match(/^\/api\/ratings\/(\d+)$/);
  if (m === 'PUT' && edit) {
    const body = await readBody(request);
    checkPin(body, env);
    const saved = await editRating(env, Number(edit[1]), clean(body));
    ctx.waitUntil(notifyAll(env, saved, false, body.endpoint));
    return json({ ok: true, saved, ...(await snapshot(env)) });
  }

  const like = path.match(/^\/api\/ratings\/(\d+)\/like$/);
  if (m === 'POST' && like) {
    const body = await readBody(request);
    const name = norm(body.name).slice(0, MAX.name);
    if (!name) fail(400, 'Add your name first.');
    const id = Number(like[1]);
    const exists = await env.DB.prepare('SELECT id FROM ratings WHERE id = ?').bind(id).first();
    if (!exists) fail(404, 'That rating no longer exists. Refresh and try again.');
    if (body.liked) {
      await env.DB.prepare(
        `INSERT INTO likes (rating_id, liker, liker_key, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(rating_id, liker_key) DO NOTHING`,
      ).bind(id, name, keyOf(name), new Date().toISOString()).run();
    } else {
      await env.DB.prepare('DELETE FROM likes WHERE rating_id = ? AND liker_key = ?').bind(id, keyOf(name)).run();
    }
    return json({ ok: true, ...(await snapshot(env)) });
  }

  if (m === 'POST' && path === '/api/push/subscribe') {
    const { subscription: s } = await readBody(request);
    if (!s?.endpoint?.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) fail(400, 'Bad subscription');
    await env.DB.prepare(
      `INSERT INTO push_subs (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    ).bind(s.endpoint, s.keys.p256dh, s.keys.auth, new Date().toISOString()).run();
    return json({ ok: true });
  }

  if (m === 'POST' && path === '/api/push/unsubscribe') {
    const { endpoint } = await readBody(request);
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(String(endpoint || '')).run();
    return json({ ok: true });
  }

  if (m === 'POST' && path === '/api/push/test') {
    const body = await readBody(request);
    checkPin(body, env);
    const sub = await env.DB.prepare('SELECT * FROM push_subs WHERE endpoint = ?').bind(String(body.endpoint || '')).first();
    if (!sub) fail(404, 'This device is not subscribed yet.');
    const r = await sendPush(env, sub, { title: 'Caffiend', body: 'Notifications are working. Stay wired. ⚡', url: './#lineup', tag: 'test' });
    if (!r.ok) fail(502, `Push service said ${r.status}`);
    return json({ ok: true });
  }

  fail(404, 'Not found');
}

// ---------- Ratings ----------

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const keyOf = (s) => norm(s).toLowerCase();

function clean(body) {
  const brand = norm(body.brand).slice(0, MAX.brand);
  const flavor = norm(body.flavor).slice(0, MAX.flavor);
  const note = norm(body.note).slice(0, MAX.note);
  const n = Number(body.rating);
  if (!brand || !flavor) fail(400, 'Brand and flavor are required.');
  if (!Number.isFinite(n) || n < 0 || n > 10) fail(400, 'Rating must be 0.0 to 10.0.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10);
  let caffeine = null; // mg per can, optional
  if (body.caffeine !== undefined && body.caffeine !== null && String(body.caffeine).trim() !== '') {
    caffeine = Math.round(Number(body.caffeine));
    if (!Number.isFinite(caffeine) || caffeine < 0 || caffeine > 1000) fail(400, 'Caffeine must be 0 to 1000 mg.');
  }
  return { brand, flavor, note, score10: Math.round(n * 10), date, caffeine };
}

// Reuse the existing spelling when the brand already exists ("ghost" -> "Ghost").
async function canonicalBrand(env, brand, exceptId = 0) {
  const row = await env.DB.prepare('SELECT brand FROM ratings WHERE brand_key = ? AND id != ? ORDER BY id LIMIT 1')
    .bind(keyOf(brand), exceptId).first();
  return row ? row.brand : brand;
}

async function duplicate(env, brand, flavor, exceptId = 0) {
  return env.DB.prepare('SELECT * FROM ratings WHERE brand_key = ? AND flavor_key = ? AND id != ?')
    .bind(keyOf(brand), keyOf(flavor), exceptId).first();
}

function dupError(row) {
  fail(409, `${row.brand} ${row.flavor} is already rated ${(row.score10 / 10).toFixed(1)}. Edit that one instead.`);
}

async function addRating(env, r) {
  const brand = await canonicalBrand(env, r.brand);
  const dup = await duplicate(env, brand, r.flavor);
  if (dup) dupError(dup);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO ratings (brand, flavor, brand_key, flavor_key, score10, rated_on, note, updated_at, caffeine_mg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).bind(brand, r.flavor, keyOf(brand), keyOf(r.flavor), r.score10, r.date, r.note, now, r.caffeine).first();
    return toApi(row);
  } catch (err) {
    // Two phones saving the same flavor at once: the UNIQUE index catches the second.
    if (/UNIQUE/i.test(String(err.message))) dupError(await duplicate(env, brand, r.flavor));
    throw err;
  }
}

async function editRating(env, id, r) {
  const existing = await env.DB.prepare('SELECT * FROM ratings WHERE id = ?').bind(id).first();
  if (!existing) fail(404, 'That rating no longer exists. Refresh and try again.');
  const brand = await canonicalBrand(env, r.brand, id);
  const dup = await duplicate(env, brand, r.flavor, id);
  if (dup) dupError(dup);
  const row = await env.DB.prepare(
    `UPDATE ratings SET brand = ?, flavor = ?, brand_key = ?, flavor_key = ?, score10 = ?, note = ?, caffeine_mg = ?, updated_at = ?
     WHERE id = ? RETURNING *`,
  ).bind(brand, r.flavor, keyOf(brand), keyOf(r.flavor), r.score10, r.note, r.caffeine, new Date().toISOString(), id).first();
  return toApi(row); // rated_on is kept from the first rating
}

const toApi = (row, likes = []) => ({
  id: row.id, brand: row.brand, flavor: row.flavor, rating: row.score10 / 10, date: row.rated_on, note: row.note,
  caffeine: row.caffeine_mg ?? null, likes,
});

async function snapshot(env) {
  const [{ results }, { results: likeRows }] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM ratings ORDER BY brand_key, flavor_key'),
    env.DB.prepare('SELECT rating_id, liker FROM likes ORDER BY created_at'),
  ]);
  const likes = new Map();
  for (const l of likeRows) likes.set(l.rating_id, [...(likes.get(l.rating_id) || []), l.liker]);
  const updated = results.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '') || null;
  return { updated, ratings: results.map((r) => toApi(r, likes.get(r.id) || [])) };
}

// ---------- Push fan-out ----------

async function notifyAll(env, saved, isNew, skipEndpoint) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;
  const { results } = await env.DB.prepare('SELECT * FROM push_subs').all();
  const msg = {
    title: isNew ? `New rating: ${saved.brand}` : `Rating updated: ${saved.brand}`,
    body: `${saved.flavor} scored ${saved.rating.toFixed(1)}/10${Number.isFinite(saved.caffeine) ? ` · ${saved.caffeine} mg` : ''}${saved.note ? ` · “${saved.note}”` : ''}`,
    url: './#lineup',
    tag: `rating-${saved.id}`,
  };
  await Promise.all(results.filter((s) => s.endpoint !== skipEndpoint).map(async (s) => {
    const r = await sendPush(env, s, msg).catch(() => ({ ok: false, status: 0 }));
    // 404/410 mean the device unsubscribed or the app was removed: forget it.
    if (r.status === 404 || r.status === 410) {
      await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
    }
  }));
}

// ---------- Web Push (RFC 8291 encryption + RFC 8292 VAPID), Web Crypto only ----------

const enc = new TextEncoder();
const b64uEncode = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDecode = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

async function vapidHeader(env, endpoint) {
  const pub = b64uDecode(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY,
    x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), ext: true,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'https://github.com/',
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64uEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function encryptPayload(sub, plaintext) {
  const uaPublic = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(enc.encode(plaintext), new Uint8Array([2])); // 0x02 = last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

async function sendPush(env, sub, message) {
  const body = await encryptPayload(sub, JSON.stringify(message));
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });
}

// ---------- Helpers ----------

function fail(status, message) { throw Object.assign(new Error(message), { status }); }

function checkPin(body, env) {
  if (!env.CREW_PIN || String(body.pin || '') !== String(env.CREW_PIN)) fail(401, 'Wrong crew PIN. Check “Settings & notifications” at the bottom of the Rate tab.');
}

async function readBody(request) {
  try { return await request.json(); } catch { fail(400, 'Bad request body'); }
}

function corsHeaders(request, env) {
  const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
  // Origins only (scheme + host), e.g. https://user.github.io. A trailing slash is tolerated.
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || '*'),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
