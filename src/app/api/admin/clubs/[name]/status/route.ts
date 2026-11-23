import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { clubBackup, isClubPaused, purgeClub, setClubPaused } from "@/lib/club-status";
import { clubParam } from "@/lib/clubs";
import { getLists } from "@/lib/lists";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

async function clubName(ctx: Ctx): Promise<string | null> {
  const name = clubParam((await ctx.params).name);
  return (await getLists()).clubs.includes(name) ? name : null;
}

// 클럽 상태 바꾸기: { paused: true } 활동 중지 / { paused: false } 다시 활동. 관리자(회원정보 권한)만(클럽 직책자는 못 한다).
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const name = await clubName(ctx);
  if (!name) return bad("클럽을 찾을 수 없어요.", 404);
  const p = z.object({ paused: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("상태를 확인해 주세요.");
  await setClubPaused(name, p.data.paused, g.s.mid);
  return NextResponse.json({ ok: true, paused: p.data.paused });
}

// 삭제 전 백업 내려받기(모든 권한 관리자만)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard("all");
  if ("err" in g) return g.err;
  const name = await clubName(ctx);
  if (!name) return bad("클럽을 찾을 수 없어요.", 404);
  return NextResponse.json(await clubBackup(name));
}

// 삭제(모든 기록): 모든 권한 관리자만, 활동 중지된 클럽만, 클럽 이름을 그대로 입력해야 한다.
//  일정·신청 내역·클럽 게시글을 지운 뒤, 화면이 목록에서 지우기(lists PUT)를 불러 회원 소속·개요·회비 설정을 정리한다.
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard("all");
  if ("err" in g) return g.err;
  const name = await clubName(ctx);
  if (!name) return bad("클럽을 찾을 수 없어요.", 404);
  const p = z.object({ confirm: z.string() }).safeParse(await req.json().catch(() => null));
  if (!p.success || p.data.confirm.trim() !== name) return bad("확인을 위해 클럽 이름을 그대로 입력해 주세요.");
  if (!(await isClubPaused(name))) return bad("활동 중지한 클럽만 삭제할 수 있어요. 먼저 활동 중지해 주세요.", 409);
  const r = await purgeClub(name);
  return NextResponse.json({ ok: true, ...r });
}
