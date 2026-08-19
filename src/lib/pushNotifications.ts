import { supabase } from './supabase';
import { APP_MODE } from './appMode';

const SW_PATH = '/sw.js';
const PUSH_APP_ID = APP_MODE === 'gia' ? 'gia' : 'secret-agent';
const VAPID_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push-public-key`;

let vapidPublicKey: string | null =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || null;
let vapidLoad: Promise<string | null> | null = null;

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export type PushEnableResult = { ok: true } | { ok: false; error: string };

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function ensureVapidPublicKey(): Promise<string | null> {
  if (vapidPublicKey) return vapidPublicKey;
  if (!vapidLoad) {
    vapidLoad = (async () => {
      try {
        const res = await fetch(VAPID_ENDPOINT, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { publicKey?: string };
        vapidPublicKey = json.publicKey || null;
        return vapidPublicKey;
      } catch {
        return null;
      }
    })();
  }
  return vapidLoad;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function subscriptionKeys(subscription: PushSubscription): { p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  if (json.keys?.p256dh && json.keys?.auth) return json.keys;
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!p256dh || !auth) return null;
  return { p256dh: bufferToBase64Url(p256dh), auth: bufferToBase64Url(auth) };
}

export function registerPushWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register(SW_PATH);
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  await navigator.serviceWorker.register(SW_PATH);
  return navigator.serviceWorker.ready;
}

export async function getPushPermission(): Promise<PushPermissionState> {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

async function saveSubscription(userId: string, subscription: PushSubscription): Promise<PushEnableResult> {
  const keys = subscriptionKeys(subscription);
  if (!keys) {
    return { ok: false, error: 'This browser did not return push keys. Try Chrome or Edge.' };
  }

  const { error } = await supabase.from('user_push_subscriptions').upsert(
    {
      user_id: userId,
      app_id: PUSH_APP_ID,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      is_active: true,
      last_seen_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('Failed to save push subscription:', error.message);
    return { ok: false, error: `Could not save Pings: ${error.message}` };
  }
  return { ok: true };
}

export async function restoreAndSyncPush(
  userId: string
): Promise<{ enabled: boolean; error: string | null }> {
  if (!pushSupported()) return { enabled: false, error: null };
  try {
    const registration = await getRegistration();
    if (!registration) return { enabled: false, error: null };
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { enabled: false, error: null };
    const saved = await saveSubscription(userId, subscription);
    return saved.ok ? { enabled: true, error: null } : { enabled: false, error: saved.error };
  } catch (err) {
    console.error('Push restore failed:', err);
    return { enabled: false, error: err instanceof Error ? err.message : 'Push restore failed' };
  }
}

export async function enablePushNotifications(userId: string): Promise<PushEnableResult> {
  if (!pushSupported()) {
    return { ok: false, error: 'This browser cannot receive web Pings. Use Chrome or Edge on Android or a computer.' };
  }

  const publicKey = await ensureVapidPublicKey();
  if (!publicKey) {
    return { ok: false, error: 'Pings are not configured on this site yet.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'The browser blocked Pings. Allow notifications for this site, then try again.' };
    }

    const registration = await getRegistration();
    if (!registration) {
      return { ok: false, error: 'Could not register the Ping service worker.' };
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const saved = await saveSubscription(userId, subscription);
    if (!saved.ok) return saved;

    try {
      await registration.showNotification(APP_MODE === 'gia' ? 'Go Intelligence Agency' : 'My Secret Agent', {
        body: 'Pings are on for this device.',
        icon: '/icon-192.png',
        tag: 'gia-ping-test',
      });
    } catch {
      // Subscription saved.
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Push notification setup failed';
    console.error('Push notification setup failed:', err);
    return { ok: false, error: message };
  }
}

export async function disablePushNotifications(userId: string): Promise<void> {
  try {
    const registration = await getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase
      .from('user_push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);
  } catch (err) {
    console.error('Failed to disable push notifications:', err);
  }
}
