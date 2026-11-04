/* App-only shell and fixed team QR graphics. No contact pages or arbitrary URLs. */
const config = {"base":"/","app":"/k/be719b9e2e974c4cbe3547479e570ef1/app/","files":["/k/be719b9e2e974c4cbe3547479e570ef1/app/","/k/be719b9e2e974c4cbe3547479e570ef1/app/manifest.webmanifest","/k/be719b9e2e974c4cbe3547479e570ef1/icon-192.png","/k/be719b9e2e974c4cbe3547479e570ef1/icon-512.png","/k/52f5b08d6ddaab9b952f6ba8f08f357d/qr.svg","/k/4fe2bde703c800582d7c2f57efc8f78f/qr.svg","/k/2010f003e5301fbbcb01777c7832e833/qr.svg","/k/338e4e513a8895a5e5fa4e502e02fd8e/qr.svg","/k/be719b9e2e974c4cbe3547479e570ef1/qr.svg","/_astro/index.CkOmYjIy.css","/_astro/WorkSans-Regular.DihYR0N2.woff2"],"prefix":"if-contact-app-0a4e8a63d8-","revision":"eaaa1aec2ae36486"};
const cacheName = config.prefix + config.revision;
const staticPaths = new Set(config.files.map(path => new URL(path, self.location.origin).href));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      await cache.addAll(config.files.map(path => new Request(path, { cache:'reload' })));
      await self.skipWaiting();
    } catch (error) { await caches.delete(cacheName); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Old manually added favorites are intentionally superseded by the fixed team.
    for (const previous of await caches.keys()) {
      if (previous.startsWith(config.prefix) && previous !== cacheName) await caches.delete(previous);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const navigation = url.origin === self.location.origin && (url.pathname === config.app || url.pathname === config.app + 'index.html');
  if (!navigation && !staticPaths.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    if (navigation) {
      try { return await fetch(request); }
      catch { return await cache.match(config.app) || Response.error(); }
    }
    return await cache.match(request) || fetch(request);
  })());
});
