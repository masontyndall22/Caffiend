// Landing page: every rated drink, grouped by brand.
import { $, $$, h, clear, toast } from '../dom.js';
import { get, subscribe, startEdit, toggleLike, likedByMe, openSettings, isNew, newCount, markSeen } from '../state.js';
import { groupByBrand, totals } from '../derive.js';
import { fmtScore, tier, fmtDate, plural, fmtMg, fmtBrandMg } from '../format.js';

const open = new Set(); // which brand cards are expanded (view-only, not app state)
let firstRender = true;

// NEW badges: a new flavor row counts as viewed once it has been at least 60% on screen for VIEW_MS.
// Then it is marked seen (saved on this phone) and its highlight fades out.
const VIEW_MS = 1200;
const rowRating = new WeakMap();
const timers = new WeakMap();
const viewer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    const row = e.target;
    if (e.isIntersecting && document.visibilityState === 'visible') {
      if (!timers.has(row)) timers.set(row, setTimeout(() => seeRow(row), VIEW_MS));
    } else if (timers.has(row)) {
      clearTimeout(timers.get(row)); timers.delete(row);
    }
  }
}, { threshold: 0.6 }) : null;

function seeRow(row) {
  timers.delete(row);
  viewer?.unobserve(row);
  row.classList.add('was-seen');
  const card = row.closest('.brand');
  const left = card?.querySelectorAll('.flavor.is-new:not(.was-seen)').length || 0;
  const pill = card?.querySelector('.new-pill');
  if (pill) { if (left) pill.textContent = `${left} new`; else pill.classList.add('was-seen'); }
  if (card && !left) card.classList.add('was-seen');
  markSeen([rowRating.get(row)]);
}

const chev = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'chev');
  s.innerHTML = '<path d="m6 9 6 6 6-6"/>';
  return s;
};

const heart = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/>';
  return svg;
};

async function onLike(f) {
  try {
    await toggleLike(f);
  } catch (e) {
    toast(e.message, 3500);
    if (e.needsName) openSettings();
  }
}

function flavorRow(f) {
  const likes = f.likes || [];
  const mine = likedByMe(f);
  const fresh = isNew(f);
  const row = h('li', { class: `flavor${fresh ? ' is-new' : ''}` },
    h('div', { class: 'flavor-name' }, f.flavor, Number.isFinite(f.caffeine) ? h('span', { class: 'mg', text: fmtMg(f.caffeine) }) : null,
      fresh ? h('span', { class: 'new-badge', text: 'New' }) : null),
    h('div', { class: `score ${tier(f.rating)}`, text: fmtScore(f.rating) }),
    h('div', { class: 'flavor-date', text: fmtDate(f.date) }),
    f.note ? h('div', { class: 'flavor-note', text: `“${f.note}”` }) : null,
    h('div', { class: 'bar' }, h('i', { class: tier(f.rating), style: `width:${f.rating * 10}%` })),
    h('div', { class: 'flavor-actions' },
      h('button', {
        type: 'button', class: `like${mine ? ' is-on' : ''}`, 'aria-pressed': String(mine),
        'aria-label': `${mine ? 'Unlike' : 'Like'} ${f.brand} ${f.flavor}`,
        onclick: () => onLike(f),
      }, heart(), likes.length ? String(likes.length) : 'Like'),
      likes.length ? h('span', { class: 'likers', text: likes.join(', ') }) : null,
      h('button', {
        type: 'button', class: 'flavor-edit', text: 'Edit', 'aria-label': `Edit ${f.brand} ${f.flavor}`,
        onclick: () => startEdit(f.brand, f.flavor),
      }),
    ),
  );
  if (fresh) { rowRating.set(row, f); viewer?.observe(row); }
  return row;
}

function brandCard(b, forceOpen) {
  const isOpen = forceOpen || open.has(b.name);
  const fresh = b.flavors.filter(isNew).length;
  const card = h('article', { class: `brand${isOpen ? ' is-open' : ''}${fresh ? ' has-new' : ''}` });
  const head = h('button', {
    class: 'brand-head', type: 'button', 'aria-expanded': String(isOpen),
    onclick: () => {
      const now = !card.classList.contains('is-open');
      card.classList.toggle('is-open', now);
      head.setAttribute('aria-expanded', String(now));
      now ? open.add(b.name) : open.delete(b.name);
    },
  },
    h('div', { class: 'brand-name' }, b.name, fresh ? h('span', { class: 'new-pill', text: `${fresh} new` }) : null),
    h('div', { class: 'brand-meta', text: [plural(b.count, 'can'), fmtBrandMg(b.caffeine)].filter(Boolean).join(' · ') }),
    h('div', { class: `brand-avg ${tier(b.avg)}`, text: fmtScore(b.avg) }),
    chev(),
  );
  card.append(head, h('ul', { class: 'flavors' }, b.flavors.map(flavorRow)));
  return card;
}

function render() {
  const s = get();
  const list = $('brand-list');
  const sub = $('lineup-sub');
  const t = totals(s.ratings);
  $('headline-stat').textContent = s.ratings.length ? `${t.cans} cans · avg ${fmtScore(t.avg)}` : '';

  if (s.loading && !s.ratings.length) { sub.textContent = 'Loading…'; return; }
  if (s.error && !s.ratings.length) { sub.textContent = `Couldn't load ratings: ${s.error}`; return; }

  sub.textContent = subText();
  const query = $('search').value;
  const brands = groupByBrand(s.ratings, { sort: $('sort').value, query });

  if (firstRender && brands[0]) { open.add(brands[0].name); firstRender = false; }
  viewer?.disconnect();
  clear(list);
  if (!brands.length) {
    list.append(h('div', { class: 'empty' }, query ? 'No matches.' : 'Nothing rated yet. Crack one open and hit Rate.'));
    return;
  }
  list.append(...brands.map((b) => brandCard(b, Boolean(query))));
}

function subText() {
  const t = totals(get().ratings), fresh = newCount();
  return `${plural(t.brands, 'brand')}, ${plural(t.cans, 'flavor')} rated${fresh ? ` · ${fresh} new` : ''}`;
}

// Lime count on the Lineup tab while this phone has unseen ratings.
function renderTabDot() {
  const n = newCount();
  const s = get();
  if (s.ratings.length && !(s.loading && !s.ratings.length)) $('lineup-sub').textContent = subText();
  $$('[data-tab="lineup"]').forEach((t) => { t.classList.toggle('has-new', n > 0); t.dataset.newCount = n > 9 ? '9+' : String(n); });
}

export function initLineup() {
  $('search').addEventListener('input', render);
  $('sort').addEventListener('change', render);
  subscribe((s, patch) => {
    if ('ratings' in patch || 'loading' in patch || 'error' in patch || 'name' in patch) render();
    if ('ratings' in patch || 'seenAt' in patch) renderTabDot();
  });
  // rows that were on screen while the app was in the background start counting when it comes back
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
  render();
  renderTabDot();
}
