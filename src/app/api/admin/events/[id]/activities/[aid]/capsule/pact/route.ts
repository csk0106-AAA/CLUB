import { NextResponse } from "next/server";
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/crypto";
import { bad, hostGuard, parseJson } from "@/lib/api";
import { capsuleCfg, capsuleRows, isOpened, loadCapsule, teams } from "@/lib/capsule";
import { liveRow } from "@/lib/rounds";
import { getStore } from "@/lib/store";
import { teamRunInfo } from "@/lib/team-run";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

// 팀 약속(타임캡슐): 팀원이 이야기한 뒤 진행자가 입력하고 봉인한다.
//  조 진행자는 맡은 조만, 관리자는 모든 조. 봉인(그 조의 회원 화면이 "봉인" 단계) 뒤나 열림 일시 뒤에는 고칠 수 없다.
//  봉인 전에는 입력한 진행자가 확인할 수 있게 내용을 돌려준다(봉인 뒤에는 열림 일시까지 아무도 볼 수 없다).
async function sealedOf(aid: string, teamId: string, runOn: boolean): Promise<boolean> {
  return (await liveRow(aid, runOn ? teamId : ""))?.step === "seal";
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id, aid } = await ctx.params;
  const g = await hostGuard(aid);
  if ("err" in g) return g.err;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const [cfg, rows, ts, run] = await Promise.all([capsuleCfg(aid), capsuleRows(aid), teams(aid), teamRunInfo(c.act)]);
  const opened = isOpened(cfg.openAt);
  const members = await (await getStore()).list("Members");
  type M = { id: string; name: string; goal: boolean; pactOk: boolean };
  const out: Record<string, { pacts: string[]; saved: boolean; sealed: boolean; members: M[] }> = {};
  for (const t of ts) {
    if (g.team && t.id !== g.team) continue;
    const row = rows.find((r) => r.kind === "pact" && r.ownerId === t.id);
    const sealed = opened || (await sealedOf(aid, t.id, run.on));
    // 조원마다: 1년 뒤 목표를 봉인했는지, 지금 팀 약속을 확인하고 저장했는지(내용은 보여 주지 않는다)
    const ms: M[] = t.memberIds.map((mid) => {
      const ok = rows.find((r) => r.kind === "pactok" && r.ownerId === mid && r.lastBy === t.id);
      return { id: mid, name: members.find((m) => m.id === mid)?.name ?? "", goal: rows.some((r) => r.kind === "goal" && r.ownerId === mid), pactOk: !!row && !!ok && ok.body === row.updatedAt };
    });
    out[t.id] = { pacts: row && !sealed ? parseJson<string[]>(decrypt(row.body) ?? "", []) : [], saved: !!row, sealed, members: ms };
  }
  return NextResponse.json({ teams: out, opened });
}

const body = z.object({ teamId: z.string().min(1), pacts: z.array(z.string().trim().min(1).max(200)).length(2) });

export async function PUT(req: Request, ctx: Ctx) {
  const { id, aid } = await ctx.params;
  const g = await hostGuard(aid);
  if ("err" in g) return g.err;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("팀 약속 2가지를 각각 200자까지 적어 주세요.");
  const { teamId, pacts } = parsed.data;
  if (g.team && g.team !== teamId) return bad("맡은 조의 약속만 입력할 수 있어요.", 403);
  const ts = await teams(aid);
  if (!ts.some((t) => t.id === teamId)) return bad("없는 조예요. 화면을 새로 고쳐 주세요.", 400);
  const [cfg, run] = await Promise.all([capsuleCfg(aid), teamRunInfo(c.act)]);
  if (isOpened(cfg.openAt)) return bad("이미 열린 타임캡슐은 고칠 수 없어요.", 409);
  if (await sealedOf(aid, teamId, run.on)) return bad("이미 봉인했어요. 고치려면 회원 화면을 “타임캡슐 작성하기” 단계로 다시 열어 주세요.", 409);
  const s = await getStore();
  const cur = (await capsuleRows(aid)).find((r) => r.kind === "pact" && r.ownerId === teamId);
  const patch = { body: encrypt(JSON.stringify(pacts)), lastBy: g.s.mid, updatedAt: new Date().toISOString() };
  if (cur) await s.update("Capsules", cur.id, patch);
  else await s.insert("Capsules", { eventActivityId: aid, kind: "pact", ownerId: teamId, ...patch });
  return NextResponse.json({ ok: true });
}
