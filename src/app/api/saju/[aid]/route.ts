import { NextResponse } from "next/server";
import { readConfig } from "@/lib/activities";
import { bad, guard, parseJson } from "@/lib/api";
import { hasBlock, sajuOpen, sajuWhenOf } from "@/lib/blocks";
import { canAct, canJoin } from "@/lib/participants";
import { sajuDelete, sajuPatch, sajuPost } from "@/lib/saju-run";
import { getStore } from "@/lib/store";
import { myProfile } from "@/lib/who";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ aid: string }> };

// 기능 블록 "명리학 사주풀이"를 넣은 일정 활동(나의 고민은?, 타임캡슐 등 어느 활동이든)의 회원 화면용.
//  여는 시점은 활동 템플릿 설정(sajuWhen), 참여 대상은 그 활동의 참여 대상. 처리는 lib/saju-run.ts.
async function load(aid: string, memberId: string) {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid);
  const cfg = readConfig(act?.config);
  const ev = act ? (await s.list("Events")).find((e) => e.id === act.eventId && e.published === "true") : undefined;
  if (!act || !cfg || !ev) return null;
  const joined = (await canJoin(cfg, act, ev, memberId)) && (await canAct(cfg, act, ev, memberId, "block:saju"));
  return { act, cfg, ev, joined, enabled: hasBlock(cfg, "saju"), open: sajuOpen(cfg, ev) };
}

// GET: 이 활동에 사주풀이가 있는지, 지금 받을 수 있는지, 내 풀이
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const c = await load(aid, g.s.mid);
  if (!c) return bad("활동을 찾을 수 없어요.", 404);
  if (!c.enabled || !c.joined) return NextResponse.json({ enabled: false });
  const p = await myProfile(g.s.mid);
  return NextResponse.json({
    enabled: true,
    open: c.open,
    when: sajuWhenOf(c.cfg),
    published: p?.introStatus === "approved",
    reading: {
      readingStatus: p?.readingStatus ?? "", readingMd: p?.readingMd ?? "", traitsMd: p?.traitsMd ?? "",
      traitsShown: p?.traitsShown === "true", sajuInfo: parseJson<unknown>(p?.sajuInfo, null),
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const c = await load(aid, g.s.mid);
  if (!c) return bad("활동을 찾을 수 없어요.", 404);
  if (!c.enabled) return bad("이 활동에는 명리학 사주풀이가 없어요.", 409);
  if (!c.joined) return bad("이 활동의 참여 대상이 아니에요.", 403);
  if (!c.open) return bad("지금은 사주풀이를 받을 수 있는 때가 아니에요.", 409);
  return sajuPost(g.s.mid, await req.json().catch(() => null), c.act);
}

export async function PATCH(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  return sajuPatch(g.s.mid, await req.json().catch(() => null));
}

export async function DELETE() {
  const g = await guard();
  if ("err" in g) return g.err;
  return sajuDelete(g.s.mid);
}
