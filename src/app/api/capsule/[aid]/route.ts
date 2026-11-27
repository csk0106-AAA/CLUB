import { NextResponse } from "next/server";
import { onsiteKeyOf } from "@/lib/template-schema";
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/crypto";
import { bad, guard, parseJson } from "@/lib/api";
import { canWriteNow, capsuleCfg, capsuleRows, isOpened, loadCapsule, teamOf } from "@/lib/capsule";
import { NOT_ATTENDEE, canJoin, canAct, NOT_ACTION } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { memberTeamId } from "@/lib/team-run";
import { liveRow } from "@/lib/rounds";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ aid: string }> };

// 내 타임캡슐. 봉인은 서버가 보장한다: 열림 일시 전에는 내용(목표, 팀 약속)을 응답에 넣지 않는다.
// (작성 직후 본인 확인을 관리자가 허용한 경우에만 본인 목표를 돌려준다.)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const c = await loadCapsule(aid);
  if (typeof c === "string") return bad(c, 404);

  const s = await getStore();
  const [cfg, rows, team, members] = await Promise.all([capsuleCfg(aid), capsuleRows(aid), teamOf(aid, g.s.mid), s.list("Members")]);
  const opened = isOpened(cfg.openAt);
  const goalRow = rows.find((r) => r.kind === "goal" && r.ownerId === g.s.mid);
  const pactRow = team ? rows.find((r) => r.kind === "pact" && r.ownerId === team.id) : undefined;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  // 팀 약속: 진행자가 입력한 약속은 봉인 전까지 조원에게 보이고, 조원은 확인한 뒤 "팀 약속 저장하기"를 누른다(pactok 행).
  //  진행자가 약속을 고치면(updatedAt 이 바뀌면) 다시 저장해야 한다.
  const myTeamId = await memberTeamId(c.act, g.s.mid);
  const sealed = (await liveRow(aid, myTeamId))?.step === "seal";
  const okRow = pactRow ? rows.find((r) => r.kind === "pactok" && r.ownerId === g.s.mid && r.lastBy === pactRow.ownerId) : undefined;

  const base = {
    activity: { id: aid, name: c.cfg.name },
    event: { id: c.ev.id, name: c.ev.name },
    canJoin: await canJoin(c.cfg, c.act, c.ev, g.s.mid),
    // 선택참여 회원은 선별 조건에 작성 단계가 있어야 쓴다(없으면 회원 화면에 기다림 안내)
    actionOk: await canAct(c.cfg, c.act, c.ev, g.s.mid, onsiteKeyOf(c.cfg, "write")),
    canWrite: (await canWriteNow(c.cfg, aid, await memberTeamId(c.act, g.s.mid))) && (await canAct(c.cfg, c.act, c.ev, g.s.mid, onsiteKeyOf(c.cfg, "write"))),
    startsAt: c.act.startsAt, // 안내용 정보
    endsAt: c.act.endsAt,
    team: team ? { id: team.id, name: team.name, members: team.memberIds.map(nameOf) } : null,
    openAt: cfg.openAt, // 일시만 알려 준다(등록 전에는 빈 값)
    opened,
    hasGoal: Boolean(goalRow),
    hasPact: Boolean(pactRow),
    sealed, // 이 조가 봉인됐는지
    pactDraft: pactRow && !sealed && !opened ? parseJson<string[]>(decrypt(pactRow.body) ?? "", []) : [], // 진행자가 입력한 약속(봉인 전)
    pactOk: !!okRow && okRow.body === pactRow?.updatedAt, // 지금 약속을 내가 확인하고 저장했는지
    content: null as null | { goal: string; pacts: string[] },
  };

  if (opened) {
    base.content = {
      goal: goalRow ? decrypt(goalRow.body) ?? "" : "",
      pacts: pactRow ? parseJson<string[]>(decrypt(pactRow.body) ?? "", []) : [],
    };
  } else if (cfg.selfView && goalRow) {
    base.content = { goal: decrypt(goalRow.body) ?? "", pacts: [] };
  }
  return NextResponse.json(base);
}

