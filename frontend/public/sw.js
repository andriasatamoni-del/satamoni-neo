// وضع الكاشير الأوفلاين (OFFLINE) - الجزء بتاع الـService Worker: بيكاش نسخة من الواجهة (index.html
// وملفات الـJS/CSS) عشان صفحة الطلبات (POS) تقدر تفتح حتى من غير نت (مثلًا بعد إعادة تحميل الصفحة
// وهي أوفلاين). طلبات /api/* بتتسيب تعدّي على طول للشبكة - الطابور المحلي والمزامنة بيتعاملوا معاها
// في طبقة التطبيق (shared/offline/db.ts) مش هنا، عشان منطق "فشل طلب معيّن" يفضل واضح وسهل نتابعه.
const CACHE_NAME = "satamoni-shell-v1";
const SHELL_URLS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});
