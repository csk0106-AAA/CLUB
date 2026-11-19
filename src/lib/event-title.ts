// 회원에게 보이는 일정 이름: 클럽 일정이면 "[클럽] 일정 이름"(클럽 게시글 제목과 같은 표기).
// 이름에 이미 클럽 이름이 들어 있으면 그대로, 이름이 비어 있으면 클럽 이름만.
export function eventTitle(name: string, club?: string): string {
  const n = (name ?? "").trim();
  const c = (club ?? "").trim();
  if (!c) return n;
  if (!n) return c;
  return n.includes(c) ? n : `[${c}] ${n}`;
}
