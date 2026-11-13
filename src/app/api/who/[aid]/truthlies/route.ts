import { NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled } from "@/lib/ai";
import { bad, guard } from "@/lib/api";
import { termsFrom } from "@/lib/identity";
import { canJoin } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { generateTruthLies, qaPairs } from "@/lib/truthlies";
import { loadWho, myInterview, myProfile, myTruthLies, writeClosed } from "@/lib/who";

const body = z.object({ introMd: z.string().max(8000).default("") });

// 2진실 1거짓만 AI로 다시 만든다(소개 글은 그대로). 화면의 지금 소개 글을 받아 겹치지 않게 한다.
export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않았어요. 문장 3개를 직접 적어 주세요.", 503);
  if (!(await canJoin(w.cfg, w.act, w.ev, g.s.mid))) return bad("이 활동의 참여 대상이 아니라 2진실 1거짓은 필요 없어요.");

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const profile = await myProfile(g.s.mid);
  if (profile?.introStatus === "approved") return bad("승인을 취소한 뒤 다시 만들 수 있어요.", 409);

  const { messages } = await myInterview(g.s.mid, aid);
  const s = await getStore();
  const terms = termsFrom(await s.list("Members"));
  const qa = qaPairs(messages, terms);
  if (qa.length === 0) return bad("인터뷰 답변이 있어야 만들 수 있어요.");

  const intro = parsed.data.introMd || profile?.draftMd || "";
  const out = await generateTruthLies(intro, qa, terms);
  if (!out) return bad("AI가 문장을 만들지 못했어요. 잠시 후 다시 눌러 주세요.", 502);

  const tl = await myTruthLies(g.s.mid, aid);
  const patch = { statements: JSON.stringify(out.statements), lieIndex: String(out.lieIndex), status: "draft" };
  if (tl) await s.update("TruthLies", tl.id, patch);
  else await s.insert("TruthLies", { memberId: g.s.mid, eventActivityId: aid, ...patch });
  return NextResponse.json(out);
}
