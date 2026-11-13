"use client";

// 화면에서 서버를 부르는 공통 함수. 실패해도 예외 대신 { ok:false, error } 로 돌려준다.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const r = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: (data as { error?: string }).error ?? "처리하지 못했어요." };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "연결이 불안정해요. 잠시 후 다시 눌러 주세요." };
  }
}

export function fmtWhen(startsAt: string, endsAt: string, place: string): string {
  if (!startsAt) return "날짜가 정해지면 알려 드려요";
  const d = new Date(startsAt);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const range = endsAt ? `${md}~${new Date(endsAt).getDate()}` : md;
  return place ? `${range} · ${place}` : range;
}

// 날짜: "2026-11-30" → "2026/11/30"
export function fmtDate(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).replace(/-/g, "/") : iso;
}

// 일시 범위: "2026/12/11 14:30 ~ 2026/12/12 14:00" (같은 날이면 "2026/12/11 14:30 ~ 16:00", 끝이 없으면 시작만)
export function fmtRange(startsAt: string, endsAt: string): string {
  if (!startsAt) return "날짜가 정해지면 알려 드려요";
  const part = (iso: string) => ({ md: fmtDate(iso), hm: iso.length >= 16 ? iso.slice(11, 16) : "" });
  const a = part(startsAt);
  const start = a.hm ? `${a.md} ${a.hm}` : a.md;
  if (!endsAt) return start;
  const b = part(endsAt);
  if (b.md === a.md) return b.hm ? `${start} ~ ${b.hm}` : start;
  return `${start} ~ ${b.hm ? `${b.md} ${b.hm}` : b.md}`;
}

// 행사 유형별 pill 색
export const TYPE_TONE: Record<string, string> = { 워크숍: "blue", 전체정기모임: "ok", 소모임: "warn" };

export function won(n: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? `${v.toLocaleString("ko-KR")}원` : "";
}
