import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, hostGuard } from "@/lib/api";
import { activityKind, liveView, readConfig } from "@/lib/activities";
import { hostGate } from "@/lib/host-gate";
import { onsiteGate } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { liveOf, scopeOf } from "@/lib/team-run";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), step: z.string().min(1) }), // 진행자가 단계 버튼을 누름 → 회원 화면 켜짐
  z.object({ action: z.literal("lock") }), // 회원 화면을 다시 잠금(예: 투표 마감)
  z.object({ action: z.literal("reset") }), // 현장 진행 처음으로
]);

// 지금 회원 화면 상태(진행자 전체화면 위쪽의 잠그기·다시 열기·처음으로 칸이 읽는다)
//  조별 진행이면 ?team=조 id 의 상태. steps: 진행자 버튼이 있는 단계(팀 화면에서 단계를 여는 데 쓴다)
export async function GET(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await hostGuard((await ctx.params).aid);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);
  const cfg = readConfig(act.config);
  if (!cfg) return bad("활동 설정을 읽을 수 없어요.", 500);
  const sc = await scopeOf(req, act, g);
  if (sc instanceof NextResponse) return sc;
  const cur = liveOf(await s.list("LiveState"), aid, sc.teamId);
  return NextResponse.json({
    live: liveView(cfg, cur),
    kind: activityKind(cfg),
    steps: cfg.onsite.steps.filter((x) => x.hostButton).map((x) => ({ key: x.key, label: x.hostButton })),
  });
}

// 진행자 컨트롤. 어떤 버튼이 있는지, 누르면 회원 화면이 무엇으로 바뀌는지는 모두 템플릿 설정이 정한다.
//  조별 진행이면 ?team=조 id 의 회원 화면만 바꾼다. ?team=all 이면 모든 조(와 활동 전체 줄)에 같이 적용한다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await hostGuard((await ctx.params).aid);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");

  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);
  const cfg = readConfig(act.config);
  if (!cfg) return bad("활동 설정을 읽을 수 없어요.", 500);
  const sc = await scopeOf(req, act, g, { allowAll: true });
  if (sc instanceof NextResponse) return sc;

  const lives = await s.list("LiveState");
  const d = parsed.data;
  let warning: string | undefined;
  if (d.action === "activate") {
    if (!cfg.onsite.steps.some((x) => x.key === d.step)) return bad("없는 단계예요.");
    // 관리자 선택 회원 활동은 활동 전에 출석 체크를 완료해야 시작할 수 있다.
    const gate = await onsiteGate(cfg, act);
    if (gate) return bad(gate, 409);
    // 진행자가 꼭 있어야 하는 활동인데 진행자가 없으면: 관리자는 알려만 주고, 그 밖에는 막는다.
    const hg = hostGate(cfg, act, g.s);
    if (hg.block) return bad(hg.block, 409);
    warning = hg.warn;
  }

  // 한 줄(조 하나 또는 활동 전체)에 적용한다
  async function apply(teamId: string): Promise<{ step: string; unlocked: boolean } | string> {
    const cur = liveOf(lives, aid, teamId);
    let step = cur?.step ?? "";
    let unlocked = cur?.memberUnlocked === "true";
    if (d.action === "activate") {
      step = d.step;
      unlocked = true; // host_click, immediate 모두 이 시점에 켜진다
    } else if (d.action === "lock") {
      if (!step) return "진행 중인 단계가 없어요.";
      unlocked = false;
    } else {
      step = "";
      unlocked = false;
    }
    const patch = { step, memberUnlocked: String(unlocked), updatedAt: new Date().toISOString() };
    if (cur) await s.update("LiveState", cur.id, patch);
    else await s.insert("LiveState", { eventActivityId: aid, ...patch, teamId });
    return { step, unlocked };
  }

  if (sc.all) {
    // 모든 조에 같이 적용: 잠그기는 진행 중인 조만(진행 전인 조는 그대로)
    for (const t of ["", ...sc.teams.map((x) => x.id)]) {
      if (d.action === "lock" && !liveOf(lives, aid, t)?.step) continue;
      await apply(t);
    }
    return NextResponse.json({ ok: true, all: true, ...(warning ? { warning } : {}) });
  }

  const r = await apply(sc.teamId);
  if (typeof r === "string") return bad(r);
  return NextResponse.json({ live: liveView(cfg, { step: r.step, memberUnlocked: String(r.unlocked) }), ...(warning ? { warning } : {}) });
}
