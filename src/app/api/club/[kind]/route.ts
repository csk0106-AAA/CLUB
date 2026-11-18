import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { isGuest } from "@/lib/member-kind";
import { getStore } from "@/lib/store";
import { clubLeaders, readAllClubInfo } from "@/lib/clubs";
import { getLists } from "@/lib/lists";

export const dynamic = "force-dynamic";

// 회원이 보는 모임 정보: 조직도(이름과 직책만), 회칙. 회의록은 관리자만 본다.
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { kind } = await ctx.params;
  const s = await getStore();
  if (kind === "org") {
    // 회원 구분과 연동: 모임 직책(목록 순서, 일반회원 제외)마다 그 직책인 회원,
    // 클럽(목록 순서)마다 클럽 직책자와 클럽관리의 모임 주기. 대기회원·참관회원은 넣지 않는다.
    const [all, lists, info] = await Promise.all([s.list("Members"), getLists(), readAllClubInfo()]);
    const members = all.filter((m) => !isGuest(m.kind));
    return NextResponse.json({
      items: lists.positions.filter((p) => p !== "일반회원").map((p) => ({
        id: p, dept: p, role: "", names: members.filter((m) => m.position === p).map((m) => m.name),
        memberIds: members.filter((m) => m.position === p).map((m) => m.id),
      })),
      clubs: lists.clubs.map((name) => ({
        name, cycle: info[name]?.cycle ?? "",
        // 클럽 직책 목록 순서대로
        leaders: clubLeaders(members, name)
          .sort((a, b) => lists.clubRoles.indexOf(a.role) - lists.clubRoles.indexOf(b.role))
          .map((l) => ({ name: l.name, role: l.role })),
      })),
    });
  }
  if (kind === "rules") {
    const rules = (await s.list("Rules")).filter((r) => r.hidden !== "true"); // 공개 조문만
    return NextResponse.json({ items: rules.map((r) => ({ id: r.id, chapter: r.chapter, article: r.article, body: r.body, version: r.version })) });
  }
  return bad("볼 수 없는 항목이에요.", 404);
}