const put = z.object({
  goal: z.string().trim().min(1).max(1000).optional(),
  pacts: z.array(z.string().trim().min(1).max(200)).length(2).optional(),
  confirmPact: z.boolean().optional(), // 진행자가 입력한 팀 약속을 확인하고 저장
});

// 작성(저장). 진행자가 작성을 열기 전, 봉인 후에는 받지 않는다. 본문은 암호화해서 저장한다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const c = await loadCapsule(aid);
  if (typeof c === "string") return bad(c, 404);
  if (!(await canJoin(c.cfg, c.act, c.ev, g.s.mid))) return bad(NOT_ATTENDEE, 403);
  if (!(await canAct(c.cfg, c.act, c.ev, g.s.mid, onsiteKeyOf(c.cfg, "write")))) return bad(NOT_ACTION, 403);
  if (!(await canWriteNow(c.cfg, aid, await memberTeamId(c.act, g.s.mid)))) return bad("지금은 작성할 수 없어요. 진행자가 작성을 열면 쓸 수 있어요.", 409);
  const cfg = await capsuleCfg(aid);
  if (isOpened(cfg.openAt)) return bad("이미 열린 타임캡슐은 고칠 수 없어요.", 409);

  const parsed = put.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.goal && !parsed.data.pacts && !parsed.data.confirmPact)) return bad("목표는 1000자까지 적어 주세요.");
  const { goal, pacts } = parsed.data;
  // 팀 약속은 팀원이 이야기한 뒤 조 진행자가 진행자 화면에서 입력한다(회원은 확인하고 저장만)
  if (pacts) return bad("팀 약속은 조 진행자가 진행자 화면에서 입력해요.", 403);
  if (parsed.data.confirmPact) {
    const team = await teamOf(aid, g.s.mid);
    if (!team) return bad("아직 팀이 정해지지 않았어요.", 409);
    const s0 = await getStore();
    const rows0 = await capsuleRows(aid);
    const pact = rows0.find((r) => r.kind === "pact" && r.ownerId === team.id);
    if (!pact) return bad("아직 진행자가 팀 약속을 입력하지 않았어요.", 409);
    if ((await liveRow(aid, await memberTeamId(c.act, g.s.mid)))?.step === "seal") return bad("이미 봉인됐어요.", 409);
    const mine = rows0.find((r) => r.kind === "pactok" && r.ownerId === g.s.mid && r.lastBy === team.id);
    const patch = { body: pact.updatedAt ?? "", updatedAt: new Date().toISOString() };
    if (mine) await s0.update("Capsules", mine.id, patch);
    else await s0.insert("Capsules", { eventActivityId: aid, kind: "pactok", ownerId: g.s.mid, lastBy: team.id, ...patch });
    if (!goal) return NextResponse.json({ ok: true });
  }

  const s = await getStore();
  const rows = await capsuleRows(aid);
  const now = new Date().toISOString();

  if (goal) {
    const cur = rows.find((r) => r.kind === "goal" && r.ownerId === g.s.mid);
    const patch = { body: encrypt(goal), lastBy: g.s.mid, updatedAt: now };
    if (cur) await s.update("Capsules", cur.id, patch);
    else await s.insert("Capsules", { eventActivityId: aid, kind: "goal", ownerId: g.s.mid, ...patch });
  }
  if (pacts) {
    const team = await teamOf(aid, g.s.mid);
    if (!team) return bad("아직 팀이 정해지지 않았어요. 팀이 정해지면 팀 약속을 쓸 수 있어요.", 409);
    const cur = rows.find((r) => r.kind === "pact" && r.ownerId === team.id);
    // 팀 약속은 팀원이 함께 쓴다. 저장할 때 팀 이름과 구성원도 함께 남긴다(팀 구성은 Teams 에 있다).
    const patch = { body: encrypt(JSON.stringify(pacts)), lastBy: g.s.mid, updatedAt: now };
    if (cur) await s.update("Capsules", cur.id, patch);
    else await s.insert("Capsules", { eventActivityId: aid, kind: "pact", ownerId: team.id, ...patch });
  }
  return NextResponse.json({ ok: true });
}
