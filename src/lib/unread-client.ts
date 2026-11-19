import { api } from "./client";

// 알림 숫자(/api/unread) 읽기를 한 화면 안에서 나눠 쓴다.
// 하단 메뉴(MemberTabs)와 윗줄 종(MainHeader)이 따로 1분마다 부르던 것을 한 번으로(DB 전송량 줄이기).
// 30초 안에 다시 부르면 앞의 결과를 그대로 쓴다. force 면 새로 읽는다(읽음 처리·신청 처리 직후).
export type UnreadCounts = { events: number; posts: number; profiles: number; alerts: number };
type Res = Awaited<ReturnType<typeof api<UnreadCounts>>>;
let last: { at: number; p: Promise<Res> } | null = null;
export function fetchUnread(force = false): Promise<Res> {
  const now = Date.now();
  if (!force && last && now - last.at < 30_000) return last.p;
  const p = api<UnreadCounts>("/api/unread");
  last = { at: now, p };
  return p;
}
// 숫자 확인 간격: 2분(화면이 보일 때만)
export const UNREAD_EVERY = 120_000;
