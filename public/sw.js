self.addEventListener('push', function(event) {
  if (!event.data) {
    console.log('[SW] Push received but no data');
    return;
  }

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'You have a new notification',
      icon: data.icon || '/favicon.ico',
      badge: data.badge || '/favicon.ico',
      tag: data.tag || 'default',
      data: data.data || {},
      actions: data.actions || [],
      vibrate: [200, 100, 200],
      requireInteraction: true,
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'AI Run Coach', options)
    );
  } catch (error) {
    console.error('[SW] Error processing push:', error);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data;

  let url = '/';
  if (notificationData.type === 'friend-request' || action === 'view') {
    url = '/profile';
  } else if (notificationData.type === 'friend-accepted') {
    url = '/profile';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', function(event) {
  console.log('[SW] Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Service worker activated');
  event.waitUntil(clients.claim());
});
