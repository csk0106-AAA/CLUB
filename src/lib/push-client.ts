"use client";

import { api } from "./client";

// 화면 쪽 휴대폰 알림 구독 도우미. 알림 설정에서 "알림 ON" 을 켤 때 부른다.
// iPhone 은 홈 화면에 추가한 앱에서만 알림을 받을 수 있다(Safari 16.4+).

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// 성공하면 null, 아니면 회원에게 보여 줄 안내 문구
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) {
    return "이 브라우저는 휴대폰 알림을 지원하지 않아요. iPhone 은 공유 버튼 → “홈 화면에 추가”로 앱을 설치한 뒤 거기서 켜 주세요. 하단 아이콘의 숫자는 그대로 보여요.";
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "알림 권한이 꺼져 있어요. 휴대폰 설정에서 이 앱의 알림을 허용해 주세요.";
  const info = await api<{ publicKey: string }>("/api/push");
  if (!info.ok || !info.data.publicKey) return "알림 서버 설정이 아직 없어요. 관리자에게 알려 주세요.";
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.data.publicKey) as BufferSource }));
    const r = await api("/api/push", { body: sub.toJSON() });
    return r.ok ? null : r.error;
  } catch {
    return "알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
  } catch {
    // 이미 해지된 경우 등은 무시
  }
}

// 앱 아이콘 숫자(지원하는 기기만)
export function setBadge(n: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) nav.setAppBadge?.(n)?.catch(() => undefined);
    else nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    // 지원하지 않으면 무시
  }
}
