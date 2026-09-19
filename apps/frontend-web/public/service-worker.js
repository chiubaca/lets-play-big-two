const CACHE_NAME = "big-two-crew-v2";
const APP_PAGES = ["/", "/offline"];
const APP_ASSETS = [
  "/manifest.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/icon-maskable-192x192.png",
  "/icon-maskable-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([cacheAppShell(), self.skipWaiting()]));
});

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const pages = await Promise.all(
    APP_PAGES.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Unable to cache ${path}`);
      await cache.put(path, response.clone());
      return response.text();
    }),
  );
  const runtimeAssets = new Set(APP_ASSETS);

  for (const page of pages) {
    for (const match of page.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)) {
      runtimeAssets.add(match[1]);
    }
  }

  await cache.addAll([...runtimeAssets]);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter(
                (cacheName) => cacheName.startsWith("big-two-crew-") && cacheName !== CACHE_NAME,
              )
              .map((cacheName) => caches.delete(cacheName)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (["font", "image", "script", "style"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function handleNavigation(request) {
  try {
    const response = await fetch(request);

    const url = new URL(request.url);
    const isCacheablePage =
      (url.pathname === "/" && url.search === "") || url.pathname.startsWith("/offline");

    if (response.ok && isCacheablePage) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return (await caches.match(request)) ?? (await caches.match("/offline")) ?? Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cachedResponse = await caches.match(request);
  const networkResponse = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => undefined);

  if (cachedResponse) {
    event.waitUntil(networkResponse);
    return cachedResponse;
  }

  return (await networkResponse) ?? Response.error();
}
