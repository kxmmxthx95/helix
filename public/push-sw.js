// Web push handlers, pulled into the generated Workbox service worker via
// workbox.importScripts in vite.config.ts. Payload: { title, body } (see supabase/functions/line-notify).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // non-JSON payload: fall through to defaults
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Helix", {
      body: data.body || "",
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => (wins[0] ? wins[0].focus() : self.clients.openWindow("/"))),
  );
});
