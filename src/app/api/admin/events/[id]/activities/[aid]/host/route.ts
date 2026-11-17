import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { readHosts } from "@/lib/hosts";
import { loginCode } from "@/lib/login-code";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 진행자(사회자) 지정: 여러 명. 사람마다 진행자 접속번호(숫자 4~8자리)를 따로 정한다. 빈 목록이면 지정을 모두 푼다.
const body = z.object({
  hosts: z.array(z.object({ memberId: z.string().min(1).max(64), code: z.string().trim().max(8) })).max(20),
});

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("진행자와 접속번호를 확인해 주세요.");
  const hosts = parsed.data.hosts;

  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);
  const members = await s.list("Members");

  const seen = new Set<string>();
  for (const h of hosts) {
    const m = members.find((x) => x.id === h.memberId);
    if (!m || isGuest(m.kind)) return bad("진행자로 고를 수 없는 회원이 있어요.");
    if (seen.has(h.memberId)) return bad(`${m.name} 님이 두 번 들어 있어요. 한 줄을 지워 주세요.`);
    seen.add(h.memberId);
    if (!/^\d{4,8}$/.test(h.code)) return bad(`${m.name} 님의 진행자 접속번호를 숫자 4~8자리로 정해 주세요.`);
    // 평소 로그인 번호와 같으면 어느 쪽으로 들어온 건지 구분할 수 없다.
    if (h.code === (await loginCode(m))) return bad(`${m.name} 님의 진행자 접속번호가 평소 초대코드(연락처 뒷자리)와 같아요. 다른 번호로 정해 주세요.`);
  }
  // 예전 칸(hostId/hostCode)에는 첫 진행자를 함께 적어 둔다
  await s.update("EventActivities", aid, { hosts: JSON.stringify(hosts), hostId: hosts[0]?.memberId ?? "", hostCode: hosts[0]?.code ?? "" });
  return NextResponse.json({ hosts: readHosts({ hosts: JSON.stringify(hosts) }) });
}
