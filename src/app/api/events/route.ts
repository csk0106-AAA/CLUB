import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { memberFee, payable } from "@/lib/fee";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원이 보는 예정된 모임·행사 목록. 공개된 행사만, 내 신청과 회비 상태를 함께 내려준다.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const s = await getStore();
  const [events, applies, members] = await Promise.all([s.list("Events"), s.list("EventApplies"), s.list("Members")]);
  const mine = applies.filter((a) => a.memberId === session.mid);
  const me = members.find((m) => m.id === session.mid);

  const list = events
    .filter((e) => e.published === "true")
    .map((e) => {
      const a = mine.find((x) => x.eventId === e.id);
      const attending = a?.answer === "참석";
      // 이 회원의 참석일·회원구분·직책에 맞는 회비가 있는지(0원이면 회비 없음)
      const mf = memberFee(e, { kind: me?.kind, position: me?.position }, a);
      const hasFee = mf.known && payable(mf.amount);
      return {
        id: e.id,
        type: e.type,
        name: e.name,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        place: e.place,
        status: e.status,
        myAnswer: a?.answer ?? "",
        // 참석 신청하고 회비를 내지 않았으면 회비 알림
        feeDue: attending && hasFee && a?.paid !== "true",
        feePaid: attending && hasFee && a?.paid === "true",
        payNotice: attending && hasFee && a?.paid !== "true" && Boolean(a?.payNotice),
      };
    });
  return NextResponse.json({ events: list });
}
