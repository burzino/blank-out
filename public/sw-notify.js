// Importato dal service worker generato (workbox.importScripts in vite.config.ts).
// Toccando una notifica: porta in primo piano l'app se è già aperta, altrimenti la apre sulla Home.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const home = new URL('./', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(home);
    })
  );
});
