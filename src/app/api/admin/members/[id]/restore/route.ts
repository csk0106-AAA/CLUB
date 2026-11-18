import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { restorePatch } from "@/lib/member-history";
import { isWithdrawn } from "@/lib/member-kind";
import { checkPermChange, getPermGroups, isAllNow } from "@/lib/perms";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

// 관리자 › 회원 수정 › "탈퇴 해지": 탈퇴 전 회원구분·프로필 북 노출로 되돌려 다시 로그인·활동할 수 있게 한다.
// 처리 중인 재가입 신청이 있으면 함께 승인 처리한다.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [members, apps] = await Promise.all([s.list("Members"), s.list("MemberApps")]);
  const who = members.find((m) => m.id === id);
  if (!who) return bad("회원을 찾을 수 없어요.", 404);
  if (!isWithdrawn(who.kind)) return bad("탈퇴회원이 아니에요.", 409);
  const now = new Date().toISOString();
  const by = members.find((m) => m.id === g.s.mid)?.name ?? "";
  const patch = restorePatch(who, now, by);
  // 되돌린 구분에 권한이 걸려 있으면 "모든 권한" 관리자만(회원 수정과 같은 규칙)
  const groups = await getPermGroups();
  const err = checkPermChange(members, groups, members.map((m) => (m.id === id ? { ...m, ...patch } : m)), groups, await isAllNow(g.s.mid));
  if (err) return bad(err[0], err[1]);
  await s.update("Members", id, patch);
  for (const a of apps.filter((x) => x.memberId === id && x.type === "rejoin" && x.status === "pending")) {
    await s.update("MemberApps", a.id, { status: "approved", handledBy: g.s.mid, handledAt: now, fromKind: who.kind ?? "", toKind: patch.kind, resultSeen: "" });
  }
  try {
    await pushTo([id], "feedback");
  } catch (e) {
    console.error("[push] 탈퇴 해지 알림 실패", e);
  }
  return NextResponse.json({ ok: true, kind: patch.kind });
}
