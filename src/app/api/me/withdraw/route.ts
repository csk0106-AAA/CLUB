import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { clearSession } from "@/lib/auth";
import { ensureWithdrawnKind, withdrawPatch } from "@/lib/member-history";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { getStore } from "@/lib/store";

// 설정 › 회원 탈퇴. 회원구분을 "탈퇴회원"으로 바꾸고 바로 로그아웃한다.
//  관리자 명단에서는 지우지 않는다(투표·설문·퀴즈·댓글·일정·활동 기록은 그대로). 프로필 북에서는 바로 빠진다.
//  처리 중인 회원 신청은 취소한다. 다시 활동하려면 로그인 화면에서 재가입을 신청하고 관리자가 확인한다.
export async function POST() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const [members, apps] = await Promise.all([s.list("Members"), s.list("MemberApps")]);
  const me = members.find((m) => m.id === g.s.mid);
  if (!me) return bad("회원 정보를 찾을 수 없어요.", 404);
  // 관리자 권한이 있는 회원이 탈퇴하면 관리할 사람이 없어질 수 있어서 막는다
  if (effectivePerms(me, await getPermGroups()).length > 0) {
    return bad("관리자 권한이 있는 회원은 바로 탈퇴할 수 없어요. 다른 관리자에게 권한을 넘기거나 권한을 없앤 뒤 탈퇴해 주세요.", 403);
  }
  const now = new Date().toISOString();
  await s.update("Members", me.id, withdrawPatch(me, now));
  for (const a of apps.filter((x) => x.memberId === me.id && x.status === "pending")) {
    await s.update("MemberApps", a.id, { status: "canceled", reason: "회원 탈퇴로 취소", handledAt: now, resultSeen: "true" });
  }
  await ensureWithdrawnKind();
  await clearSession();
  return NextResponse.json({ ok: true });
}
