import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getRequirement, REQ_KEY } from "@/lib/member-apps";
import { getClubNames, getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({
  clubName: z.string().trim().min(1).max(80),
  clubShortName: z.string().trim().max(40).default(""),
  clubNameDisplay: z.enum(["full", "short"]).default("full"),
  inviteCode: z.string().trim().min(4).max(32),
  // 정회원 필수 조건(로그인 화면 회원 신청에서 "○○ 하셨나요?"로 묻는다)
  requirement: z.string().trim().max(80).default(""),
});

// 모임 이름(정식·줄인 이름, 회원 화면에 보일 이름), 초대코드. (회원구분·직책·소모임 목록은 /api/admin/lists 에서 다룬다)
export async function GET() {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const n = await getClubNames();
  return NextResponse.json({
    clubName: n.clubName,
    clubShortName: n.clubShortName,
    clubNameDisplay: n.clubNameDisplay,
    inviteCode: await getSetting("inviteCode", ""),
    requirement: await getRequirement(),
  });
}

export async function PUT(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 초대코드는 4자 이상이에요.");
  const d = parsed.data;
  await setSetting("clubName", d.clubName);
  await setSetting("clubShortName", d.clubShortName);
  await setSetting("clubNameDisplay", d.clubNameDisplay);
  await setSetting("inviteCode", d.inviteCode);
  await setSetting(REQ_KEY, d.requirement);
  return NextResponse.json({ ok: true });
}
