// Browser side of web push: permission, subscribe, unsubscribe. No DOM, no app state.
import { VAPID_PUBLIC_KEY } from './config.js';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'ok' | 'needs-install' (iPhone/iPad not on Home Screen) | 'unsupported' | 'not-configured'
export function support() {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  return 'ok';
}

export const permission = () => (('Notification' in window) ? Notification.permission : 'default');

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager ? reg.pushManager.getSubscription() : null;
}

function keyBytes(b64u) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// Must be called from a tap (iOS requires a user gesture for the permission prompt).
export async function subscribe() {
  const result = await Notification.requestPermission();
  if (result !== 'granted') throw new Error(result === 'denied'
    ? 'Notifications are blocked. Turn them on for this app in your phone settings.'
    : 'Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription())
    || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
}

export async function unsubscribe() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
  return sub?.endpoint || null;
}
