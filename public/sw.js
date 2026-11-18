const CACHE_VERSION = "v2"
const CACHE_PREFIX = "yaraerp-offline-"
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`
const OFFLINE_URL = "/offline"
const STATIC_ASSETS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          STATIC_ASSETS.map((asset) => new Request(asset, { cache: "reload" })),
        ),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  // Network-first untuk navigasi halaman agar data ERP selalu mutakhir dan
  // HTML ber-auth tidak pernah disimpan di cache offline; hanya jatuh ke
  // halaman /offline bila perangkat benar-benar luring.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return cached || Response.error()
      }),
    )
    return
  }

  // Cache-first hanya untuk ikon PWA statis (tidak termasuk HTML atau API).
  if (url.pathname !== OFFLINE_URL && STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    )
  }
})
