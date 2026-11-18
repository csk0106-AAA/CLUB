// 편집자: 글·일정을 만든 사람이 추가한 회원(회원 id 배열 JSON, Posts.editors / Events.editors).
// 편집자는 그 글·일정을 고칠 수 있다(지우기·편집자 바꾸기는 만든 사람과 모든권한만).
// 편집자로 고를 수 있는 사람은 그 일을 할 권한이 있는 회원뿐이다
//  - 게시글: 게시글_글쓰기(또는 모든권한, 클럽 직책자)
//  - 일정: 그 일정 종류를 만들 수 있는 권한(일정_일정만들기 · 클럽관리(클럽 일정))
export function readEditors(text: string | undefined): string[] {
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

export const MAX_EDITORS = 10;
