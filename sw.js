/**
 * OneFill - Service Worker for Web Push & External Notifications
 * Enables background deadline alarms, expiry push notifications,
 * and handles notification interaction even when the application tab is closed.
 */

const CACHE_NAME = 'onefill-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push notifications from server
self.addEventListener('push', (event) => {
  let data = {
    title: 'OneFill Deadline Reminder',
    body: 'You have an upcoming document deadline or bill payment due.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'onefill-reminder',
    data: { url: '/#view-reminders' }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'onefill-reminder',
    vibrate: [200, 100, 200],
    data: data.data || { url: '/#view-reminders' },
    actions: [
      { action: 'open', title: 'View Reminder' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle clicking on a notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/#view-reminders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and post message
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ action: 'OPEN_REMINDERS_TAB' });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Receive messages from frontend (e.g. Test push notification trigger)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title || 'OneFill Deadline Alert', {
      body: options?.body || 'Deadline reminder active.',
      icon: '/favicon.ico',
      vibrate: [150, 80, 150],
      tag: 'onefill-test',
      data: { url: '/#view-reminders' }
    });
  }
});
