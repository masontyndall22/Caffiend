// Landing page: every rated drink, grouped by brand.
import { $, h, clear, toast } from '../dom.js';
import { get, subscribe, startEdit, toggleLike, likedByMe, openSettings } from '../state.js';
import { groupByBrand, totals } from '../derive.js';
import { fmtScore, tier, fmtDate, plural, fmtMg, fmtBrandMg } from '../format.js';

const open = new Set(); // which brand cards are expanded (view-only, not app state)
let firstRender = true;

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
  return h('li', { class: 'flavor' },
    h('div', { class: 'flavor-name' }, f.flavor, Number.isFinite(f.caffeine) ? h('span', { class: 'mg', text: fmtMg(f.caffeine) }) : null),
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
}

function brandCard(b, forceOpen) {
  const isOpen = forceOpen || open.has(b.name);
  const card = h('article', { class: `brand${isOpen ? ' is-open' : ''}` });
  const head = h('button', {
    class: 'brand-head', type: 'button', 'aria-expanded': String(isOpen),
    onclick: () => {
      const now = !card.classList.contains('is-open');
      card.classList.toggle('is-open', now);
      head.setAttribute('aria-expanded', String(now));
      now ? open.add(b.name) : open.delete(b.name);
    },
  },
    h('div', { class: 'brand-name', text: b.name }),
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

  sub.textContent = `${plural(t.brands, 'brand')}, ${plural(t.cans, 'flavor')} rated`;
  const query = $('search').value;
  const brands = groupByBrand(s.ratings, { sort: $('sort').value, query });

  if (firstRender && brands[0]) { open.add(brands[0].name); firstRender = false; }
  clear(list);
  if (!brands.length) {
    list.append(h('div', { class: 'empty' }, query ? 'No matches.' : 'Nothing rated yet. Crack one open and hit Rate.'));
    return;
  }
  list.append(...brands.map((b) => brandCard(b, Boolean(query))));
}

export function initLineup() {
  $('search').addEventListener('input', render);
  $('sort').addEventListener('change', render);
  subscribe((s, patch) => { if ('ratings' in patch || 'loading' in patch || 'error' in patch || 'name' in patch) render(); });
  render();
}
