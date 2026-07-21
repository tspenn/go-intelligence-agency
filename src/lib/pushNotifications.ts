import { supabase } from './supabase';
import { APP_MODE } from './appMode';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SW_PATH = '/sw.js';
const PUSH_APP_ID = APP_MODE === 'gia' ? 'gia' : 'secret-agent';

/** Convert a VAPID public key (base64url) to a Uint8Array for the Push API */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
}

export async function getPushPermission(): Promise<PushPermissionState> {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

/**
 * Register the service worker, request push permission, and save the
 * subscription to Supabase user_push_subscriptions for the given user.
 */
export async function enablePushNotifications(userId: string): Promise<boolean> {
  if (!pushSupported()) {
    console.warn('Push notifications are not supported in this browser');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    });

    const { endpoint, keys } = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    // Upsert into shared push subscriptions table
    const { error } = await supabase.from('user_push_subscriptions').upsert(
      {
        user_id: userId,
        app_id: PUSH_APP_ID,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      console.error('Failed to save push subscription:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Push notification setup failed:', err);
    return false;
  }
}

/**
 * Unsubscribe this device and remove from Supabase.
 */
export async function disablePushNotifications(userId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
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
