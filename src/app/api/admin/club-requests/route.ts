import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { canHandle, isAttend, reqLabel, viewableClubs } from "@/lib/club-requests";
import { memberClubs } from "@/lib/lists";
import { getPermGroups } from "@/lib/perms";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 관리자 › 소모임관리 › 신청내역: 소모임 가입·참관 신청 목록(대기 + 처리한 내역).
//  - 관리자(모든 권한·회원정보)는 모든 소모임, 소모임 직책자는 자기 소모임만 본다.
//  - canHandle: 이 신청을 승인·반려할 수 있는지(그 소모임 직책자, 직책자가 없으면 전체 관리자, 그리고 모든 권한 관리자).
//  - 처리는 PATCH /api/club-requests/[id] { decision, reason }.
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const [rows, members, events, groups] = await Promise.all([s.list("ClubRequests"), s.list("Members"), s.list("Events"), getPermGroups()]);
  const scope = viewableClubs(members, g.s.mid, groups);
  if (scope && scope.length === 0) return bad("소모임 직책자나 관리자만 볼 수 있어요.", 403);

  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => (id ? byId.get(id)?.name ?? "(지운 회원)" : "");
  const items = rows
    .filter((r) => !scope || scope.includes(r.club))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((r) => {
      const m = byId.get(r.memberId);
      return {
        id: r.id, club: r.club, kind: r.kind, kindLabel: reqLabel(r), attend: isAttend(r),
        eventId: r.eventId, eventName: r.eventId ? events.find((e) => e.id === r.eventId)?.name ?? "(지운 일정)" : "",
        memberName: m?.name ?? "(지운 회원)", memberInfo: m ? [m.kind, m.position, m.company].filter(Boolean).join(" · ") : "",
        // 지금 이미 그 소모임 회원인지(대기 중인데 다른 경로로 들어갔을 때 표시)
        nowMember: !!m && memberClubs(m).some((c) => c.name === r.club),
        message: r.message ?? "", status: r.status, createdAt: r.createdAt, handledAt: r.handledAt ?? "",
        handledByName: name(r.handledBy), reason: r.reason ?? "",
        canHandle: r.status === "pending" && r.memberId !== g.s.mid && canHandle(members, r.club, g.s.mid, groups),
      };
    });
  const clubs = [...new Set(items.map((i) => i.club))].sort((a, b) => a.localeCompare(b, "ko"));
  return NextResponse.json({ items, clubs, all: !scope });
}
