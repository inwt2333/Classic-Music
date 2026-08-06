const CACHE_NAME = "classic-music-runtime-v1";
const DATA_TIMEOUT_MS = 1200;
const FRESH_DATA_CACHE_MS = 30 * 60 * 1000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("classic-music-") && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const scopePath = new URL(self.registration.scope).pathname;
  const isDataRequest = url.pathname.startsWith(`${scopePath}data/`);
  const isStaticAsset = ["image", "script", "style", "font"].includes(request.destination);

  if (isDataRequest) {
    event.respondWith(networkFirstWithCache(request, event));
  } else if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function networkFirstWithCache(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetchAndCache(request, cache).catch(() => null);

  if (!cached) {
    return (await network) || Response.error();
  }

  event.waitUntil(network.then(() => undefined));
  if (isFresh(cached)) return cached;

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(cached), DATA_TIMEOUT_MS);
  });
  return (await Promise.race([network, timeout])) || cached;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetchAndCache(request, cache).catch(() => null);
  if (cached) event.waitUntil(network.then(() => undefined));
  return cached || (await network) || Response.error();
}

function isFresh(response) {
  const responseDate = Date.parse(response.headers.get("date") || "");
  return Number.isFinite(responseDate) && Date.now() - responseDate < FRESH_DATA_CACHE_MS;
}

async function fetchAndCache(request, cache) {
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
