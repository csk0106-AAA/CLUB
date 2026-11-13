import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard, parseJson } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!me) return NextResponse.json({ error: "회원 정보를 찾을 수 없어요." }, { status: 401 });
  const extra = parseJson<{ consentAt?: string }>(me.extra, {});
  return NextResponse.json({
    name: g.s.name,
    perms: g.s.perms,
    admin: g.s.admin,
    consent: Boolean(extra.consentAt),
    gender: me.gender === "남" || me.gender === "여" ? me.gender : "",
  });
}

// 내 정보 고치기: 회원이 직접 바꿀 수 있는 항목은 성별뿐이다(나머지는 관리자가 관리).
const patch = z.object({ gender: z.enum(["남", "여"]) });

export async function PATCH(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("성별을 골라 주세요.");
  const row = await (await getStore()).update("Members", g.s.mid, { gender: parsed.data.gender });
  if (!row) return bad("회원 정보를 찾을 수 없어요.", 404);
  return NextResponse.json({ gender: parsed.data.gender });
}
