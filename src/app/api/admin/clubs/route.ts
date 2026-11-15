import { NextResponse } from "next/server";
import { adminOrOfficer } from "@/lib/api";
import { clubAccount, clubLeaders, clubMembers, readAllClubInfo } from "@/lib/clubs";
import { getLists } from "@/lib/lists";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 소모임 목록: 회원 수, 직책자(회장 등), 입금계좌 설정 여부
// 관리자(회원정보 권한)는 모든 소모임, 소모임 직책자는 내가 직책을 맡은 소모임만.
export async function GET() {
  const g = await adminOrOfficer("members");
  if ("err" in g) return g.err;
  const [lists, info, members] = await Promise.all([getLists(), readAllClubInfo(), (await getStore()).list("Members")]);
  const names = g.adminOk ? lists.clubs : lists.clubs.filter((n) => g.officerOf.includes(n));
  const clubs = names.map((name) => {
    const i = info[name];
    return {
      name,
      count: clubMembers(members, name).length,
      leaders: clubLeaders(members, name).map((l) => ({ name: l.name, role: l.role })),
      account: i ? clubAccount(i) : "",
      cycle: i?.cycle ?? "",
    };
  });
  return NextResponse.json({ clubs, admin: g.adminOk });
}
