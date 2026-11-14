import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { clubAccount, clubLeaders, clubMembers, readAllClubInfo } from "@/lib/clubs";
import { getLists } from "@/lib/lists";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 소모임 목록: 회원 수, 직책자(회장 등), 입금계좌 설정 여부
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const [lists, info, members] = await Promise.all([getLists(), readAllClubInfo(), (await getStore()).list("Members")]);
  const clubs = lists.clubs.map((name) => {
    const i = info[name];
    return {
      name,
      count: clubMembers(members, name).length,
      leaders: clubLeaders(members, name).map((l) => ({ name: l.name, role: l.role })),
      account: i ? clubAccount(i) : "",
      cycle: i?.cycle ?? "",
    };
  });
  return NextResponse.json({ clubs });
}
