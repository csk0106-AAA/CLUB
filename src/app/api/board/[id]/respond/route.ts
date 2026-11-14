import { NextResponse } from "next/server";
import { bad, parseJson } from "@/lib/api";
import { isClosed, RESPONSE_FORMS, type Form } from "@/lib/board";
import { getStore } from "@/lib/store";
import { parseResponse } from "../../_lib/posts";
import { canSee, findPost, getMe } from "../../_lib/server";

export const dynamic = "force-dynamic";

// 설문·투표 답(마감 전까지 고칠 수 있음), 퀴즈 답(한 번만).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return bad("글을 찾을 수 없어요.", 404);
  const form = p.form as Form;
  if (!RESPONSE_FORMS.includes(form)) return bad("응답을 받지 않는 글이에요.");
  const data = parseJson<Record<string, unknown>>(p.data, {});
  if (typeof data.deadline === "string" && isClosed(data.deadline)) return bad("마감되어 더 이상 답할 수 없어요.");
  const parsed = parseResponse(form, data, await req.json().catch(() => null));
  if (!parsed.ok) return bad(parsed.error);
  const s = await getStore();
  const prev = (await s.list("PostResponses")).find((r) => r.postId === p.id && r.memberId === m.me.row.id);
  const now = new Date().toISOString();
  if (prev) {
    if (form === "quiz") return bad("이미 풀었어요. 퀴즈는 한 번만 풀 수 있어요.");
    await s.update("PostResponses", prev.id, { answer: JSON.stringify(parsed.answer), createdAt: now });
  } else {
    await s.insert("PostResponses", { postId: p.id, memberId: m.me.row.id, answer: JSON.stringify(parsed.answer), createdAt: now });
  }
  return NextResponse.json({ ok: true });
}
