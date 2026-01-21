// This service worker is designed to unregister itself and any stale service workers
// that might be persisting from other projects on localhost.

self.addEventListener('install', (event) => {
    // Force this new service worker to become the active one immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Unregister this service worker immediately
    event.waitUntil(
        self.registration.unregister().then(() => {
            return self.clients.matchAll();
        }).then((clients) => {
            // Force all connected clients to reload to ensure they are clean
            clients.forEach(client => client.navigate(client.url));
        })
    );
});
