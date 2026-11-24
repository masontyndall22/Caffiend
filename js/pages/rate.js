// Rate form: add a new flavor + rating, or edit an existing one. Blocks duplicates.
import { $, $$, h, clear, toast } from '../dom.js';
import { get, subscribe, saveRating, startEdit, cancelEdit } from '../state.js';
import { showPinField } from './settings.js';
import { brandNames, flavorsFor, findRating, cleanScore, parseTypedScore, canonicalBrand, norm, key, typicalCaffeineFor, cleanCaffeine } from '../derive.js';
import { fmtScore, fmtBrandMg } from '../format.js';
import { go } from '../nav.js';

let score = 7.0;       // last valid score shown in the form
let mgTouched = false; // true once the person types a caffeine value, so we stop prefilling it

const brandValue = () => canonicalBrand(get().ratings, $('brand').value);

function hint(name, text, kind = '', action = null) {
  const el = $(name);
  el.className = `hint${kind ? ' is-' + kind : ''}`;
  el.replaceChildren(text);
  if (action) el.append(h('button', { type: 'button', class: 'btn-link', text: action.label, onclick: action.run }));
}

function msg(text, kind = '') {
  const m = $('form-msg');
  m.textContent = text;
  m.className = `form-msg${kind ? ' is-' + kind : ''}`;
}

// ---- Brand ----

function renderBrandChips() {
  const wrap = clear($('brand-chips'));
  const current = norm($('brand').value).toLowerCase();
  for (const name of brandNames(get().ratings)) {
    wrap.append(h('button', {
      type: 'button',
      class: `chip${name.toLowerCase() === current ? ' is-on' : ''}`,
      text: name,
      onclick: () => { $('brand').value = name; onBrandInput(); $('flavor').focus(); },
    }));
  }
  wrap.append(h('button', {
    type: 'button', class: 'chip chip-new', text: '＋ New brand',
    onclick: () => { $('brand').value = ''; onBrandInput(); $('brand').focus(); },
  }));
}

function onBrandInput() {
  const typed = norm($('brand').value);
  const canon = brandValue();
  const exists = brandNames(get().ratings).some((b) => b.toLowerCase() === typed.toLowerCase());
  if (!typed) hint('brand-hint', '');
  else if (exists && canon !== typed) hint('brand-hint', `Matches existing brand “${canon}”. It will be saved there.`, 'ok');
  else if (exists) hint('brand-hint', '');
  else hint('brand-hint', `New brand “${typed}” will be added.`, 'ok');

  renderBrandChips();
  const dl = clear($('flavor-options'));
  flavorsFor(get().ratings, canon).forEach((f) => dl.append(h('option', { value: f })));
  checkDuplicate();
  suggestCaffeine(canon);
}

// ---- Caffeine ----

// Prefills the brand's usual mg (most common value among its logged flavors) until the person types their own.
function suggestCaffeine(brand) {
  const c = brand ? typicalCaffeineFor(get().ratings, brand) : null;
  if (!mgTouched && !get().editing) $('caffeine').value = c ? String(c.typical) : '';
  hint('caffeine-hint', c ? `${brand} cans logged so far: ${fmtBrandMg(c)}.` : '');
}

// ---- Duplicates ----

function clashFor(brand, flavor) {
  const hit = findRating(get().ratings, brand, flavor);
  const ed = get().editing;
  if (!hit) return null;
  if (ed && key(hit.brand, hit.flavor) === key(ed.brand, ed.flavor)) return null; // the row being edited
  return hit;
}

function checkDuplicate() {
  const flavor = norm($('flavor').value);
  const hit = flavor ? clashFor(brandValue(), flavor) : null;
  if (!hit) { hint('flavor-hint', ''); return null; }
  hint('flavor-hint', `${hit.brand} ${hit.flavor} is already rated ${fmtScore(hit.rating)}.`, 'error',
    { label: 'Edit that one', run: () => startEdit(hit.brand, hit.flavor) });
  return hit;
}

