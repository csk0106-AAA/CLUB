import { NextResponse } from "next/server";
import { guard, guardEv, parseJson } from "./api";
import { eventJoinable } from "./audience";
import type { Session } from "./auth";
import { getStore } from "./store";
import type { Row } from "./store/types";
import { defaultPhotoLimit, eventDayCount, MAX_PHOTO_LIMIT } from "./photo-limit";
export { defaultPhotoLimit, eventDayCount, limitMessage, MAX_PHOTO_LIMIT, PHOTOS_MIN, PHOTOS_PER_PERSON_DAY } from "./photo-limit";

// 일정 사진첩: 참석한 회원이 사진을 올리고, 함께 참석한 회원들이 보고 좋아요·내려받기를 한다.
//  보기: 이 일정에 참석 신청할 수 있는 회원(공개 대상 · 클럽 일정이면 클럽 회원과 참관자) + 일정 관리자
//  올리기: 참석 신청한 회원 + 일정 관리자(일정관리·클럽관리 권한, 만든 사람·편집자 — lib/api.ts guardEv)
//  지우기: 올린 사람 + 일정 관리자
// 사진은 화면에서 긴 변 1600px JPEG(원본)과 400px JPEG(미리보기)로 줄여 올린다(components/EventPhotos.tsx).

export const MAX_PHOTO_BYTES = 1_500_000; // 줄인 사진 한 장
export const MAX_THUMB_BYTES = 200_000; // 미리보기 한 장
export const MAX_MEMBER_PHOTOS = 60; // 한 회원이 일정 하나에
export const MAX_CAPTION = 100;

// 이 일정의 사진첩 최대 장수: 관리자가 정한 값이 먼저, 없으면 기본(참석 인원 × 10장 × 일수)
export function photoLimitOf(e: Row, going: number): number {
  const n = Math.floor(Number(e.photoLimit));
  return e.photoLimit && n >= 1 && n <= MAX_PHOTO_LIMIT ? n : defaultPhotoLimit(going, eventDayCount(e.startsAt, e.endsAt));
}
// 이 일정에 참석 신청한 인원
export async function goingOf(eventId: string): Promise<number> {
  return (await (await getStore()).list("EventApplies")).filter((a) => a.eventId === eventId && a.answer === "참석").length;
}
// 장수 늘리기 요청 [{memberId, at}]
export function readPhotoReqs(text: string | undefined): { memberId: string; at: string }[] {
  const v = parseJson<unknown>(text, []);
  return Array.isArray(v) ? v.filter((x): x is { memberId: string; at: string } => !!x && typeof (x as { memberId?: unknown }).memberId === "string") : [];
}

export type PhotoView = {
  id: string; memberId: string; name: string; caption: string; w: number; h: number;
  likes: number; liked: boolean; mine: boolean; createdAt: string;
};

export type PhotoAccess = {
  s: Session; e: Row; manager: boolean; canView: boolean; canUpload: boolean; attending: boolean;
};

// 로그인 + 일정 + 권한 계산. 일정이 없거나 볼 수 없으면 404.
export async function photoAccess(ctx: { params: Promise<{ id: string }> }): Promise<PhotoAccess | { err: NextResponse }> {
  const g = await guard();
  if ("err" in g) return g;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, applies] = await Promise.all([s.list("Events"), s.list("Members"), s.list("EventApplies")]);
  const e = events.find((x) => x.id === id);
  if (!e) return { err: NextResponse.json({ error: "일정을 찾을 수 없어요." }, { status: 404 }) };
  const me = members.find((m) => m.id === g.s.mid);
  // 관리자 2차 인증을 거친 세션만 관리자로 본다(guardEv 와 같은 기준)
  const manager = g.s.admin ? "s" in (await guardEv(ctx)) : false;
  const joinable = eventJoinable(e, me ?? g.s.mid);
  const attending = applies.some((a) => a.eventId === id && a.memberId === g.s.mid && a.answer === "참석");
  const canView = manager || joinable;
  if (!canView) return { err: NextResponse.json({ error: "이 일정의 사진첩은 참석 대상 회원만 볼 수 있어요." }, { status: 404 }) };
  return { s: g.s, e, manager, canView, canUpload: manager || (joinable && attending), attending };
}

export function photoView(r: Row, me: string, nameOf: (id: string) => string): PhotoView {
  const likes = parseJson<string[]>(r.likes, []);
  return {
    id: r.id, memberId: r.memberId, name: nameOf(r.memberId), caption: r.caption ?? "",
    w: Number(r.w) || 0, h: Number(r.h) || 0, likes: likes.length, liked: likes.includes(me), mine: r.memberId === me,
    createdAt: r.createdAt ?? "",
  };
}

// 사진 파일 형식(앞부분 바이트로 판단): jpg·png·webp
export function imageTypeOf(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

// 일정 카드·상세 맨 위 사진으로 쓸 회원 사진: 좋아요가 가장 많은 사진, 같거나 없으면 가장 먼저 올린 사진. 없으면 null.
// (목록 /api/events 와 상세 /api/events/[id] 가 같은 기준을 쓴다)
export function bestPhoto(rows: Row[]): Row | null {
  let best: Row | null = null;
  let bl = -1;
  for (const p of rows) {
    const l = parseJson<string[]>(p.likes, []).length;
    if (!best || l > bl || (l === bl && (p.createdAt ?? "") < (best.createdAt ?? ""))) { best = p; bl = l; }
  }
  return best;
}
