const CACHE = "rh-leads-v2";
const SHELL = ["/admin", "/assets/img/logo.png"];

self.addEventListener("install", (e) => {
  // Pre-cache best-effort — never block install on a failed fetch.
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Let API calls go straight to network — never serve stale lead data
  if (e.request.url.includes("/api/")) return;
  // Network-first: always try fresh so the installed dashboard can't get stuck
  // on an old version; fall back to cache only when offline.
  // Only cache our own same-origin GETs — never extension or cross-origin URLs.
  const sameOrigin = e.request.url.startsWith(self.location.origin);
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && e.request.method === "GET" && sameOrigin) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

/* ---------- Web Push ---------- */

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = {}; }
  const title = data.title || "🦸 New roofing lead";
  const options = {
    body: data.body || "Open your dashboard to call them.",
    icon: "/assets/img/logo.png",
    badge: "/assets/img/logo.png",
    tag: data.tag || "rh-lead",
    data: { url: data.url || "/admin" },
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/admin";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes("/admin") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    })
  );
});
