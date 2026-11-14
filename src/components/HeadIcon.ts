// 홈·설정 화면 위쪽 줄의 아이콘 버튼(알림·조직도·관리자·로그아웃) 공통 모양.
// 아이콘 20px + 글자 11.5px, 누르는 칸은 44px 이상.
export const headIcon = {
  display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
  width: 58, minHeight: 46, padding: "3px 4px", borderRadius: 12, textDecoration: "none",
  border: "2px solid var(--line)", background: "var(--card)", font: "700 11.5px var(--body)", flex: "none",
  cursor: "pointer", position: "relative",
} as const;
export const HEAD_ICON_SIZE = 20;
