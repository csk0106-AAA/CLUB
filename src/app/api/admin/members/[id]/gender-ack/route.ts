import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { withGenderEdit } from "@/lib/gender-edit";
import { getStore } from "@/lib/store";

// 회원이 직접 바꾼 성별을 관리자가 확인했다: "회원 수정" 표시만 지운다(성별 값은 그대로).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const cur = (await s.list("Members")).find((m) => m.id === id);
  if (!cur) return bad("회원을 찾을 수 없어요.", 404);
  await s.update("Members", id, { extra: withGenderEdit(cur.extra, null) });
  return NextResponse.json({ ok: true });
}
