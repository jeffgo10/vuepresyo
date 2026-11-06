const APP_VERSION = "1.5.0";
const CACHE_NAME = `vuepresyo-${APP_VERSION}`;

const CORE_ASSETS = [
  "/",
  "/compare",
  "/items",
  "/items/enlist",
  "/login",
  "/receipts",
  "/receipts/detail",
  "/review",
  "/scan",
  "/offline.html",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.png"
];

const BUILD_ASSETS = [/* __BUILD_ASSETS__ */];

// URLs/hosts that should completely bypass service worker caching
function shouldBypass(url) {
  const parsed = new URL(url);
  // Bypass non-HTTP/HTTPS
  if (!parsed.protocol.startsWith("http")) return true;

  // Bypass Firebase Auth, Realtime Database, Cloud Functions, and Storage
  if (
    parsed.hostname.includes("firebaseio.com") ||
    parsed.hostname.includes("googleapis.com") ||
    parsed.hostname.includes("cloudfunctions.net") ||
    parsed.hostname.includes("firebasestorage.googleapis.com") ||
    parsed.hostname.includes("identitytoolkit") ||
    // Bypass emulator ports if running locally
    parsed.port === "9099" ||
    parsed.port === "9000" ||
    parsed.port === "9199" ||
    parsed.port === "5001"
  ) {
    return true;
  }

  // Bypass POST/PUT/DELETE calls or Cloud Function calls
  return false;
}

async function precacheList(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response.status === 200) {
          await cache.put(url, response);
        }
      } catch (err) {
        console.warn("[SW] Precache failed for", url, err);
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        let assetsToCache = Array.from(new Set([...CORE_ASSETS, ...BUILD_ASSETS]));
        if (BUILD_ASSETS.length === 0) {
          try {
            const res = await fetch("/sw-manifest.json", { cache: "no-cache" });
            if (res.ok) {
              const dynamicAssets = await res.json();
              if (Array.isArray(dynamicAssets)) {
                assetsToCache = Array.from(new Set([...assetsToCache, ...dynamicAssets]));
              }
            }
          } catch (_) {
            // Optional manifest in unbuilt or dev environments
          }
        }
        await precacheList(cache, assetsToCache);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Pre-caching warning:", err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Check if request should bypass SW
  if (shouldBypass(request.url)) return;

  // Handle navigation requests (HTML pages)
  if (request.mode === "navigate") {
    event.respondWith(
      // `no-cache` revalidates with the server so a deploy is never masked by
      // the HTTP cache serving old HTML that points at deleted JS chunks.
      fetch(request, { cache: "no-cache" })
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const urlObj = new URL(request.url);
          const pathname = urlObj.pathname.replace(/\/$/, "");
          const pathMatch =
            (await caches.match(pathname)) ||
            (await caches.match(`${pathname}/`)) ||
            (await caches.match(`${pathname}.html`));
          if (pathMatch) return pathMatch;
          const rootMatch = await caches.match("/");
          if (rootMatch) return rootMatch;
          const offlinePage = await caches.match("/offline.html");
          if (offlinePage) return offlinePage;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        })
    );
    return;
  }

  // Handle static assets (_next/static, images, icons, fonts, Next.js route payloads)
  const urlObj = new URL(request.url);
  const isStatic =
    urlObj.pathname.startsWith("/_next/static/") ||
    urlObj.pathname.startsWith("/icons/") ||
    urlObj.pathname.startsWith("/splash/") ||
    urlObj.pathname.endsWith(".txt") ||
    urlObj.pathname.includes("/__next.") ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    request.destination === "font";

  if (isStatic) {
    event.respondWith(
      caches.match(request).then(async (cachedResponse) => {
        if (!cachedResponse) {
          // Fall back to matching by pathname or without search params (?_rsc=...)
          cachedResponse =
            (await caches.match(urlObj.pathname)) ||
            (await caches.match(request, { ignoreSearch: true }));
        }

        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        // Return cached immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
  }
});
