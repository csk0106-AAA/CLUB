// 기능 블록: 개발된 기능 하나하나. 어느 활동 템플릿에나 넣을 수 있고, 넣은 블록은 실제로 동작한다(화면·서버가 hasBlock 으로 판단).
//  블록은 기능(과 그 안의 흐름)만 가진다. 언제 열지·누가 참여할지 같은 설정은 활동 템플릿에서 정한다(예: sajuWhen).
//  템플릿 설정의 blocks 목록에 키로 들어간다. 블록은 코드로 만들어서 버전이 없다(바뀌면 쓰는 모든 활동에 함께 반영).
//  화면(템플릿 편집기)과 서버가 함께 쓰므로 서버 전용 모듈을 가져오지 않는다.
//  새 블록을 만들려면 개발이 필요하다(활동템플릿 › 기능블록의 "+ 새 기능블록 요청" 또는 편집 창의 "AI에게 요청"에서 개발 요청).
import { preWindowTimes, type TemplateConfig } from "./template-schema";

export type BlockKey = "saju";
type Cfg = Pick<TemplateConfig, "preEvent" | "blocks" | "sajuWhen">;

export type Block = {
  key: BlockKey;
  name: string;
  summary: string;
  rulesNote?: string; // 코드에 있는 지침 안내
};

export const BLOCKS: Block[] = [
  {
    key: "saju",
    name: "명리학 사주풀이",
    summary: "회원이 원하면 생년월일·태어난 시각으로 사주풀이를 받아요(받지 않아도 돼요). 성격·성향 풀이는 소개 페이지 끝에 공개(회원이 뺄 수 있어요)되고, 생애주기 풀이는 본인만 봐요. 풀이는 회원마다 하나라서, 다른 활동에서 이미 받았으면 그 풀이를 보여 줘요.",
    rulesNote: "명리학 필수 지침(아래)이 항상 적용돼요. 지침은 코드에 있어서 여기서는 읽기만 할 수 있어요.",
  },
];

export const blockOf = (k: BlockKey): Block => BLOCKS.find((b) => b.key === k)!;
// 예전 설정: 사주풀이는 사전 단계 "reading_optional" 로 들어 있었다
export const hasBlock = (c: Cfg, k: BlockKey): boolean => (c.blocks ?? []).includes(k) || (k === "saju" && c.preEvent.steps.includes("reading_optional"));

// 사주풀이를 여는 시점(활동 설정): interview(AI 인터뷰를 마친 뒤, 소개 글 만들기 전) / pre(사전 작성 기간) / event(일정 당일)
export type SajuWhen = "interview" | "pre" | "event";
export const SAJU_WHEN_LABEL: Record<SajuWhen, string> = { interview: "AI 인터뷰를 마친 뒤 (소개 글 만들기 전)", pre: "사전 작성 기간", event: "일정 당일 (시작부터 끝날 때까지)" };
export function sajuWhenOptions(c: Pick<TemplateConfig, "preEvent">): SajuWhen[] {
  const out: SajuWhen[] = [];
  if (c.preEvent.steps.includes("ai_interview")) out.push("interview");
  if (c.preEvent.enabled) out.push("pre");
  out.push("event");
  return out;
}
export function sajuWhenOf(c: Pick<TemplateConfig, "preEvent" | "sajuWhen">): SajuWhen {
  const opts = sajuWhenOptions(c);
  return c.sajuWhen && opts.includes(c.sajuWhen) ? c.sajuWhen : opts[0];
}

// 블록 켜기/끄기(예전 사전 단계 reading_optional 은 뺀다). 사주풀이를 켜면 여는 시점의 처음 값을 정한다.
export function setBlock<C extends Cfg>(c: C, k: BlockKey, on: boolean): C {
  const blocks = (c.blocks ?? []).filter((x) => x !== k);
  const steps = c.preEvent.steps.filter((s) => !(k === "saju" && s === "reading_optional"));
  const next: C = { ...c, blocks: on ? [...blocks, k] : blocks, preEvent: { ...c.preEvent, steps } };
  if (k === "saju" && on) next.sajuWhen = sajuWhenOf(next);
  if (k === "saju" && !on) delete next.sajuWhen;
  return next;
}

// 한국 시간 "YYYY-MM-DDTHH:mm"(또는 날짜만) → 시각
function kst(t: string | undefined): number {
  if (!t) return NaN;
  return Date.parse(t.length <= 16 ? `${t.length === 10 ? `${t}T00:00` : t}:00+09:00` : t);
}

// 지금 사주풀이를 새로 받을 수 있는지(받은 풀이를 보는 것은 언제나 된다)
//  book: 프로필 북 "소개 작성하기"는 기간이 없다
export function sajuOpen(c: Pick<TemplateConfig, "preEvent" | "sajuWhen">, ev: { startsAt?: string; endsAt?: string }, book = false, now = Date.now()): boolean {
  if (book) return true;
  const when = sajuWhenOf(c);
  if (when === "event") {
    const start = kst(ev.startsAt);
    if (!Number.isFinite(start)) return false;
    const endRaw = kst(ev.endsAt);
    const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 24 * 3600_000;
    return now >= start && now <= end;
  }
  if (!c.preEvent.enabled) return false;
  const w = preWindowTimes(c.preEvent, ev.startsAt ?? "");
  return !!w && now >= w.opens && now <= w.closes;
}
