// 회원명단 순서: NO 순서(없으면 뒤로, 같으면 저장된 순서). 관리자가 끌어서 바꾼 순서가 NO 로 저장된다.
export function sortByNo<T extends { no?: string }>(list: T[]): T[] {
  const n = (m: T) => (Number(m.no) > 0 ? Number(m.no) : Number.MAX_SAFE_INTEGER);
  return list.map((m, i) => ({ m, i })).sort((a, b) => n(a.m) - n(b.m) || a.i - b.i).map((x) => x.m);
}
