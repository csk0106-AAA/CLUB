// 화면 모드(서버·클라이언트 공용, "use client" 아님): layout.tsx 의 <head> 스크립트와 설정 화면이 함께 쓴다.
// "system"(기기 설정) | "light" | "dark". <html data-theme> 로 적용하고(시스템이면 속성 없음),
// 다음에 열 때 서버 응답 전에 바로 적용되도록 이 기기(localStorage)에도 적어 둔다.
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "club-theme";

// 첫 화면을 그리기 전에 이 기기에 저장된 모드를 적용하는 짧은 스크립트(깜빡임 방지)
export const THEME_BOOT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

// 브라우저에서만 부른다
export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등): 이번 화면에만 적용
  }
}
