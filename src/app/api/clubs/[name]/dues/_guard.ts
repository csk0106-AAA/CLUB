import type { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { clubParam, readClubInfo } from "@/lib/clubs";
import { EMPTY_DUES, readClubDues, type Dues } from "@/lib/dues";
import { getLists } from "@/lib/lists";
import { canClubDues } from "@/lib/published";
import { forbid, getMe, type Me } from "@/app/api/board/_lib/server";

export type Ctx = { params: Promise<{ name: string }> };

// 클럽 회비: 관리자(모든 권한·회원정보·회비) 또는 그 클럽의 회장(대표)만. 관리자 2차 비밀번호는 묻지 않는다(지금 DB 기준 권한).
export async function clubDuesGuard(ctx: Ctx): Promise<{ me: Me; club: string } | { err: NextResponse }> {
  const m = await getMe();
  if ("err" in m) return { err: m.err };
  const club = clubParam((await ctx.params).name);
  if (!(await getLists()).clubs.includes(club)) return { err: bad("클럽을 찾을 수 없어요.", 404) };
  if (!(await canClubDues(m.me.row, m.me.perms, club))) return { err: forbid(`${club} 회비는 관리자와 클럽 회장(대표)만 정할 수 있어요.`) };
  return { me: m.me, club };
}

// 아직 저장한 적이 없으면 클럽 기본 정보(계좌·예전 회비 칸)에서 채운다.
export async function currentClubDues(club: string): Promise<Dues> {
  const saved = await readClubDues(club);
  if (saved) return saved;
  const info = await readClubInfo(club);
  return { ...EMPTY_DUES, amount: info.feeAmount, note: info.feeText, bank: info.bank, account: info.account, holder: info.holder };
}
