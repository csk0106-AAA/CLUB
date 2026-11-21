// 기능 블록: 개발된 기능 하나하나. 활동 템플릿에서 켜고 끄면 실제 동작이 바뀐다(화면·서버가 hasBlock 으로 판단).
//  블록은 템플릿 설정의 사전 단계(preEvent.steps)에 단계 키로 들어간다. 따로 저장하는 값은 없다.
//  화면(템플릿 편집기)과 서버가 함께 쓰므로 서버 전용 모듈을 가져오지 않는다.
//  새 블록을 만들려면 개발이 필요하다(템플릿 화면의 "AI에게 개발 요청"으로 요청).
import type { TemplateConfig, TemplateStep } from "./template-schema";

export type BlockKey = "saju" | "truthlies";
type Cfg = Pick<TemplateConfig, "preEvent" | "onsite"> & { bookOnly?: boolean };

export type Block = {
  key: BlockKey;
  name: string;
  step: string; // 사전 단계 키
  needs: string; // 이 단계가 있는 활동에만 넣을 수 있다
  needsText: string;
  summary: string;
  rulesNote?: string; // 코드에 있는 지침 안내
  onsite?: TemplateStep[]; // 켜면 함께 넣는 현장 단계(끄면 뺀다)
};

export const BLOCKS: Block[] = [
  {
    key: "saju",
    name: "명리학 사주풀이",
    step: "reading_optional",
    needs: "ai_interview",
    needsText: "AI 인터뷰로 소개를 쓰는 활동에만 넣을 수 있어요. ‘내가 누구일까요?’나 ‘내 소개(프로필 북)’를 복제해서 시작하세요.",
    summary: "인터뷰를 마친 회원이 원하면 생년월일·태어난 시각으로 사주풀이를 받아요(받지 않아도 돼요). 성격·성향 풀이는 소개 페이지 끝에 공개(회원이 뺄 수 있어요)되고, 생애주기 풀이는 본인만 봐요.",
    rulesNote: "명리학 필수 지침(아래)이 항상 적용돼요. 지침은 코드에 있어서 여기서는 읽기만 할 수 있어요.",
  },
  {
    key: "truthlies",
    name: "2진실 1거짓",
    step: "truth_lies",
    needs: "ai_interview",
    needsText: "AI 인터뷰로 소개를 쓰는 활동에만 넣을 수 있어요. ‘내가 누구일까요?’를 복제해서 시작하세요.",
    summary: "AI가 인터뷰 답변으로 진실 2개와 거짓 1개 문장을 만들고(소개 글에는 그 내용을 빼고 써요), 현장에서 거짓 투표와 정답 공개를 해요. 별칭으로 참여하는 회원에게만 적용돼요. 켜면 현장 단계 ‘거짓 투표’와 ‘정답 공개’가 함께 들어가요. 세부 AI 지침은 ‘AI 지침’의 ‘2진실 1거짓 문장 만들기’에서 적어요.",
    onsite: [
      { key: "vote", label: "거짓 투표", memberScreen: "vote", unlock: "host_click", hostButton: "투표" },
      { key: "result", label: "정답 공개", memberScreen: "view", unlock: "host_click", hostButton: "정답 공개" },
    ],
  },
];

export const blockOf = (k: BlockKey): Block => BLOCKS.find((b) => b.key === k)!;
// 프로필 북 전용 활동(실명 소개)에는 2진실 1거짓을 넣지 않는다(게임이 없다)
export const canAddBlock = (c: Cfg, k: BlockKey): boolean => c.preEvent.steps.includes(blockOf(k).needs) && !(k === "truthlies" && c.bookOnly);
export const hasBlock = (c: Cfg, k: BlockKey): boolean => canAddBlock(c, k) && c.preEvent.steps.includes(blockOf(k).step);

// 블록 켜기/끄기: 사전 단계에 넣거나 빼고(본인 승인 단계 앞에), 함께 쓰는 현장 단계도 넣거나 뺀다
export function setBlock<C extends Cfg>(c: C, k: BlockKey, on: boolean): C {
  const b = blockOf(k);
  let steps = c.preEvent.steps.filter((s) => s !== b.step);
  if (on) {
    const at = steps.indexOf("approve");
    steps = at < 0 ? [...steps, b.step] : [...steps.slice(0, at), b.step, ...steps.slice(at)];
  }
  let onsite = c.onsite.steps;
  if (b.onsite) {
    const keys = b.onsite.map((x) => x.key);
    onsite = onsite.filter((x) => !keys.includes(x.key));
    if (on) onsite = [...onsite, ...b.onsite];
    if (!onsite.length) onsite = c.onsite.steps; // 현장 단계가 하나는 있어야 한다
  }
  return { ...c, preEvent: { ...c.preEvent, steps }, onsite: { ...c.onsite, steps: onsite } };
}
