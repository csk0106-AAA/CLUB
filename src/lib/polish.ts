import { ask } from "./ai";

// 음성 입력(STT)으로 받아 적은 글 다듬기(서버 전용): 질문·주제의 문맥에 맞게 오타·잘못 알아들은 단어·띄어쓰기·문장부호만 고친다.
//  내용을 더하거나 빼거나 말투를 바꾸지 않는다. 결과는 회원이 읽어 보고 고친 뒤 저장한다(바로 저장하지 않음).
//  AI 인터뷰 답변(/api/who/[aid]/polish)과 고민 작성 등(/api/ai/polish)이 함께 쓴다.
const SYSTEM = `당신은 음성 인식(STT)으로 받아 적은 한국어 글을 바로잡는 교정자입니다.
규칙:
- 질문(또는 주제)의 문맥을 보고, 잘못 알아들은 단어·오타·띄어쓰기·문장부호만 고칩니다.
- 내용을 더하거나 빼지 않고, 쓴 사람의 말투(존댓말·반말)와 표현은 그대로 둡니다.
- "음", "어" 같은 군말이나 같은 말을 반복한 부분은 뜻이 바뀌지 않는 선에서 정리합니다.
- 고유명사처럼 확실하지 않은 단어는 원래대로 둡니다.
- 설명 없이 고친 글만 돌려줍니다.`;

export async function polishText(text: string, question: string): Promise<string | null> {
  const out = await ask(SYSTEM, [{ role: "user", content: `[질문 또는 주제]\n${question || "(없음)"}\n\n[받아 적은 글]\n${text}` }], 2500);
  if (!out) return null;
  return out.replace(/^\[?(고친 (답변|글))\]?\s*:?\s*/, "").trim();
}
