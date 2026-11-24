// First-open intro ("Power-up", about 2.9 s): the header logo grows to the middle of the screen, Kyle snaps his
// fingers (wrist flick + spark flash over the original hand art), a can slams down beside him as he points, the tab pops, he jumps, bolts flash, CAFFIEND slams in, then it all shrinks back into
// the header logo. One requestAnimationFrame timeline over SVG, no libraries. Styles live in styles.css (.intro).
//
// playIntro()              plays once per phone (flag in localStorage), skipped for Reduce Motion.
// playIntro({ force: true }) replays it (Settings > Replay intro).

const NS = 'http://www.w3.org/2000/svg';
const ART = 'assets/kyle-intro-body.webp';          // Kyle with his right hand cut out (patched shirt)
const HAND = 'assets/kyle-intro-hand.webp';         // that hand, animated on its own for the snap
const VB_W = 492, VB_H = 918;                              // artwork coordinates
const LOGO = { w: 44, h: 46.64, imgW: 24, imgH: 45 };     // header .logo box in CSS px (styles.css)
const SEEN_KEY = 'ke.introSeen';

const T = { grow: 420, set: 300, snap: 580, point: 720, land: 960, burst: 1490, flyStart: 2390, flyEnd: 2840, fadeStart: 2490, end: 2940 };
const D = T.land - 720;   // everything after the landing runs this much later than the original Power-up
const WRIST = [359, 473]; // where the hand meets the forearm, in artwork coordinates


const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = {
  lin: (x) => x,
  in: (x) => x ** 3,
  out: (x) => 1 - (1 - x) ** 3,
  io: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  back: (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2,
};
const pulse = (t, start, dur) => { const x = (t - start) / dur; return x < 0 || x > 1 ? 0 : Math.sin(Math.PI * x); };

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent?.appendChild(n);
  return n;
}

// Caffiend can, centred on (0,0).
function drawCan(parent, w, h) {
  const g = el('g', {}, parent);
  const x = -w / 2, y = -h / 2;
  const defs = el('defs', {}, g);
  const body = el('linearGradient', { id: 'intro-can-body', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
  [['0', '#0d0f12'], ['.35', '#2a3038'], ['.55', '#14171b'], ['1', '#07080a']].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, body));
  const lid = el('linearGradient', { id: 'intro-can-lid', x1: 0, x2: 1 }, defs);
  [['0', '#7d838c'], ['.4', '#e8ecf0'], ['1', '#6b7078']].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, lid));
  el('rect', { x, y, width: w, height: h, rx: w * 0.16, fill: 'url(#intro-can-body)', stroke: '#1a1209', 'stroke-width': 5 }, g);
  el('rect', { x: x + 2.5, y: y + h * 0.3, width: w - 5, height: h * 0.16, fill: '#d4ff3a' }, g);
  el('rect', { x: x + 2.5, y: y + h * 0.48, width: w - 5, height: h * 0.025, fill: '#d4ff3a' }, g);
  const s = w / 84;
  el('path', { d: `M${4 * s},${-h * 0.09} l${-18 * s},${30 * s} h${12 * s} l${-6 * s},${26 * s} l${22 * s},${-34 * s} h${-12 * s} z`,
    fill: '#d4ff3a', stroke: '#1a1209', 'stroke-width': 2.5, transform: `translate(0 ${h * 0.14})` }, g);
  el('ellipse', { cx: 0, cy: y + 3, rx: w / 2 - 3, ry: w * 0.12, fill: 'url(#intro-can-lid)', stroke: '#1a1209', 'stroke-width': 4 }, g);
  el('rect', { x: x + w * 0.18, y: y + h * 0.08, width: w * 0.1, height: h * 0.8, rx: w * 0.05, fill: '#fff', opacity: 0.12 }, g);
  return g;
}

