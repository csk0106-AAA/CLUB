import { NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled } from "@/lib/ai";
import { bad, guard } from "@/lib/api";
import { findIdentity, termsFrom } from "@/lib/identity";
import { getStore } from "@/lib/store";
import { generateTruthLies, keyWords, qaPairs } from "@/lib/truthlies";
import { inGame, loadWho, myInterview, myProfile, myTruthLies, writeClosed, writeGate } from "@/lib/who";

type Ctx = { params: Promise<{ aid: string }> };
const body = z.object({ introMd: z.string().max(8000).optional() });

// 2진실 1거짓만 다시 만들기: 소개 글은 그대로 두고, 인터뷰 답변으로 문장 3개를 새로 만든다.
//  진실 문장은 지금 소개 글(화면에서 고치고 있는 글)에 나온 내용을 쓰지 않는다 — 핵심 단어가 소개 글에 있으면 한 번 더 만든다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;
  if (!(await inGame(w, g.s.mid)) || !w.cfg.preEvent.steps.includes("truth_lies")) return bad("이 활동에는 2진실 1거짓이 없어요.", 409);
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않아 다시 만들 수 없어요. 문장 3개를 직접 적어 주세요.", 503);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");

  const s = await getStore();
  const profile = await myProfile(g.s.mid);
  if (profile?.introStatus === "approved") return bad("승인된 소개가 있어요. 승인을 취소한 뒤 다시 만들 수 있어요.", 409);
  const intro = (parsed.data.introMd ?? profile?.draftMd ?? "").trim();
  const iv = await myInterview(g.s.mid, aid);
  const terms = termsFrom(await s.list("Members"));
  const qa = qaPairs(iv.messages, terms);
  if (!qa.length) return bad("인터뷰 답변이 없어요. 인터뷰를 먼저 해 주세요.", 409);

  let best: { statements: string[]; lieIndex: number; leaked: string[] } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tl = await generateTruthLies(intro, qa, terms, w.act);
    if (!tl) continue;
    const truths = tl.statements.filter((_, i) => i !== tl.lieIndex);
    const leaked = keyWords(truths).filter((k) => intro.includes(k));
    if (!best || leaked.length < best.leaked.length) best = { ...tl, leaked };
    if (leaked.length === 0) break;
  }
  if (!best) return bad("AI가 문장을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", 502);

  const tl = await myTruthLies(g.s.mid, aid);
  const patch = { statements: JSON.stringify(best.statements), lieIndex: String(best.lieIndex), status: "draft" };
  if (tl) await s.update("TruthLies", tl.id, patch);
  else await s.insert("TruthLies", { memberId: g.s.mid, eventActivityId: aid, ...patch });
  return NextResponse.json({ statements: best.statements, lieIndex: best.lieIndex, leaked: best.leaked, remaining: findIdentity(best.statements.join(" "), terms) });
}
