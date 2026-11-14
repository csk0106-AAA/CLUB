// 홈·설정 화면 윗줄의 아이콘 버튼(알림·조직도·관리자·로그아웃) 공통 모양(목업 C).
// 테두리·글자 없는 선 아이콘만(이름은 aria-label·title). 누르는 칸은 44px.
// 아이콘은 글자 크기 설정을 따르되 좁은 휴대폰 한 줄에 들어가게 120%까지만.
export const HEAD_ICON_MAX = 1.2;
export const headIcon = {
  display: "inline-grid", placeItems: "center",
  width: 44, height: 44, padding: 0, borderRadius: 8, textDecoration: "none",
  border: 0, background: "transparent", color: "var(--ink2)", flex: "none",
  cursor: "pointer", position: "relative",
} as const;
export const HEAD_ICON_SIZE = 22;
