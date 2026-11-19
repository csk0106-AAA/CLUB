import { getStore } from "./store";
import type { Row } from "./store/types";

// 회원 한 명에게 가는 알림(종 숫자·알림 창). 표 MemberAlerts.
//  지금은 차량 지원 모집·카풀 신청 시작·자동 배정·확정 요청·리마인드·대기 마감 등에 쓴다.
//  알림 창을 열면 seen 이 true 가 되어 숫자에서 빠진다.
export type MemberAlert = { id: string; memberId: string; eventId: string; text: string; href: string; createdAt: string; seen: boolean };

export const toAlert = (r: Row): MemberAlert => ({
  id: r.id, memberId: r.memberId, eventId: r.eventId ?? "", text: r.text ?? "", href: r.href ?? "", createdAt: r.createdAt ?? "", seen: r.seen === "true",
});

export async function addAlerts(memberIds: string[], a: { eventId: string; text: string; href: string }): Promise<void> {
  const s = await getStore();
  const at = new Date().toISOString();
  for (const mid of [...new Set(memberIds)].filter(Boolean)) {
    await s.insert("MemberAlerts", { memberId: mid, eventId: a.eventId, text: a.text, href: a.href, createdAt: at, seen: "false" });
  }
}

export const unseenAlertsIn = (rows: Row[], mid: string) => rows.filter((r) => r.memberId === mid && r.seen !== "true");

export async function markAlertsSeen(mid: string): Promise<void> {
  const s = await getStore();
  for (const r of (await s.list("MemberAlerts")).filter((x) => x.memberId === mid && x.seen !== "true")) await s.update("MemberAlerts", r.id, { seen: "true" });
}
