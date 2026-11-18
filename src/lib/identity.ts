import type { Row } from "./store/types";

// 신원 정보 검사. AI 없이도 항상 동작하는 서버 쪽 마지막 방어선이다.
// 회원 명단에 있는 이름, 회사명, 직위, 직책과 "출신 학교" 같은 직접적인 표현을 찾아낸다.

export type IdentityTerms = { names: string[]; companies: string[]; titles: string[] };

export function termsFrom(members: Row[]): IdentityTerms {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter((x) => x.length >= 2))];
  return {
    // 전체 이름과, 성을 뺀 이름이 3글자 이상일 때만 이름 부분(두 글자 이름은 '하늘'처럼 흔한 낱말과 겹친다)
    names: uniq(members.flatMap((m) => [m.name, m.name.length >= 4 ? m.name.slice(1) : ""])),
    companies: uniq(members.map((m) => m.company)),
    titles: uniq(members.flatMap((m) => [m.title, m.position])),
  };
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// 글 안에서 발견된 신원 정보를 돌려준다. 비어 있으면 통과.
export function findIdentity(text: string, t: IdentityTerms): string[] {
  const hay = norm(text);
  const hits: string[] = [];
  for (const term of [...t.names, ...t.companies]) {
    if (hay.includes(norm(term))) hits.push(term);
  }
  // 직위·직책은 "감사(합니다)", "이사(했어요)"처럼 흔한 낱말과 겹친다.
  // 그래서 글자만 들어 있으면 넘어가고, 자기 직함을 밝히는 꼴(감사입니다 · 이사로 일해요 · 부장직 · 회장을 맡고…)일 때만 걸러낸다.
  const role = "\\s*(입니다|이에요|예요|이고|이며|이라서|라서|이었|였|직|님|으로서|로서|으로\\s*일|로\\s*일|으로\\s*근무|로\\s*근무|으로\\s*승진|로\\s*승진|을\\s*맡|를\\s*맡|역할|이\\s*됐|가\\s*됐|이\\s*되|가\\s*되)";
  for (const term of t.titles) {
    const body = [...term.replace(/\s+/g, "")].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
    const m = text.match(new RegExp(`(${body})${role}`, "i"));
    if (m) hits.push(m[0].trim()); // 걸린 표현 그대로(화면에서 그 부분만 표시되게)
  }
  // 학교, 직함을 직접 밝히는 표현
  for (const re of [/[가-힣A-Za-z]+(대학교|대학원|고등학교)/, /(대표이사|사장|회장)\s*(입니다|이에요|예요)/]) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  return [...new Set(hits)];
}

// 일반화: 회사명은 '한 회사'로, 이름은 지운다. AI 없이 초안을 만들 때 쓴다.
export function generalize(text: string, t: IdentityTerms): string {
  let out = text;
  for (const c of t.companies) out = out.split(c).join("한 회사");
  for (const n of t.names) out = out.split(n).join("");
  return out.replace(/ {2,}/g, " ").trim();
}

// 수정 요청이 지침에 어긋나는지 규칙으로 먼저 걸러낸다(AI 판정 전에 항상 실행).
export function revisionRuleCheck(request: string, t: IdentityTerms): string | null {
  const hits = findIdentity(request, t);
  if (hits.length > 0) return "이름, 회사명, 직함처럼 신원이 드러나는 정보는 소개글에 넣을 수 없어요.";
  if (/(생년월일|태어난\s*(날|시)|사주)/.test(request)) return "생년월일 같은 개인정보는 소개글에 넣을 수 없어요.";
  if (/(출신\s*학교|어느\s*대학|졸업한\s*학교)/.test(request)) return "출신 학교는 신원이 드러나서 넣을 수 없어요.";
  return null;
}
