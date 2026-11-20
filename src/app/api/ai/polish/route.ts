import { NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled } from "@/lib/ai";
import { bad, guard } from "@/lib/api";
import { polishText } from "@/lib/polish";

// 받아 적은 글 다듬기(로그인한 회원): 고민 작성 등. 결과는 화면에서 읽어 보고 저장한다.
const body = z.object({ text: z.string().trim().min(1).max(2000), question: z.string().trim().max(1000).default("") });

export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("다듬을 글을 확인해 주세요(2000자까지).");
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않아 다듬을 수 없어요. 직접 고쳐 주세요.", 503);
  const text = await polishText(p.data.text, p.data.question);
  if (!text) return bad("지금은 다듬을 수 없어요. 잠시 뒤 다시 눌러 주세요.", 502);
  return NextResponse.json({ text, changed: text !== p.data.text });
}
