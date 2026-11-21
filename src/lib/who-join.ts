import { addAlerts } from "./member-alerts";
import { newAlias } from "./profile-book";
import { pushTo } from "./push";
import { getStore } from "./store";
import { myInterview, myProfile, myTruthLies, windows, type WhoCtx } from "./who";

// 이미 프로필 북에 실명 소개가 공개된 회원이 '내가 누구일까요?'(프로필 북 익명 + 맞히기 게임) 참여 대상이 됐을 때의 선택.
//  update  "프로필북 초기화": 지금 소개를 지우고(백업 Profiles.introBackup) 새 별칭으로 이 활동에서 다시 쓴다 → 맞히기 대상
//  partial "일부활동참여"  : 지금 실명 소개는 그대로, 맞히기 대상에서만 빠지고 맞히기·투표 등 나머지는 참여(Interviews.status "optout")
//  초기화는 사전 작성 마감 전에만 할 수 있다(다른 회원이 맞히기를 시작한 뒤에는 대상에 넣지 않는다).
//  사전 작성 마감까지 고르지 않으면 대상에 들어가지 않으므로 "일부활동참여"와 같다.
export type WhoDecision = "update" | "partial";

export async function decideWho(ctx: WhoCtx, memberId: string, decision: WhoDecision, byAdmin?: { name: string }): Promise<{ ok: true; state: "in" | "optout"; alias?: string } | { ok: false; error: string; status: number }> {
  const s = await getStore();
  const now = new Date().toISOString();
  const { row } = await myInterview(memberId, ctx.act.id);
  if (decision === "partial") {
    if (row) await s.update("Interviews", row.id, { status: "optout", updatedAt: now });
    else await s.insert("Interviews", { memberId, eventActivityId: ctx.act.id, messages: "[]", status: "optout", updatedAt: now });
    if (byAdmin) await tell(memberId, ctx, `${ctx.ev.name}의 ‘${ctx.cfg.name}’에서 관리자가 “일부 활동 참여”로 정했어요. 내 소개는 그대로 두고, 맞히기·투표에 참여해요.`);
    return { ok: true, state: "optout" };
  }
  if (windows(ctx).pre.status === "closed") return { ok: false, error: "사전 작성이 마감돼 프로필 북을 초기화할 수 없어요. “일부활동참여”만 고를 수 있어요.", status: 409 };
  // 초기화: 지운 소개는 백업해 둔다(잘못 눌렀을 때 되살릴 수 있게)
  const profile = await myProfile(memberId);
  if (profile) {
    const backup = profile.introMd || profile.draftMd ? JSON.stringify({ at: now, by: byAdmin?.name ?? "본인", introMd: profile.introMd ?? "", draftMd: profile.draftMd ?? "", approvedAt: profile.approvedAt ?? "" }) : profile.introBackup ?? "";
    await s.update("Profiles", profile.id, { introBackup: backup, introMd: "", draftMd: "", introStatus: "none", updatedAt: now });
  }
  const tl = await myTruthLies(memberId, ctx.act.id);
  if (tl) await s.remove("TruthLies", tl.id);
  if (row) await s.update("Interviews", row.id, { messages: "[]", status: "active", updatedAt: now });
  else await s.insert("Interviews", { memberId, eventActivityId: ctx.act.id, messages: "[]", status: "active", updatedAt: now });
  const alias = await newAlias(memberId);
  if (byAdmin) await tell(memberId, ctx, `${ctx.ev.name}의 ‘${ctx.cfg.name}’ 참여를 위해 관리자가 프로필 북을 초기화했어요. 이 활동에서 별칭 “${alias}”(으)로 소개를 다시 써 주세요.`);
  return { ok: true, state: "in", alias };
}

// 회원에게 고르도록 알림(관리자가 "회원에게 묻기")
export async function askWho(ctx: WhoCtx, memberId: string): Promise<void> {
  await tell(memberId, ctx, `${ctx.ev.name}의 ‘${ctx.cfg.name}’은 프로필 북을 익명으로 하고 누구인지 맞히는 게임이에요. 이미 공개된 내 소개를 초기화하고 모두 참여할지, 일부 활동만 참여할지 골라 주세요.`);
}

async function tell(memberId: string, ctx: WhoCtx, text: string) {
  await addAlerts([memberId], { eventId: ctx.ev.id, text, href: `/events/${ctx.ev.id}/who/${ctx.act.id}` });
  await pushTo([memberId], "alerts").catch(() => undefined);
}
