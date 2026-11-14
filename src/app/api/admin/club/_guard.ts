import type { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { CLUB, type ClubKind } from "@/lib/club";
import { forbid, getMe } from "@/app/api/board/_lib/server";

// 회칙은 게시판의 회칙 글에서 고친다: 지금 DB 기준 "전체 관리자(all)"만 (관리자 2차 비밀번호는 묻지 않음).
// 조직도·회의록은 예전처럼 관리자 권한 + 2차 비밀번호.
export async function clubGuard(kind: ClubKind): Promise<{ name: string } | { err: NextResponse }> {
  if (kind === "rules") {
    const m = await getMe();
    if ("err" in m) return { err: m.err };
    if (!m.me.isAll) return { err: forbid("회칙은 전체 관리자만 고칠 수 있어요.") };
    return { name: m.me.row.name };
  }
  const g = await guard(CLUB[kind].perm);
  if ("err" in g) return { err: g.err };
  return { name: g.s.name };
}
