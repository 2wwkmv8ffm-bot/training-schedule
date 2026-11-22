// ZONE 서비스 워커 — 안드로이드(갤럭시)에서 '앱 설치'가 되게 하고, 인터넷이 끊겼을 때 마지막 화면을 보여 줘요.
// 항상 '인터넷 먼저'로 가져와서, 업데이트를 올리면 바로 새 버전이 보여요. (서버 데이터·로그인 요청은 건드리지 않아요)
const CACHE = "zone-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // 같은 사이트 파일만
  e.respondWith(
    fetch(req)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("./")))
  );
});
