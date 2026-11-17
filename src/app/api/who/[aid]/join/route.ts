import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { newAlias } from "@/lib/profile-book";
import { getStore } from "@/lib/store";
import { loadWho, myInterview, myProfile, myTruthLies, whoState } from "@/lib/who";

export const dynamic = "force-dynamic";

// 이미 실명과 소개가 공개된 회원이 '내가 누굴까요?' 참여 대상으로 선택됐을 때의 선택.
//  update : 기존 내 소개를 지우고 이 활동으로 새로 쓴다(새 별칭으로 가려지고, 실명 공개 시점에 다시 실명으로).
//  optout : 업데이트하지 않는다 → 이 활동에는 참여하지 않는다(2진실 1거짓·맞히기에서 빠진다).
const body = z.object({ decision: z.enum(["update", "optout"]) });

export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  if (w.book) return bad("일정 활동에서만 고를 수 있어요.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("업데이트할지 골라 주세요.");
  const st = await whoState(w, g.s.mid);
  if (st !== "prompt") return bad(st === "none" ? "이 활동의 참여 대상이 아니에요." : "이미 골랐어요. 화면을 새로 고쳐 주세요.", 409);

  const s = await getStore();
  const now = new Date().toISOString();
  const { row } = await myInterview(g.s.mid, aid);
  if (parsed.data.decision === "optout") {
    if (row) await s.update("Interviews", row.id, { status: "optout", updatedAt: now });
    else await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: aid, messages: "[]", status: "optout", updatedAt: now });
    return NextResponse.json({ state: "optout" });
  }
  // update: 기존 소개를 지우고 새 별칭으로 이 활동 참여(인터뷰 행을 만들어 참여 상태 in)
  const profile = await myProfile(g.s.mid);
  if (profile) await s.update("Profiles", profile.id, { introMd: "", draftMd: "", introStatus: "none", updatedAt: now });
  const tl = await myTruthLies(g.s.mid, aid);
  if (tl) await s.remove("TruthLies", tl.id);
  if (row) await s.update("Interviews", row.id, { messages: "[]", status: "active", updatedAt: now });
  else await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: aid, messages: "[]", status: "active", updatedAt: now });
  const alias = await newAlias(g.s.mid);
  return NextResponse.json({ state: "in", alias });
}
