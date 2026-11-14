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
    // 사회자 접속번호로 들어온 세션이 다른 화면을 열면 사회자 첫 화면으로 보낸다.
    if (r.status === 403 && (data as { hostOnly?: boolean }).hostOnly && !window.location.pathname.startsWith("/host")) {
      window.location.href = "/host";
    }
    if (!r.ok) return { ok: false, status: r.status, error: (data as { error?: string }).error ?? "처리하지 못했어요." };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "연결이 불안정해요. 잠시 후 다시 눌러 주세요." };
  }
}

// 일정 목록·카드용: "2026/12/11 ~ 2026/12/12 · 장소" (시간은 빼고 날짜만, 같은 날이면 하루만)
export function fmtWhen(startsAt: string, endsAt: string, place: string): string {
  if (!startsAt) return "날짜가 정해지면 알려 드려요";
  const a = fmtDate(toLocalIso(startsAt));
  const b = endsAt ? fmtDate(toLocalIso(endsAt)) : "";
  const range = b && b !== a ? `${a} ~ ${b}` : a;
  return place ? `${range} · ${place}` : range;
}

// 시간대가 붙은 ISO("…Z", "+09:00")는 한국 시간(UTC+9) "YYYY-MM-DDTHH:mm" 으로 바꾼다. 그 밖에는 그대로.
function toLocalIso(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

// 날짜: "2026-11-30" → "2026/11/30"
export function fmtDate(iso: string): string {
  if (!iso) return "";
  const v = toLocalIso(iso);
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).replace(/-/g, "/") : iso;
}

// 날짜·시각: "2026-12-11T14:30" → "2026/12/11 14:30", "2026-12-11" → "2026/12/11", "…Z" 는 한국 시간으로
export function fmtDateTime(iso: string): string {
  if (!iso) return "";
  const v = toLocalIso(iso);
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return iso;
  const hm = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) ? v.slice(11, 16) : "";
  return hm ? `${fmtDate(v)} ${hm}` : fmtDate(v);
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
// 요일 붙인 날짜: "2026-12-11" → "2026/12/11 (목)"
export function fmtDateDow(iso: string): string {
  const d = fmtDate(iso);
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(d)) return d;
  const [y, m, day] = d.split("/").map(Number);
  return `${d} (${DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
}

// 날짜 여러 개: ["2026-12-11","2026-12-12"] 또는 "2026-12-11,2026-12-12" → "2026/12/11, 2026/12/12"
export function fmtDays(days: string | string[]): string {
  const list = (Array.isArray(days) ? days : days.split(",")).map((x) => x.trim()).filter(Boolean).sort();
  return list.map(fmtDate).join(", ");
}

// 이어진 날짜면 "2026/12/11 ~ 2026/12/12", 떨어져 있으면 "2026/12/11, 2026/12/13"
export function fmtDaySpan(days: string | string[]): string {
  const list = (Array.isArray(days) ? days : days.split(",")).map((x) => x.trim().slice(0, 10)).filter(Boolean).sort();
  if (list.length === 0) return "";
  if (list.length === 1) return fmtDate(list[0]);
  const ts = list.map((x) => Date.parse(`${x}T00:00:00Z`));
  const consecutive = ts.every((t, i) => i === 0 || t - ts[i - 1] === 86_400_000);
  return consecutive ? `${fmtDate(list[0])} ~ ${fmtDate(list[list.length - 1])}` : list.map(fmtDate).join(", ");
}

// 일시 범위: "2026/12/11 14:30 ~ 2026/12/12 14:00" (같은 날이면 "2026/12/11 14:30 ~ 16:00", 끝이 없으면 시작만)
export function fmtRange(startsAt: string, endsAt: string): string {
  if (!startsAt) return "날짜가 정해지면 알려 드려요";
  const part = (raw: string) => {
    const iso = toLocalIso(raw);
    return { md: fmtDate(iso), hm: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : "" };
  };
  const a = part(startsAt);
  const start = a.hm ? `${a.md} ${a.hm}` : a.md;
  if (!endsAt) return start;
  const b = part(endsAt);
  if (b.md === a.md) return b.hm ? `${start} ~ ${b.hm}` : start;
  return `${start} ~ ${b.hm ? `${b.md} ${b.hm}` : b.md}`;
}

// 일정 유형별 pill 색
export { TYPE_TONE } from "./event-types";

export function won(n: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? `${v.toLocaleString("ko-KR")}원` : "";
}
