import { NextResponse } from "next/server";
import { adminOrOfficer } from "@/lib/api";
import { clubLeaders, clubMembers, readAllClubInfo } from "@/lib/clubs";
import { clubPayAccount } from "@/lib/dues";
import { getLists } from "@/lib/lists";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 클럽 목록: 회원 수, 직책자(회장 등), 입금계좌 설정 여부
// 관리자(회원정보 권한)는 모든 클럽, 클럽 직책자는 내가 직책을 맡은 클럽만.
export async function GET() {
  const g = await adminOrOfficer("members");
  if ("err" in g) return g.err;
  const [lists, info, members] = await Promise.all([getLists(), readAllClubInfo(), (await getStore()).list("Members")]);
  const names = g.adminOk ? lists.clubs : lists.clubs.filter((n) => g.officerOf.includes(n));
  const clubs = await Promise.all(names.map(async (name) => {
    const i = info[name];
    return {
      name,
      count: clubMembers(members, name).length,
      leaders: clubLeaders(members, name).map((l) => ({ name: l.name, role: l.role })),
      // 입금계좌: 클럽 › 회비관리의 계좌(없으면 예전 기본 정보의 계좌)
      account: (await clubPayAccount(name, i)).account,
      cycle: i?.cycle ?? "",
    };
  }));
  return NextResponse.json({ clubs, admin: g.adminOk });
}
