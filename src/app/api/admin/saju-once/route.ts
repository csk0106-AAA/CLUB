import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 명리학 풀이는 한 번만(sajuOnce): 켜면 한 번 받은 회원은 다시 만들 수 없다(AI 비용). 테스트 기간에는 꺼 둔다. lib/saju-run.ts sajuCanRedo
export async function GET() {
  const g = await guard("group");
  if ("err" in g) return g.err;
  return NextResponse.json({ once: await getSetting<boolean>("sajuOnce", false) });
}

export async function PUT(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const p = z.object({ once: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("요청을 확인해 주세요.");
  await setSetting("sajuOnce", p.data.once);
  return NextResponse.json({ once: p.data.once });
}
