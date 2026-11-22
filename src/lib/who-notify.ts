// '내가 누구일까요?'에 새 별칭 소개가 올라오면, 아직 맞히지 않은 참여자에게 알려 맞히기에 참여하도록 이끈다.
//  받는 사람: 이 활동의 활동참여자 중 맞히기(guess)를 하는 회원(전체참여, 또는 선택참여인데 선별 조건에 맞히기가 있는 회원), 본인 제외.
//  맞히기 기간이 끝났으면 보내지 않는다. 같은 활동의 읽지 않은 알림이 이미 있으면 또 보내지 않는다(알림이 쌓이지 않게).
import { guessStatus, windowBase } from "./activities";
import { addAlerts } from "./member-alerts";
import { rosterLevels } from "./participants";
import { pushTo } from "./push";
import { getStore } from "./store";
import { actionAllowed } from "./template-schema";
import type { WhoCtx } from "./who";

export async function notifyNewWhoIntro(ctx: WhoCtx, authorId: string): Promise<void> {
  if (ctx.book || !ctx.cfg.guessPhase?.enabled) return;
  const gs = guessStatus(ctx.cfg, windowBase(ctx.act, ctx.ev));
  if (gs.status === "closed" || gs.status === "none") return;
  const levels = await rosterLevels(ctx.act);
  const s = await getStore();
  const href = `/events/${ctx.ev.id}/who/${ctx.act.id}?tab=guess`;
  const [guesses, alerts] = await Promise.all([s.list("Guesses"), s.list("MemberAlerts")]);
  const to = [...levels.entries()]
    .filter(([mid, lv]) => mid !== authorId && actionAllowed(ctx.cfg, lv, "guess"))
    .map(([mid]) => mid)
    // 이 소개를 이미 맞힌(고른) 회원은 빼고, 같은 활동의 읽지 않은 알림이 있으면 또 보내지 않는다
    .filter((mid) => !guesses.some((x) => x.guesserId === mid && x.targetMemberId === authorId && x.eventActivityId === ctx.act.id))
    .filter((mid) => !alerts.some((a) => a.memberId === mid && a.href === href && a.seen !== "true"));
  if (!to.length) return;
  const text = gs.status === "open"
    ? `‘${ctx.cfg.name}’에 새 소개가 올라왔어요. 누구인지 맞혀 보세요!`
    : `‘${ctx.cfg.name}’에 새 소개가 올라왔어요. ${gs.opensAt}부터 누구인지 맞혀 볼 수 있어요.`;
  await addAlerts(to, { eventId: ctx.ev.id, text, href });
  await pushTo(to, "alerts").catch(() => undefined);
}
