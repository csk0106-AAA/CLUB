// 설정 > 글자 크기: 글자·아이콘 배율(--fs, ThemeBoot 가 <html> 에 넣는다).
// 화면 틀(앱 너비·창 크기·여백)은 그대로 두고 글자와 아이콘만 커지거나 작아진다.
// fs(17) → "calc(17px * var(--fs, 1))". max 를 주면 배율을 그 값까지로 막는다(좁은 칸의 글자).
export function fs(px: number, max?: number): string {
  return max === undefined
    ? `calc(${px}px * var(--fs, 1))`
    : `calc(${px}px * min(var(--fs, 1), ${max}))`;
}
