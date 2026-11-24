import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { readHosts } from "@/lib/hosts";
import { loginCode } from "@/lib/login-code";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";
import { teams } from "@/lib/capsule";
import { randomInt } from "node:crypto";

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
    if (!/^\d{4,8}$/.test(h.code)) return bad(`${m.name} 님의 진행자 접속번호를 숫자 4자리에서 8자리로 정해 주세요.`);
    // 평소 로그인 번호와 같으면 어느 쪽으로 들어온 건지 구분할 수 없다.
    if (h.code === (await loginCode(m))) return bad(`${m.name} 님의 진행자 접속번호가 평소 초대코드(휴대폰 번호 뒷자리)와 같아요. 다른 번호로 정해 주세요.`);
  }
  // 조 진행자(팀 구성 보드에서 정함)는 그대로 둔다. 같은 사람을 여기서 활동 전체 진행자로 넣으면 조 진행자 지정은 풀린다.
  const teamHosts = readHosts(act).filter((h) => h.teamId && !seen.has(h.memberId));
  const all = [...hosts, ...teamHosts];
  // 예전 칸(hostId/hostCode)에는 첫 진행자를 함께 적어 둔다
  await s.update("EventActivities", aid, { hosts: JSON.stringify(all), hostId: hosts[0]?.memberId ?? "", hostCode: hosts[0]?.code ?? "" });
  return NextResponse.json({ hosts: readHosts({ hosts: JSON.stringify(all) }) });
}

const teamBody = z.object({ teamId: z.string().min(1).max(64), memberId: z.string().max(64) });

// 조 진행자 지정(팀 구성 보드): 조마다 한 명, 그 조 회원 중에서. memberId 가 비면 그 조의 지정을 푼다.
//  접속번호는 자동으로 만든다(숫자 6자리, 평소 초대코드와 다르게). 조 진행자는 그 조만 진행한다(lib/team-run.ts).
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = teamBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("조와 진행자를 확인해 주세요.");
  const { teamId, memberId } = parsed.data;

  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);
  const team = (await teams(aid)).find((t) => t.id === teamId);
  if (!team) return bad("조를 찾을 수 없어요. 화면을 새로 고쳐 주세요.", 404);

  const cur = readHosts(act);
  // 이 조의 예전 지정은 빼고 다시 넣는다
  let next = cur.filter((h) => h.teamId !== teamId);
  if (memberId) {
    const m = (await s.list("Members")).find((x) => x.id === memberId);
    if (!m || isGuest(m.kind)) return bad("진행자로 고를 수 없는 회원이에요.");
    if (!team.memberIds.includes(memberId)) return bad(`${m.name} 님은 ${team.name} 조원이 아니에요. 그 조 회원 중에서 골라 주세요.`);
    if (next.some((h) => h.memberId === memberId && !h.teamId)) return bad(`${m.name} 님은 이미 활동 전체 진행자예요. 위 “진행자”에서 빼고 다시 골라 주세요.`);
    next = next.filter((h) => h.memberId !== memberId);
    const own = await loginCode(m);
    let code = "";
    do code = String(randomInt(100000, 1000000));
    while (code === own);
    next.push({ memberId, code, teamId });
  }
  const whole = next.filter((h) => !h.teamId);
  await s.update("EventActivities", aid, { hosts: JSON.stringify(next), hostId: whole[0]?.memberId ?? "", hostCode: whole[0]?.code ?? "" });
  return NextResponse.json({ hosts: readHosts({ hosts: JSON.stringify(next) }) });
}
