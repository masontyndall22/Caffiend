// Settings sheet, opened from the top-right button: display name (for likes), crew PIN, notifications.
import { $ } from '../dom.js';
import { get, subscribe, setPin, setName, openSettings, closeSettings } from '../state.js';
import { playIntro } from '../intro.js';

let lastFocus = null;

function render(open) {
  const sheet = $('sheet');
  if (open === !sheet.hidden) return;
  sheet.hidden = !open;
  document.documentElement.style.overflow = open ? 'hidden' : '';
  if (open) {
    lastFocus = document.activeElement;
    $('my-name').value = get().name;
    $('pin').value = get().pin;
  } else {
    lastFocus?.focus?.({ preventScroll: true });
  }
}

// Opens the sheet with the cursor in the PIN box.
export function showPinField() {
  openSettings();
  requestAnimationFrame(() => $('pin').focus());
}

export function showNameField() {
  openSettings();
  requestAnimationFrame(() => $('my-name').focus());
}

export function initSettings() {
  $('bell').addEventListener('click', openSettings);
  for (const el of ['sheet-close', 'sheet-close-bg', 'sheet-done']) $(el).addEventListener('click', closeSettings);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });

  // PIN: letters and numbers, case-sensitive. Only spaces at the ends are trimmed.
  const pin = $('pin');
  pin.addEventListener('input', () => setPin(pin.value.trim()));
  const name = $('my-name');
  name.addEventListener('change', () => { setName(name.value); name.value = get().name; });

  $('replay-intro').addEventListener('click', () => { closeSettings(); playIntro({ force: true }); });

  subscribe((s, patch) => { if ('settingsOpen' in patch) render(s.settingsOpen); });
}
