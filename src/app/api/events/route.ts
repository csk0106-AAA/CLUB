import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { memberFee, payable } from "@/lib/fee";
import { eventVisible, inClubOrObserver } from "@/lib/audience";
import { fixLegacyTypes, migrateMinutesPosts } from "@/lib/event-migrate";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 한국 시간 오늘(YYYY-MM-DD)
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// 회원이 보는 예정된 일정 목록. 공개된 일정만, 내 신청과 회비 상태를 함께 내려준다.
// 다른 소모임의 일정도 보이지만(읽기만) 참석 신청은 그 소모임 회원·참관자만 할 수 있다(canApply).
//
// 순서(group):
//  0 관리자가 맨 위에 고정한 일정(pinned, 지나지 않은 것)
//  1 아직 참석 여부를 안 알린 일정 / 참석으로 알린 일정 / 내 소모임 일정 — 가까운 날짜 먼저
//  2 불참으로 알린 일정 / 내가 속하지 않은 소모임 일정 — 가까운 날짜 먼저
//  3 지난 일정 — 최근 것 먼저
// 날짜가 아직 없는 일정은 같은 묶음의 맨 뒤.
// 일정 관리 권한(all/events/fees, 지금 DB 기준)이 있으면 공개 전 초안도 draft: true 로 함께 내려준다(관리 화면으로 가는 길).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (session.host) return NextResponse.json({ error: "사회자 접속 중에는 활동 진행 화면만 볼 수 있어요.", hostOnly: true }, { status: 403 });

  // 예전 데이터 옮기기(여러 번 불러도 같다): 게시판 회의록 → 회의 일정, 전체정기모임 → 정기모임
  await migrateMinutesPosts().catch(() => 0);
  const s = await getStore();
  const [events, applies, members] = await Promise.all([s.list("Events"), s.list("EventApplies"), s.list("Members")]);
  await fixLegacyTypes(events);
  const mine = applies.filter((a) => a.memberId === session.mid);
  const me = members.find((m) => m.id === session.mid);
  const today = todayKst();
  const perms = me ? effectivePerms(me, await getPermGroups()) : [];
  const manager = ["all", "events", "fees"].some((p) => perms.includes(p));

  const list = events
    .filter((e) => eventVisible(e, me ?? session.mid) || (manager && e.published !== "true"))
    .map((e) => {
      const draft = e.published !== "true";
      const a = mine.find((x) => x.eventId === e.id);
      const attending = a?.answer === "참석";
      const canApply = inClubOrObserver(e, { id: session.mid, clubs: me?.clubs });
      const end = (e.endsAt || e.startsAt || "").slice(0, 10);
      const past = !!end && end < today;
      const myAnswer = canApply ? a?.answer ?? "" : "";
      const group = past ? 3 : e.pinned === "true" ? 0 : canApply && myAnswer !== "불참" ? 1 : 2;
      // 이 회원의 참석일·회원구분·직책에 맞는 회비가 있는지(0원이면 회비 없음)
      const mf = memberFee(e, { kind: me?.kind, position: me?.position }, a);
      const hasFee = canApply && mf.known && payable(mf.amount);
      return {
        id: e.id,
        type: e.type,
        name: e.name,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        place: e.place,
        status: e.status,
        club: e.club ?? "",
        pinned: e.pinned === "true",
        past,
        group,
        canApply, // false: 내가 속하지 않은 소모임 일정(읽기만)
        myAnswer,
        // 참석 여부를 아직 안 알림(날짜가 정해지고 지나지 않은, 신청할 수 있는 일정만)
        needsAnswer: !draft && canApply && myAnswer === "" && !!e.startsAt && !past,
        draft, // 공개 전 초안(관리자에게만 보임)
        // 참석 신청하고 회비를 내지 않았으면 회비 알림
        feeDue: attending && hasFee && a?.paid !== "true",
        feePaid: attending && hasFee && a?.paid === "true",
        payNotice: attending && hasFee && a?.paid !== "true" && Boolean(a?.payNotice),
      };
    })
    .sort((x, y) => {
      if (x.group !== y.group) return x.group - y.group;
      if (!x.startsAt !== !y.startsAt) return x.startsAt ? -1 : 1; // 날짜 없는 일정은 뒤로
      const c = x.startsAt.localeCompare(y.startsAt);
      return x.group === 3 ? -c : c;
    });
  return NextResponse.json({ events: list });
}
