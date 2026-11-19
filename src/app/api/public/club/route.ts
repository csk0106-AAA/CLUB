import { NextResponse } from "next/server";
import { coverUrl, readCovers } from "@/lib/covers";
import { getRequirement } from "@/lib/member-apps";
import { getClubNames, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 로그인 전에 보이는 정보: 모임 이름과 이름 목록(이름만). 회사·연락처 등은 내려주지 않는다.
// displayName: 관리자가 고른 "회원 화면에 보일 이름"(정식 이름 또는 줄여 쓰는 이름).
// 대기회원·참관회원·승인 전 신청자도 로그인할 수 있다(로그인을 막으려면 관리자가 명단에서 지운다).
// requirement: 정회원 필수 조건(로그인 화면 "회원 또는 참관 신청"에서 묻는다)
// coverUrl: 모임 대표사진(로그인 화면 맨 위). 없으면 "" → 지금처럼 마스코트.
export async function GET() {
  const s = await getStore();
  const n = await getClubNames();
  const members = (await s.list("Members")).map((m) => ({ id: m.id, name: m.name }));
  return NextResponse.json({
    clubName: n.clubName || "모임", clubShortName: n.clubShortName, displayName: n.displayName, members,
    requirement: await getRequirement(),
    coverUrl: await (async () => { const m = await readCovers(); return m.org ? coverUrl({ scope: "org" }, m.org, false, m.focus.org ?? "") : ""; })(),
  });
}
