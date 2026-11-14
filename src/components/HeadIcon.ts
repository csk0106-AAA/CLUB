import { fs } from "@/lib/fs";

// 홈·설정 화면 윗줄의 아이콘 버튼(알림·조직도·관리자·로그아웃) 공통 모양.
// 테두리 없는 선 아이콘 + 아래 작은 회색 글자(10.5px). 누르는 칸은 44px 이상.
// 글자 크기 설정을 따르되 좁은 휴대폰 한 줄에 들어가게 120%까지만.
export const HEAD_ICON_MAX = 1.2;
export const headIcon = {
  display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
  minWidth: 46, minHeight: 46, padding: "2px 2px", borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap",
  border: 0, background: "transparent", color: "var(--sub)", font: `500 ${fs(10.5, HEAD_ICON_MAX)} var(--body)`, flex: "none",
  cursor: "pointer", position: "relative",
} as const;
export const HEAD_ICON_SIZE = 22;
