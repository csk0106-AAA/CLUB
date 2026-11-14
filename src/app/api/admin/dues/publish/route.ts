import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { zodMessage } from "@/lib/board";
import { readDues } from "@/lib/dues";
import { canDues, feeSnapshot, publish, publishInput } from "@/lib/published";
import { forbid, getMe } from "@/app/api/board/_lib/server";

export const dynamic = "force-dynamic";

// 저장된 원우회 회비 설정을 게시판 글로 올린다(새 글 또는 고른 회비 글 고치기).
// 권한: 관리자 2차 비밀번호 + 지금 DB 기준 회비(fees) 또는 모든 권한.
export async function POST(req: Request) {
  const g = await guard("fees");
  if ("err" in g) return g.err;
  const m = await getMe();
  if ("err" in m) return m.err;
  if (!canDues(m.me.perms)) return forbid("회비 글은 회비 권한이 있는 관리자만 올릴 수 있어요.");
  const parsed = publishInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(zodMessage(parsed.error));
  const r = await publish({ kind: "dues" }, parsed.data, feeSnapshot(await readDues()), m.me.row.id);
  if ("error" in r) return bad(r.error, r.status);
  return NextResponse.json(r);
}
