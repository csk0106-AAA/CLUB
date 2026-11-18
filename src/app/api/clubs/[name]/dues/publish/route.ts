import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { zodMessage } from "@/lib/board";
import { feeSnapshot, publish, publishInput } from "@/lib/published";
import { clubDuesGuard, currentClubDues, type Ctx } from "../_guard";

export const dynamic = "force-dynamic";

// 저장된 클럽 회비 설정을 게시판 글로 올린다(제목 앞에 [클럽 이름]). 관리자 또는 그 클럽 회장(대표)만.
export async function POST(req: Request, ctx: Ctx) {
  const g = await clubDuesGuard(ctx);
  if ("err" in g) return g.err;
  const parsed = publishInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(zodMessage(parsed.error));
  const r = await publish({ kind: "club", club: g.club }, parsed.data, feeSnapshot(await currentClubDues(g.club), g.club), g.me.row.id);
  if ("error" in r) return bad(r.error, r.status);
  return NextResponse.json(r);
}
