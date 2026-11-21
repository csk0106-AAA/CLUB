import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { loadWho, whoState } from "@/lib/who";
import { decideWho } from "@/lib/who-join";

export const dynamic = "force-dynamic";

// 이미 실명과 소개가 공개된 회원이 '내가 누굴까요?' 참여 대상일 때 고른다(lib/who-join.ts).
//  update "프로필북 초기화" / partial "일부활동참여"(예전 이름 optout 도 받는다)
//  일부활동참여를 고른 뒤에도 사전 작성 마감 전이면 초기화로 바꿀 수 있다.
const body = z.object({ decision: z.enum(["update", "partial", "optout"]) });

export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  if (w.book) return bad("일정 활동에서만 고를 수 있어요.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("“프로필북 초기화” 또는 “일부활동참여”를 골라 주세요.");
  const st = await whoState(w, g.s.mid);
  if (st === "none") return bad("이 활동의 참여 대상이 아니에요.", 409);
  if (st === "in") return bad("이미 이 활동에서 소개를 쓰고 있어요. 화면을 새로 고쳐 주세요.", 409);
  const r = await decideWho(w, g.s.mid, parsed.data.decision === "update" ? "update" : "partial");
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ state: r.state, alias: r.alias });
}
