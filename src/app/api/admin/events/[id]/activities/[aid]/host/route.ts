import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { loginCode } from "@/lib/login-code";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 사회자 지정: 회원 중 한 명 + 사회자 접속번호(숫자 4~8자리). 둘 다 비우면 사회자 지정을 푼다.
const body = z.object({
  hostId: z.string().max(64),
  hostCode: z.string().trim().max(8),
});

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("사회자와 접속번호를 확인해 주세요.");
  const { hostId, hostCode } = parsed.data;

  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);

  if (!hostId) {
    await s.update("EventActivities", aid, { hostId: "", hostCode: "" });
    return NextResponse.json({ hostId: "", hostCode: "" });
  }
  const member = (await s.list("Members")).find((m) => m.id === hostId);
  if (!member || member.kind === "회원대기") return bad("사회자로 고를 수 없는 회원이에요.");
  if (!/^\d{4,8}$/.test(hostCode)) return bad("사회자 접속번호는 숫자 4~8자리로 정해 주세요.");
  // 평소 로그인 번호와 같으면 어느 쪽으로 들어온 건지 구분할 수 없다.
  if (hostCode === (await loginCode(member))) {
    return bad("사회자 접속번호가 이 회원의 평소 초대코드(연락처 뒷자리)와 같아요. 다른 번호로 정해 주세요.");
  }
  await s.update("EventActivities", aid, { hostId, hostCode });
  return NextResponse.json({ hostId, hostCode });
}
