self.addEventListener('push', (event) => {
  let data = { title: 'ScheduleAI 🚗', body: 'Alerta inteligente da sua agenda.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'ScheduleAI 🚗', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    data: {
      url: self.location.origin
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se houver uma janela aberta do app, foca nela
      const targetUrl = event.notification.data.url;
      for (const client of clientList) {
        if (client.url.startsWith(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Caso contrário, abre uma nova aba
      if (clients.openWindow) {
        return clients.openWindow(targetUrl || '/');
      }
    })
  );
});
