import { fs } from "@/lib/fs";

// 홈·설정 화면 위쪽 줄의 아이콘 버튼(알림·조직도·관리자·로그아웃) 공통 모양.
// 아이콘 20px + 글자 11.5px, 누르는 칸은 44px 이상. 글자 크기 설정을 따르되 좁은 휴대폰 한 줄에 들어가게 120%까지만,
// 글자가 커지면 칸 너비도 글자에 맞춰 조금 넓어진다(최소 58px).
export const HEAD_ICON_MAX = 1.2;
export const headIcon = {
  display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
  minWidth: 58, minHeight: 46, padding: "3px 4px", borderRadius: 12, textDecoration: "none", whiteSpace: "nowrap",
  border: "2px solid var(--line)", background: "var(--card)", font: `700 ${fs(11.5, HEAD_ICON_MAX)} var(--body)`, flex: "none",
  cursor: "pointer", position: "relative",
} as const;
export const HEAD_ICON_SIZE = 20;
