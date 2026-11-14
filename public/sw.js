// 휴대폰 알림(Web Push) 서비스 워커.
// 서버는 내용 없이 { title, body, count, silent, url } 만 보낸다(잠금 화면에 글 내용이 보이지 않게).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (_) {
    d = {};
  }
  const title = d.title || "원우회";
  const count = Number(d.count) || 0;
  const tasks = [
    self.registration.showNotification(title, {
      body: d.body || "새 게시물이 있어요. 앱에서 확인해 주세요.",
      tag: "club-new", // 여러 번 와도 알림 한 개로 묶는다
      renotify: !d.silent,
      silent: !!d.silent,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: d.url || "/events" },
    }),
  ];
  // 홈 화면 앱 아이콘 숫자(지원하는 기기만)
  if (self.navigator && "setAppBadge" in self.navigator) {
    tasks.push((count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge()).catch(() => undefined));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/events";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
