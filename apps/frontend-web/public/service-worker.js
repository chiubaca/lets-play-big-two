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

const TURN_CACHE = "big-two-turn-receipts";

function notificationApi() {
  if (self.location.origin === "https://local.bigtwo.com") return "https://local.api.bigtwo.com";
  if (self.location.origin === "https://big-two.chiubaca.com")
    return "https://big-two-api.chiubaca.com";
  return null;
}

function turnPayload(value) {
  if (!value || typeof value !== "object") return null;
  const { roomId, turnId, endpointId } = value;
  return typeof roomId === "string" &&
    /^[A-Z0-9]{5}$/.test(roomId) &&
    typeof turnId === "string" &&
    /^[a-f0-9-]{36}$/.test(turnId) &&
    typeof endpointId === "string" &&
    /^[a-f0-9]{64}$/.test(endpointId)
    ? { roomId, turnId, endpointId }
    : null;
}

function returnTicket(target) {
  if (typeof target !== "string" || !/^\/turn-return\?ticket=[A-Za-z0-9_-]{30,500}$/.test(target))
    return null;
  const url = new URL(target, self.location.origin);
  return url.origin === self.location.origin ? url : null;
}

async function checkTurn(payload) {
  const api = notificationApi();
  if (!api) return null;
  const params = new URLSearchParams(payload);
  const response = await fetch(`${api}/api/turn-notifications/check?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const result = await response.json();
  return result.eligible === true ? returnTicket(result.target) : null;
}

async function receipt(event) {
  try {
    const payload = turnPayload(event.data?.json());
    if (!payload) return;
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(subscription.endpoint),
    );
    const endpointId = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (endpointId !== payload.endpointId) return;
    const key = new URL(
      `/__turn-receipt/${payload.roomId}/${payload.turnId}/${endpointId}`,
      self.location.origin,
    );
    const cache = await caches.open(TURN_CACHE);
    if (await cache.match(key.href)) return;
    const target = await checkTurn(payload);
    if (!target) return; // No WebKit declarative or generic fallback: verification failure shows nothing.
    await cache.put(key.href, new Response("1"));
    await self.registration.showNotification("It’s your turn", {
      tag: `${payload.roomId}:${payload.turnId}`,
      data: { ticket: target.searchParams.get("ticket") },
    });
  } catch {
    // Malformed payload, offline verification, storage, or crypto failure must never display.
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(receipt(event));
});

async function openReturn(event) {
  try {
    const ticket = event.notification.data?.ticket;
    if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{30,500}$/.test(ticket)) return;
    event.notification.close();
    const gate = returnTicket(`/turn-return?ticket=${ticket}`);
    if (!gate) return;
    const api = notificationApi();
    if (!api) return;
    // A tap under another identity sees only the neutral gate, never a room URL.
    const response = await fetch(`${api}/api/turn-notifications/return?ticket=${ticket}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.ok) {
      const result = await response.json();
      if (
        result.allowed === true &&
        typeof result.target === "string" &&
        /^\/room\/[A-Z0-9]{5}$/.test(result.target)
      ) {
        const target = new URL(result.target, self.location.origin);
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const existing = clients.find((client) => client.url === target.href);
        if (existing) return existing.focus();
      }
    }
    return self.clients.openWindow(gate.href);
  } catch {
    // Unavailable verification does not navigate to a room or an untrusted URL.
  }
}

self.addEventListener("notificationclick", (event) => {
  event.waitUntil(openReturn(event));
});