// ---- Score ----

function showScore(n, { keepText = false } = {}) {
  score = n;
  $('score-range').value = n;
  if (!keepText) $('score-num').value = fmtScore(n);
}

function onScoreTyping(e) {
  const n = parseTypedScore(e.target.value);
  e.target.classList.toggle('is-bad', n == null && e.target.value.trim() !== '');
  if (n != null) showScore(n, { keepText: true });
}

function onScoreDone(e) {
  const n = parseTypedScore(e.target.value);
  e.target.classList.remove('is-bad');
  showScore(n == null ? score : n);
}

// ---- Edit mode ----

function applyEditing(ed) {
  $('edit-banner').hidden = !ed;
  $('submit').textContent = ed ? 'Save changes' : 'Lock it in';
  msg('');
  if (ed) {
    $('edit-label').textContent = `${ed.brand} · ${ed.flavor}`;
    $('brand').value = ed.brand;
    $('flavor').value = ed.flavor;
    $('note').value = ed.note || '';
    $('caffeine').value = Number.isFinite(ed.caffeine) ? String(ed.caffeine) : '';
    mgTouched = true;
    showScore(ed.rating);
    go('rate');
  } else {
    $('flavor').value = '';
    $('note').value = '';
    $('caffeine').value = '';
    mgTouched = false;
    showScore(7);
  }
  onBrandInput();
}

// ---- Submit ----

async function onSubmit(e) {
  e.preventDefault();
  const brand = brandValue();
  const flavor = norm($('flavor').value);
  const typed = parseTypedScore($('score-num').value);
  const rating = cleanScore(typed == null ? score : typed);
  const note = norm($('note').value);
  const caffeine = cleanCaffeine($('caffeine').value);
  if (Number.isNaN(caffeine)) return msg('Caffeine must be a whole number of mg, 0 to 1000 (or leave it blank).', 'error');
  if (!brand) return msg('Pick a brand or type a new one.', 'error');
  if (!flavor) return msg('Enter the flavor.', 'error');
  if (rating == null) return msg('Rating must be a number from 0.0 to 10.0.', 'error');
  if (checkDuplicate()) return msg('That flavor is already in the lineup. Edit it instead of adding it twice.', 'error');

  const btn = $('submit');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { preview, edited } = await saveRating({ brand, flavor, rating, note, caffeine });
    toast(`${edited ? 'Updated' : 'Locked in'} ${brand} ${flavor}: ${fmtScore(rating)}${preview ? ' (this device only)' : ''}`);
    go('lineup');
  } catch (err) {
    msg(err.message, 'error');
    if (err.needsPin || /PIN/i.test(err.message)) showPinField();
    btn.textContent = label;
  } finally {
    btn.disabled = false;
  }
}

export function initRate() {
  $('brand').addEventListener('input', onBrandInput);
  $('brand').addEventListener('blur', () => { if (norm($('brand').value)) $('brand').value = brandValue(); });
  $('flavor').addEventListener('input', checkDuplicate);
  $('score-range').addEventListener('input', (e) => showScore(cleanScore(e.target.value)));
  const num = $('score-num');
  num.addEventListener('focus', () => num.select());
  num.addEventListener('input', onScoreTyping);
  num.addEventListener('blur', onScoreDone);
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); num.blur(); } });
  $$('[data-nudge]').forEach((b) => b.addEventListener('click', () => {
    showScore(cleanScore(score + parseFloat(b.dataset.nudge)));
  }));
  $('rate-form').addEventListener('submit', onSubmit);
  $('edit-cancel').addEventListener('click', () => { cancelEdit(); go('lineup'); });

  $('caffeine').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    mgTouched = e.target.value !== '';
  });

  subscribe((s, patch) => {
    if ('editing' in patch) applyEditing(s.editing);
    else if ('ratings' in patch) onBrandInput();
  });
  showScore(7);
  onBrandInput();
}
