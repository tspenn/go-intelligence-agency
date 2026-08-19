/**
 * Go Intelligence Agency — Push Notification Service Worker
 *
 * Handles incoming web push events from the mission-watcher edge function
 * and displays them as OS-level notifications.
 *
 * Registered in src/lib/pushNotifications.ts via:
 *   navigator.serviceWorker.register('/sw.js')
 */

const CACHE_NAME = 'gia-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Push event ───────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'GIA Alert', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'GIA Alert';
  const options = {
    body: data.body || 'An operative has new intelligence.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'gia-alert',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
    actions: [
      { action: 'view', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  const isAbsolute = /^https?:\/\//i.test(url);
  const isSameOrigin = isAbsolute && url.startsWith(self.location.origin);

  event.waitUntil(
    (async () => {
      // Article / source URL: open the watched item itself, not the hub.
      if (isAbsolute && !isSameOrigin) {
        if (self.clients.openWindow) return self.clients.openWindow(url);
        return;
      }

      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'MISSION_ALERT', url });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })()
  );
});

// ─── Push subscription change ─────────────────────────────────────────────────
// Fires when the browser invalidates a push subscription (e.g. after browser restart)

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    // Re-registration is handled in src/lib/pushNotifications.ts
    // This event just signals the app to re-subscribe
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' })
      );
    })
  );
});
