import { isRevealed, isWhoAmI, readConfig } from "./activities";
import { randomNickname } from "./nickname";
import { joinSet } from "./participants";
import { getStore } from "./store";
import type { Row } from "./store/types";
import { familyRows } from "./template-versions";
import { DEFAULT_TEMPLATES, type TemplateConfig } from "./template-schema";

// 프로필 북의 "소개 작성하기"(일정 활동이 아닌 곳에서 쓰는 내 소개).
//  프로필 북 전용 활동 템플릿 "AI소개인터뷰"(id profile-intro)의 **최신 버전** 질문·AI 지침을 쓴다(템플릿 화면에서 따로 관리).
//  게임용 '내가 누구일까요?'와 지침이 섞이지 않는다. 2진실 1거짓은 없다. 전용 템플릿이 없으면 '내가 누구일까요?' v1 을 쓴다.
//  인터뷰는 Interviews.eventActivityId = PROFILE_AID 로 저장한다. 완료하면 프로필 북에 실명으로 바로 보인다.
export const PROFILE_AID = "profile-book";
export const WHO_V1_ID = "who-am-i";
export const BOOK_TEMPLATE_ID = "profile-intro";

// 프로필 북 소개 작성에 쓰는 템플릿: 전용 템플릿 묶음의 최신 버전 → 없으면 '내가 누구일까요?' v1 → 없으면 기본값
export async function whoV1(): Promise<{ row: Row; cfg: TemplateConfig }> {
  const rows = await (await getStore()).list("ActivityTemplates");
  const fam = familyRows(rows, BOOK_TEMPLATE_ID);
  const t = fam[fam.length - 1] ?? rows.find((x) => x.id === WHO_V1_ID);
  const cfg = readConfig(t?.config) ?? DEFAULT_TEMPLATES.find((d) => d.id === WHO_V1_ID)!;
  // 활동 행 모양: templateId 로 AI 지침·질문을 템플릿에서 읽는다(lib/ai-guides.ts activityAiConfig)
  const row: Row = { id: PROFILE_AID, eventId: "", templateId: t?.id ?? "", config: JSON.stringify(cfg), startsAt: "", endsAt: "" };
  return { row, cfg };
}

// 지금 별칭으로 가려야 하는 회원: 실명 공개 전인 '내가 누구일까요?' 활동의 게임 참여 회원(참여 상태 in).
// 값: 회원 id → { 활동 id, 일정 id }
export async function maskedMembers(): Promise<Map<string, { aid: string; eventId: string }>> {
  const s = await getStore();
  const [acts, events] = await Promise.all([s.list("EventActivities"), s.list("Events")]);
  const out = new Map<string, { aid: string; eventId: string }>();
  for (const act of acts) {
    const cfg = readConfig(act.config);
    if (!cfg || !isWhoAmI(cfg)) continue;
    const ev = events.find((e) => e.id === act.eventId && e.published === "true");
    if (!ev || isRevealed(cfg, act, ev)) continue;
    const set = await joinSet(cfg, act, ev);
    for (const id of set ?? []) if (!out.has(id)) out.set(id, { aid: act.id, eventId: ev.id });
  }
  return out;
}

// 별칭이 없으면 랜덤 별칭을 만들어 저장한다(프로필 행이 없으면 만든다). 별칭을 돌려준다.
export async function ensureAlias(memberId: string, profiles?: Row[]): Promise<string> {
  const s = await getStore();
  const list = profiles ?? (await s.list("Profiles"));
  const mine = list.find((p) => p.memberId === memberId);
  if (mine?.alias) return mine.alias;
  const alias = randomNickname(list.filter((p) => p.alias).map((p) => p.alias));
  const now = new Date().toISOString();
  if (mine) {
    await s.update("Profiles", mine.id, { alias, updatedAt: now });
    mine.alias = alias;
  } else {
    const row = await s.insert("Profiles", { memberId, alias, introStatus: "none", updatedAt: now });
    list.push(row);
  }
  return alias;
}

// 다른 회원과 겹치지 않는 새 랜덤 별칭으로 바꾼다(이미 실명으로 알려진 별칭을 게임에 다시 쓰지 않도록)
export async function newAlias(memberId: string): Promise<string> {
  const s = await getStore();
  const list = await s.list("Profiles");
  const alias = randomNickname(list.filter((p) => p.alias).map((p) => p.alias));
  const mine = list.find((p) => p.memberId === memberId);
  const now = new Date().toISOString();
  if (mine) await s.update("Profiles", mine.id, { alias, updatedAt: now });
  else await s.insert("Profiles", { memberId, alias, introStatus: "none", updatedAt: now });
  return alias;
}
