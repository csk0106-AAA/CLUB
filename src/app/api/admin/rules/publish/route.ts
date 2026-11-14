import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { DEFAULT_TEMPLATES, zodMessage } from "@/lib/board";
import { canRules, postsOf, publish, publishInput, rulesSnapshot } from "@/lib/published";
import { forbid, getMe } from "@/app/api/board/_lib/server";

export const dynamic = "force-dynamic";

// 회칙 글 목록(올릴 때 고를 기존 글)과 지금 연결된 글. 권한: 모든 권한(관리자 2차 비밀번호).
export async function GET() {
  const g = await guard("all");
  if ("err" in g) return g.err;
  const pub = await postsOf({ kind: "rules" });
  return NextResponse.json({ ...pub, template: { title: DEFAULT_TEMPLATES.rules.title, body: DEFAULT_TEMPLATES.rules.body } });
}

// 지금 "확정"된 회칙 조문을 게시판 글로 올린다(새 글 또는 고른 회칙 글 고치기).
export async function POST(req: Request) {
  const g = await guard("all");
  if ("err" in g) return g.err;
  const m = await getMe();
  if ("err" in m) return m.err;
  if (!canRules(m.me.perms)) return forbid("회칙 글은 전체 관리자만 올릴 수 있어요.");
  const parsed = publishInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(zodMessage(parsed.error));
  const snap = await rulesSnapshot();
  if (!(snap.rules as unknown[]).length) return bad("확정된 회칙 조문이 없어요. 조문을 “확정”으로 표시한 뒤 올려 주세요.");
  const r = await publish({ kind: "rules" }, parsed.data, snap, m.me.row.id);
  if ("error" in r) return bad(r.error, r.status);
  return NextResponse.json(r);
}
