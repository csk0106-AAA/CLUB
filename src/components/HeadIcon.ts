// 홈·설정 화면 윗줄의 아이콘 버튼(알림·조직도·관리자·로그아웃) 공통 모양.
// 테두리 없는 선 아이콘 + 아래 작은 이름(알림·조직도·관리자·로그아웃). 누르는 칸은 44px 이상.
// 아이콘·이름은 글자 크기 설정을 따르되 좁은 휴대폰 한 줄에 들어가게 120%까지만.
import { fs } from "@/lib/fs";

export const HEAD_ICON_MAX = 1.2;
export const headIcon = {
  display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
  minWidth: 48, minHeight: 48, padding: "2px 4px", borderRadius: 8, textDecoration: "none",
  border: 0, background: "transparent", color: "var(--ink2)", flex: "none",
  cursor: "pointer", position: "relative",
} as const;
// 아이콘 아래 이름
export const headLabel = {
  fontSize: fs(11, HEAD_ICON_MAX), fontWeight: 500, lineHeight: 1.1, whiteSpace: "nowrap", color: "var(--sub)",
} as const;
export const HEAD_ICON_SIZE = 22;
