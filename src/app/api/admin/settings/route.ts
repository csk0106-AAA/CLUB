import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({
  clubName: z.string().trim().min(1).max(80),
  clubShortName: z.string().trim().max(40).default(""),
  inviteCode: z.string().trim().min(4).max(32),
});

// 원우회 이름, 초대코드. (회원구분·직책·소모임 목록은 /api/admin/lists 에서 다룬다)
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  return NextResponse.json({
    clubName: await getSetting("clubName", ""),
    clubShortName: await getSetting("clubShortName", ""),
    inviteCode: await getSetting("inviteCode", ""),
  });
}

export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 초대코드는 4자 이상이에요.");
  const d = parsed.data;
  await setSetting("clubName", d.clubName);
  await setSetting("clubShortName", d.clubShortName);
  await setSetting("inviteCode", d.inviteCode);
  return NextResponse.json({ ok: true });
}