function build() {
  const root = document.createElement('div');
  root.className = 'intro';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="intro-bg"></div>
    <div class="intro-stage"><div class="intro-tile"></div></div>
    <div class="intro-word">CAF<b>FIEND</b></div>
    <div class="intro-skip">Tap to skip</div>`;
  const stage = root.querySelector('.intro-stage');
  const svg = el('svg', { viewBox: `0 0 ${VB_W} ${VB_H}` });
  stage.appendChild(svg);

  const fx = el('g', {}, svg);
  const fig = el('g', {}, svg);
  const front = el('g', {}, svg);
  const rings = [[14, 0.9, 0], [6, 0.8, 120]].map(([w, o, delay]) => ({
    n: el('circle', { cx: 246, cy: 470, r: 10, fill: 'none', stroke: '#d4ff3a', 'stroke-width': w, opacity: 0 }, fx), o, delay }));
  const bolts = [[-60, 300, -20], [560, 260, 15], [-40, 760, 20], [540, 720, -25]].map(([x, y, rot]) => {
    const g = el('g', { opacity: 0 }, fx);
    el('path', { d: 'M8,-40 L-14,4 H0 L-8,40 L16,-6 H2 Z', fill: '#d4ff3a', stroke: '#0b0d10', 'stroke-width': 3, transform: 'scale(2.2)' }, g);
    return { g, x, y, rot };
  });
  const shadow = el('ellipse', { cx: 600, cy: 905, rx: 60, ry: 12, fill: '#000', opacity: 0 }, fx);
  el('image', { href: ART, x: 0, y: 0, width: VB_W, height: VB_H }, fig);
  // his right hand (original artwork, never redrawn). Two faint copies trail it as a motion echo on the flick.
  const echoes = [0.35, 0.18].map((o) => {
    const g = el('g', { opacity: 0 }, fig);
    el('image', { href: HAND, x: 267, y: 315, width: 107, height: 198 }, g);
    return { g, o };
  });
  const hand = el('g', {}, fig);
  el('image', { href: HAND, x: 267, y: 315, width: 107, height: 198 }, hand);
  // snap flash over the fingertips: a white/lime star plus spark lines
  const snapFx = el('g', { opacity: 0 }, front);
  const star = (r1, r2, n) => Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? r2 : r1, a = (Math.PI * i) / n - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  el('polygon', { points: star(62, 26, 8), fill: '#d4ff3a', stroke: '#0b0d10', 'stroke-width': 5, 'stroke-linejoin': 'round' }, snapFx);
  el('polygon', { points: star(34, 15, 8), fill: '#fff' }, snapFx);
  [-80, -45, -10, 25].forEach((a) => el('line', { x1: 0, y1: -74, x2: 0, y2: -108, stroke: '#d4ff3a', 'stroke-width': 9,
    'stroke-linecap': 'round', transform: `rotate(${a})` }, snapFx));
  const snapWord = el('text', { x: 360, y: 270, fill: '#d4ff3a', stroke: '#0b0d10', 'stroke-width': 7, 'paint-order': 'stroke',
    'font-family': 'Barlow Condensed, Arial Narrow, sans-serif', 'font-weight': 800, 'font-size': 58, opacity: 0 }, front);
  snapWord.textContent = 'SNAP!';
  const can = el('g', {}, front);
  drawCan(can, 96, 260);
  const spray = Array.from({ length: 12 }, () => el('circle', { r: 10, fill: '#d4ff3a', opacity: 0 }, front));

  return {
    root, stage, svg, fig, can, shadow, spray, rings, bolts, hand, echoes, snapFx, snapWord,
    bg: root.querySelector('.intro-bg'), tile: root.querySelector('.intro-tile'),
    word: root.querySelector('.intro-word'), skip: root.querySelector('.intro-skip'),
  };
}

export function createIntro() {
  const p = build();
  // The stage is laid out at its big size so it stays crisp; flying into the header only scales it down.
  let S = 1, big = { x: 0, y: 0 }, small = { x: 0, y: 0, s: 1 };

  function layout() {
    const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
    S = Math.min((vw * 0.7) / LOGO.w, (vh * 0.42) / LOGO.h);
    const W = LOGO.w * S, H = LOGO.h * S, iw = LOGO.imgW * S, ih = LOGO.imgH * S;
    Object.assign(p.stage.style, { width: W + 'px', height: H + 'px' });
    p.stage.style.setProperty('--ring', Math.max(2, S * 0.9) + 'px');
    Object.assign(p.svg.style, { left: (W - iw) / 2 + 'px', top: '0px', width: iw + 'px', height: ih + 'px' });
    // Tile dead centre horizontally; the tile + CAFFIEND wordmark block centred vertically.
    // (The can lands just right of the tile and still fits on screen.)
    big = { x: (vw - W) / 2, y: Math.max(8, (vh - (H + 26 + 46)) / 2) };
    p.word.style.top = big.y + H + 26 + 'px';
    const r = document.querySelector('.topbar .logo')?.getBoundingClientRect();
    small = r && r.width ? { x: r.left, y: r.top, s: r.width / W } : { x: 16, y: 12, s: LOGO.w / W };
  }

  function render(t) {
    // logo: header -> middle -> header
    const k = t < T.flyStart ? Math.max(0, ease.back(clamp01(t / T.grow))) : 1 - ease.io(clamp01((t - T.flyStart) / (T.flyEnd - T.flyStart)));
    const s = small.s + (1 - small.s) * k;
    p.stage.style.transform = `translate(${small.x + (big.x - small.x) * k}px, ${small.y + (big.y - small.y) * k}px) scale(${s})`;
    p.bg.style.opacity = 1 - clamp01((t - T.fadeStart) / (T.flyEnd - T.fadeStart));
    p.skip.style.opacity = t < T.flyStart ? 0.7 : 0;
    p.tile.style.boxShadow = `0 0 ${(4 + 30 * pulse(t, T.burst, 600)) * (S / 6)}px rgba(212,255,58,.8)`;

    // burst: rings + bolts
    for (const r of p.rings) {
      const b = clamp01((t - T.burst - r.delay) / 450);
      r.n.setAttribute('r', 60 + 400 * ease.out(b));
      r.n.setAttribute('opacity', b > 0 && b < 1 ? r.o * (1 - b) : 0);
    }
    p.bolts.forEach((b, i) => {
      const v = pulse(t, T.burst + i * 40, 520);
      b.g.setAttribute('opacity', Math.min(1, v * 1.6));
      b.g.setAttribute('transform', `translate(${b.x} ${b.y}) rotate(${b.rot}) scale(${0.6 + 0.6 * v})`);
    });

    // can slams down beside him
    const fallK = ease.in(clamp01((t - (T.land - 420)) / 420));
    const land = pulse(t, T.land, 220);
    const canOut = 1 - clamp01((t - T.flyStart) / 200);
    p.can.setAttribute('transform', `translate(600 ${775 - 1100 * (1 - fallK) + 18 * land}) scale(${1 + 0.12 * land} ${1 - 0.12 * land})`);
    p.can.setAttribute('opacity', t < T.snap ? 0 : canOut);   // the snap summons the can
    p.shadow.setAttribute('opacity', 0.45 * clamp01((t - (T.land - 420)) / 420) * canOut);
    // tab pops: lime spray
    p.spray.forEach((c, i) => {
      const q = clamp01((t - 820 - D - (i % 4) * 30) / 520), ang = ((-150 + (i * 120) / 11) * Math.PI) / 180, v = 260 + (i % 3) * 70;
      c.setAttribute('cx', 600 + Math.cos(ang) * v * q);
      c.setAttribute('cy', 645 + Math.sin(ang) * v * q + 420 * q * q);
      c.setAttribute('r', 12 - 6 * q);
      c.setAttribute('opacity', q > 0 && q < 1 ? 1 - q * 0.7 : 0);
    });
    // Kyle: crouch, jump with stretch, land squash
    const crouch = pulse(t, 760 + D, 220), air = pulse(t, 900 + D, 420), landK = pulse(t, 1300 + D, 200);
    const sy = 1 - 0.08 * crouch + 0.07 * air - 0.08 * landK, sx = 1 + 0.06 * crouch - 0.04 * air + 0.06 * landK;
    p.fig.setAttribute('transform', `translate(${246 * (1 - sx)} ${-230 * air + VB_H * (1 - sy)}) scale(${sx} ${sy})`);
    // hand: point -> snap set (cocked) -> SNAP -> back to the point as the can drops, jab as it lands
    // hand: cock the wrist back (tension), flick forward on the SNAP, settle into the point as the can drops
    const handRot = (u) => (u < T.set ? 0 : u < T.snap ? 10 * ease.out(clamp01((u - T.set) / 220))
      : u < T.point ? 10 - 22 * ease.out(clamp01((u - T.snap) / 70)) : -12 * (1 - ease.back(clamp01((u - T.point) / 260))));
    const squeeze = t >= T.set && t < T.snap ? 1 - 0.05 * ease.out(clamp01((t - T.set) / 220)) : 1;
    const jab = 1 + 0.08 * pulse(t, T.land - 40, 200);
    const handT = (r) => `rotate(${r} ${WRIST[0]} ${WRIST[1]}) translate(${WRIST[0]} ${WRIST[1]}) scale(${jab * squeeze} ${jab}) translate(${-WRIST[0]} ${-WRIST[1]})`;
    p.hand.setAttribute('transform', handT(handRot(t)));
    const flick = t >= T.snap && t < T.snap + 160;
    p.echoes.forEach((e, i) => {
      e.g.setAttribute('opacity', flick ? e.o * (1 - (t - T.snap) / 160) : 0);
      e.g.setAttribute('transform', handT(handRot(t - 35 * (i + 1))));
    });
    const sp = pulse(t, T.snap, 240);
    p.snapFx.setAttribute('opacity', Math.min(1, sp * 2.2));
    p.snapFx.setAttribute('transform', `translate(314 352) rotate(${40 * clamp01((t - T.snap) / 240)}) scale(${0.3 + 0.8 * ease.out(clamp01((t - T.snap) / 140))})`);
    p.snapWord.setAttribute('opacity', Math.min(1, pulse(t, T.snap, 380) * 2));
    p.snapWord.setAttribute('transform', `rotate(-10 400 250) translate(0 ${-14 * clamp01((t - T.snap) / 380)})`);

    // wordmark slam
    const w = clamp01((t - 1300 - D) / 260);
    p.word.style.opacity = t < T.flyStart ? w : 1 - clamp01((t - T.flyStart) / 200);
    p.word.style.transform = `scale(${1.8 - 0.8 * ease.back(w)})`;
  }

  let start = 0, raf = 0, resolve = null, finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', layout);
    p.root.remove();
    document.documentElement.classList.remove('intro-playing');
    resolve?.();
  };
  const frame = (now) => {
    const t = now - start;
    render(Math.min(t, T.end));
    if (t >= T.end) finish(); else raf = requestAnimationFrame(frame);
  };
  // A tap jumps to the fly-back, so he still lands in the header, just sooner.
  const skipNow = () => { const now = performance.now(); if (now - start < T.flyStart) start = now - T.flyStart; };

  return {
    el: p.root,
    duration: T.end,
    mount() {
      document.documentElement.classList.add('intro-playing');
      document.body.appendChild(p.root);
      layout();
      addEventListener('resize', layout);
      render(0);
      return this;
    },
    seek: render,
    play() {
      return new Promise((res) => {
        resolve = res;
        p.root.addEventListener('pointerdown', skipNow);
        start = performance.now();
        raf = requestAnimationFrame(frame);
      });
    },
    stop: finish,
  };
}

function preload() {
  return new Promise((res) => {
    const img = new Image();
    img.onload = img.onerror = () => res();
    img.src = ART;
    new Image().src = HAND;
    setTimeout(res, 1500);   // never hold the app up for a slow image
  });
}

export async function playIntro({ force = false } = {}) {
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch {}
  if (!force && (seen || matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
  const intro = createIntro().mount();
  await preload();
  await intro.play();
}
