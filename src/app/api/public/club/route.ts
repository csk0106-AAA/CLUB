import { NextResponse } from "next/server";
import { getClubNames, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 로그인 전에 보이는 정보: 모임 이름과 이름 목록(이름만). 회사·연락처 등은 내려주지 않는다.
// displayName: 관리자가 고른 "회원 화면에 보일 이름"(정식 이름 또는 줄여 쓰는 이름).
export async function GET() {
  const s = await getStore();
  const n = await getClubNames();
  const members = (await s.list("Members"))
    .filter((m) => m.kind !== "회원대기")
    .map((m) => ({ id: m.id, name: m.name }));
  return NextResponse.json({ clubName: n.clubName || "모임", clubShortName: n.clubShortName, displayName: n.displayName, members });
}
