import { NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled } from "@/lib/ai";
import { polishText } from "@/lib/polish";
import { bad, guard } from "@/lib/api";
import { loadWho } from "@/lib/who";

// 인터뷰 답변 다듬기: 음성 입력(STT)으로 생긴 오타·잘못 알아들은 단어·띄어쓰기·문장부호를 질문의 문맥에 맞게 고친다.
//  내용을 더하거나 빼거나 말투를 바꾸지 않는다. 고친 글은 회원이 읽어 보고 고친 뒤 보낸다(바로 저장하지 않음).
const body = z.object({ text: z.string().trim().min(1).max(2000), question: z.string().trim().max(1000).default("") });
type Ctx = { params: Promise<{ aid: string }> };


export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("다듬을 답변을 확인해 주세요(2000자까지).");
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않아 다듬을 수 없어요. 직접 고쳐 주세요.", 503);
  const text = await polishText(p.data.text, p.data.question);
  if (!text) return bad("지금은 다듬을 수 없어요. 잠시 뒤 다시 눌러 주세요.", 502);
  return NextResponse.json({ text, changed: text !== p.data.text });
}
