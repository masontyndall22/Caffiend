// Notification controls: the bell in the top bar, the one-time banner on the Lineup, and Settings.
import { $, toast } from '../dom.js';
import { get, subscribe, refreshPush, enablePush, disablePush, testPush } from '../state.js';
import { showPinField } from './settings.js';

const DISMISS_KEY = 'ke.alertBannerDismissed';
const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };
const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch {} };

const STATUS_TEXT = {
  checking: 'Checking…',
  on: 'On. This phone gets a notification when someone else rates a can.',
  off: 'Off. Turn on to get a notification when a new can is rated.',
  denied: 'Blocked. Allow notifications for Caffiend in your phone settings, then come back.',
  'needs-install': 'On iPhone, add the app to your Home Screen first: tap Share, then “Add to Home Screen”, then open it from there. Needs iOS 16.4 or newer.',
  unsupported: 'This browser can’t receive notifications.',
  'not-configured': 'Notifications aren’t set up on the server yet.',
};

async function turnOn() {
  try {
    await enablePush();
    toast('Notifications on');
  } catch (e) {
    toast(e.message, 4000);
  }
}

async function onToggle() {
  const { status } = get().push;
  if (status === 'on') {
    await disablePush().catch((e) => toast(e.message, 4000));
    toast('Notifications off');
  } else if (status === 'off') {
    await turnOn();
  } else {
    toast(STATUS_TEXT[status] || 'Notifications unavailable', 5000);
  }
}

function render() {
  const { status, busy } = get().push;
  const canToggle = status === 'on' || status === 'off';

  const bell = $('bell');
  bell.classList.toggle('is-on', status === 'on');
  bell.setAttribute('aria-label', status === 'on' ? 'Settings (notifications on)' : 'Settings and notifications');

  $('push-status').textContent = STATUS_TEXT[status] || '';
  const toggle = $('push-toggle');
  toggle.hidden = !canToggle;
  toggle.disabled = busy;
  toggle.textContent = busy ? 'Working…' : status === 'on' ? 'Turn off' : 'Turn on';
  $('push-test').hidden = status !== 'on';

  const banner = $('alert-banner');
  const showBanner = !dismissed() && (status === 'off' || status === 'needs-install');
  banner.hidden = !showBanner;
  $('alert-banner-text').textContent = status === 'needs-install'
    ? 'Want a notification when a new can gets rated? Add this app to your Home Screen first (Share, then “Add to Home Screen”).'
    : 'Get a notification when a new can gets rated.';
  $('alert-banner-on').hidden = status !== 'off';
  $('alert-banner-on').disabled = busy;
}

export function initAlerts() {
  $('push-toggle').addEventListener('click', onToggle);
  $('push-test').addEventListener('click', async () => {
    try { await testPush(); toast('Test sent. It should arrive in a few seconds.'); } catch (e) {
      toast(e.message, 5000);
      if (e.needsPin || /PIN/i.test(e.message)) showPinField();
    }
  });
  $('alert-banner-on').addEventListener('click', async () => { await turnOn(); });
  $('alert-banner-dismiss').addEventListener('click', () => { dismiss(); render(); });
  subscribe((s, patch) => { if ('push' in patch) render(); });
  render();
  refreshPush();
}
