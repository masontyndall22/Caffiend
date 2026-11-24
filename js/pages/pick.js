// Random picker: a slot-machine reel that decelerates onto a random can.
import { $, $$, h, clear } from '../dom.js';
import { get, subscribe, likedByMe } from '../state.js';
import { fmtScore } from '../format.js';

let filter = '0'; // '0' | '7' | '8.5' | 'liked'
let spinning = false;

const pool = () => (filter === 'liked'
  ? get().ratings.filter(likedByMe)
  : get().ratings.filter((r) => r.rating >= parseFloat(filter)));
const rand = (xs) => xs[Math.floor(Math.random() * xs.length)];
const rowH = () => $('reel').firstElementChild?.offsetHeight || 76;

const item = (r) => h('div', { class: 'reel-item' },
  h('small', { text: r.brand }),
  h('b', { text: r.flavor }),
);

function idle() {
  if (spinning) return;
  const reel = $('reel');
  const p = pool();
  reel.style.transition = 'none';
  reel.style.transform = 'translateY(0)';
  clear(reel);
  if (!p.length) {
    reel.append(h('div', { class: 'reel-item' }), h('div', { class: 'reel-item' }, h('small', { text: 'Nothing here' }), h('b', { text: filter === 'liked' ? (get().name ? 'Like some cans first' : 'Add your name first') : 'Lower the bar' })));
    $('spin').disabled = true;
    return;
  }
  $('spin').disabled = false;
  for (let i = 0; i < 3; i++) reel.append(item(rand(p)));
}

function spin() {
  const p = pool();
  if (spinning || !p.length) return;
  spinning = true;
  const wrap = $('reel').parentElement.parentElement;
  const reel = $('reel');
  const btn = $('spin');
  btn.disabled = true; btn.textContent = 'Spinning…';
  $('pick-result').replaceChildren();
  wrap.classList.remove('is-landed');

  const winner = rand(p);
  const LEN = 36 + Math.floor(Math.random() * 8); // winner lands at index LEN
  const seq = Array.from({ length: LEN }, () => rand(p));
  seq.push(winner, rand(p));

  reel.style.transition = 'none';
  reel.style.transform = 'translateY(0)';
  clear(reel).append(...seq.map(item));
  void reel.offsetHeight; // commit the reset before animating

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = reduce ? 0 : 3600;
  wrap.classList.add('is-spinning');
  reel.style.transition = `transform ${ms}ms cubic-bezier(.08,.72,.16,1)`;
  reel.style.transform = `translateY(${-(LEN - 1) * rowH()}px)`;

  setTimeout(() => wrap.classList.remove('is-spinning'), ms * 0.7);
  setTimeout(() => {
    spinning = false;
    wrap.classList.add('is-landed');
    btn.disabled = false; btn.textContent = 'Spin again';
    navigator.vibrate?.([30, 40, 60]);
    $('pick-result').replaceChildren(
      h('div', { class: 'eyebrow', text: 'Your next can' }),
      h('div', { class: 'winner' }, h('span', { text: winner.brand }), winner.flavor),
      h('div', { class: 'eyebrow', text: `Rated ${fmtScore(winner.rating)}` }),
    );
  }, ms + 50);
}

export function initPick() {
  $$('[data-min]', $('pick-filter')).forEach((chip) => chip.addEventListener('click', () => {
    if (spinning) return;
    filter = chip.dataset.min;
    $$('[data-min]').forEach((c) => c.classList.toggle('is-on', c === chip));
    $('pick-result').replaceChildren();
    idle();
  }));
  $('spin').addEventListener('click', spin);
  subscribe((s, patch) => { if ('ratings' in patch || 'name' in patch) idle(); });
  idle();
}
