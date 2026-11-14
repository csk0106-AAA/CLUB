import { NextResponse } from "next/server";
import { adminIssues } from "@/lib/admin-issues";
import { getMe } from "@/app/api/board/_lib/server";

export const dynamic = "force-dynamic";

// 관리자가 처리할 일 목록(지금 DB 기준 권한). 관리자 2차 비밀번호 전에도 숫자를 보여 주려고 로그인만 확인한다.
// 관리자 권한이 없으면 빈 목록.
export async function GET() {
  const m = await getMe();
  if ("err" in m) return m.err;
  const issues = await adminIssues(m.me.row, m.me.perms);
  return NextResponse.json({ issues, count: issues.length });
}
