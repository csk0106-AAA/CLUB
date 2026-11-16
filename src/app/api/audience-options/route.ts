import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { getLists, memberClubs } from "@/lib/lists";
import { getStore } from "@/lib/store";
import { clubAdmin } from "@/lib/published";
import { forbid, getMe } from "../board/_lib/server";

export const dynamic = "force-dynamic";

// 공개 대상 고르기(AudiencePicker)용 목록: 회원, 일정(참석자), 소모임(회원). 글을 쓸 수 있는 사람만.
export async function GET() {
  const m = await getMe();
  if ("err" in m) return m.err;
  // 게시글 작성자(소모임 직책자 포함) + 일정 관리자(관리자 2차 인증) + 회비 글을 올리는 관리자(회비·회원정보)
  if (!m.me.canWrite && !can(await getSession(), "events") && !clubAdmin(m.me.perms)) return forbid();
  const s = await getStore();
  const [members, events, applies, lists] = await Promise.all([s.list("Members"), s.list("Events"), s.list("EventApplies"), getLists()]);
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const clubNames = [...new Set([...lists.clubs, ...members.flatMap((x) => memberClubs(x).map((c) => c.name))])];
  return NextResponse.json({
    // 회원구분별로 묶어 보여 주려고 회원구분과 그 순서(회원 구분 화면의 순서)를 함께 준다
    // 대기회원·참관회원도 고를 수 있다(회원구분별 묶음으로 따로 보인다)
    members: sortedMembers.map((x) => ({ id: x.id, name: x.name, kind: x.kind || "" })),
    kinds: lists.memberKinds.map((k) => k.value),
    events: [...events]
      .sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""))
      .map((e) => ({
        id: e.id,
        name: e.name,
        startsAt: e.startsAt,
        attendeeIds: applies.filter((a) => a.eventId === e.id && a.answer === "참석").map((a) => a.memberId),
      })),
    clubs: clubNames.map((name) => ({ name, memberIds: members.filter((x) => memberClubs(x).some((c) => c.name === name)).map((x) => x.id) })),
  });
}
