import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { isGuest } from "@/lib/member-kind";
import { getStore } from "@/lib/store";

// 회원 여러 명의 표시 값을 한 번에 바꾼다(회원명단에서).
//  bookShown: 프로필 북 노출(끄면 프로필 북에서 빠진다), edu: 교육 이수(정회원 필수 조건)
//  바뀌는 회원만 저장하고, 몇 명이 바뀌었는지 돌려준다.
const body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(2000),
  bookShown: z.boolean().optional(),
  edu: z.boolean().optional(),
}).refine((v) => v.bookShown !== undefined || v.edu !== undefined, { message: "바꿀 항목이 없어요." });

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("바꿀 회원과 항목을 확인해 주세요.");
  const { ids, bookShown, edu } = parsed.data;
  const s = await getStore();
  const want = new Set(ids);
  // 대기회원·참관회원·탈퇴회원은 프로필 북에 공개할 수 없다(회원구분을 먼저 바꾼다)
  if (bookShown === true && (await s.list("Members")).some((m) => want.has(m.id) && isGuest(m.kind))) {
    return bad("회원정보를 수정해야 합니다. 대기회원·참관회원은 프로필 북에 공개되지 않아요.", 409);
  }
  let changed = 0;
  for (const m of await s.list("Members")) {
    if (!want.has(m.id)) continue;
    const patch: Record<string, string> = {};
    if (bookShown !== undefined && (m.bookHidden === "true") === bookShown) patch.bookHidden = bookShown ? "" : "true";
    if (edu !== undefined && (m.edu === "true") !== edu) patch.edu = edu ? "true" : "";
    if (Object.keys(patch).length) {
      await s.update("Members", m.id, patch);
      changed++;
    }
  }
  return NextResponse.json({ ok: true, changed });
}
