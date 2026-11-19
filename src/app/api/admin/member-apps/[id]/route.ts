import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { targetKind, TYPE_LABEL, type AppType } from "@/lib/member-apps";
import { restorePatch, withHistory } from "@/lib/member-history";
import { isGuest, isWithdrawn } from "@/lib/member-kind";
import { checkPermChange, getPermGroups, isAllNow } from "@/lib/perms";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// reason: 반려 사유(반려할 때 꼭 적는다. 신청한 회원이 로그인 뒤 안내에서 본다)
const body = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(300).default("") });

// 회원 신청 승인·반려(관리자 › 회원관리 › 회원신청관리).
//  승인: 회원 요청 → 교육 이수자는 정회원, 비이수자는 준회원으로 바꾼다. 참관 요청 → 회원구분은 그대로("승인 전"만 사라짐).
//  반려: 회원구분은 그대로 두고 명단에 "반려" 표시(사유). 로그인을 막으려면 회원 명단에서 지운다.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("승인 또는 반려를 골라 주세요. 반려 사유는 300자까지 쓸 수 있어요.");
  const { decision, reason } = parsed.data;
  if (decision === "reject" && !reason) return bad("반려 사유를 적어 주세요. 신청한 분이 로그인하면 볼 수 있어요.");

  const s = await getStore();
  const [apps, members] = await Promise.all([s.list("MemberApps"), s.list("Members")]);
  const a = apps.find((x) => x.id === id);
  if (!a) return bad("신청을 찾을 수 없어요.", 404);
  if (a.status !== "pending") return bad("이미 처리된 신청이에요.", 409);
  const who = members.find((m) => m.id === a.memberId);
  if (!who) return bad("신청한 회원이 명단에 없어요(지운 회원). 반려로 처리해 주세요.", decision === "approve" ? 404 : 400);

  const now = new Date().toISOString();
  const byName = members.find((m) => m.id === g.s.mid)?.name ?? "";
  let toKind = "";
  if (decision === "approve" && a.type === "rejoin") {
    // 탈퇴회원 재가입: 탈퇴 해지(탈퇴 전 구분·프로필 북 노출로)
    if (!isWithdrawn(who.kind)) return bad("이미 탈퇴회원이 아니에요. 반려로 처리해 주세요.", 409);
    const p = restorePatch(who, now, byName, "재가입 신청 승인");
    toKind = p.kind;
    await s.update("Members", who.id, { ...p, approvedAt: now, ...(isGuest(toKind) ? {} : { memberSince: now }) });
  } else if (decision === "approve") {
    toKind = targetKind(a);
    if (toKind && toKind !== who.kind) {
      // 회원구분 그룹에 권한이 걸려 있으면 "모든 권한" 관리자만 바꿀 수 있다(회원 명단 수정과 같은 규칙)
      const groups = await getPermGroups();
      const after = members.map((m) => (m.id === who.id ? { ...m, kind: toKind } : m));
      const err = checkPermChange(members, groups, after, groups, await isAllNow(g.s.mid));
      if (err) return bad(err[0], err[1]);
      const patch: Record<string, string> = { kind: toKind, extra: withHistory(who.extra, { at: now, what: "구분 변경", from: who.kind ?? "", to: toKind, by: byName, note: TYPE_LABEL[a.type as AppType] ?? "" }) };
      // 회원 권한 수정: 대기회원이 되면 프로필 북에서 빼고, 정회원·준회원이 되면 프로필 북에 공개한다
      if (a.type === "change") patch.bookHidden = isGuest(toKind) ? "true" : "";
      // 대기·참관에서 회원이 되면 그때부터 신규 회원(프로필 북 맨 위 한 달)
      if (isGuest(who.kind) && !isGuest(toKind)) patch.memberSince = now;
      await s.update("Members", who.id, patch);
    }
    // 승인한 마지막 시각(설정·회원관리에 보임)
    await s.update("Members", who.id, { approvedAt: now });
  }
  await s.update("MemberApps", id, {
    status: decision === "approve" ? "approved" : "rejected",
    reason: decision === "approve" ? "" : reason,
    handledBy: g.s.mid,
    handledAt: now,
    fromKind: who.kind ?? "",
    toKind: toKind || who.kind || "",
    resultSeen: "",
  });
  try {
    await pushTo([who.id], "feedback");
  } catch (e) {
    console.error("[push] 회원 신청 결과 알림 실패", e);
  }
  return NextResponse.json({ ok: true, name: who.name, toKind: toKind || who.kind || "" });
}
