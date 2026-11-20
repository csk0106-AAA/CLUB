import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, isAiEnabled } from "@/lib/ai";
import { bad, guard } from "@/lib/api";
import { loadWho } from "@/lib/who";

// 인터뷰 답변 다듬기: 음성 입력(STT)으로 생긴 오타·잘못 알아들은 단어·띄어쓰기·문장부호를 질문의 문맥에 맞게 고친다.
//  내용을 더하거나 빼거나 말투를 바꾸지 않는다. 고친 글은 회원이 읽어 보고 고친 뒤 보낸다(바로 저장하지 않음).
const body = z.object({ text: z.string().trim().min(1).max(2000), question: z.string().trim().max(1000).default("") });
type Ctx = { params: Promise<{ aid: string }> };

const SYSTEM = `당신은 음성 인식(STT)으로 받아 적은 한국어 답변을 바로잡는 교정자입니다.
규칙:
- 질문의 문맥을 보고, 잘못 알아들은 단어·오타·띄어쓰기·문장부호만 고칩니다.
- 내용을 더하거나 빼지 않고, 말한 사람의 말투(존댓말·반말)와 표현은 그대로 둡니다.
- "음", "어" 같은 군말이나 같은 말을 반복한 부분은 뜻이 바뀌지 않는 선에서 정리합니다.
- 고유명사처럼 확실하지 않은 단어는 원래대로 둡니다.
- 설명 없이 고친 답변 글만 돌려줍니다.`;

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("다듬을 답변을 확인해 주세요(2000자까지).");
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않아 다듬을 수 없어요. 직접 고쳐 주세요.", 503);
  const out = await ask(SYSTEM, [{ role: "user", content: `[질문]\n${p.data.question || "(질문 없음)"}\n\n[받아 적은 답변]\n${p.data.text}` }], 2500);
  if (!out) return bad("지금은 다듬을 수 없어요. 잠시 뒤 다시 눌러 주세요.", 502);
  const text = out.replace(/^\[?고친 답변\]?\s*:?\s*/, "").trim();
  return NextResponse.json({ text, changed: text !== p.data.text });
}
