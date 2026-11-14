// 화면 모드(서버·클라이언트 공용, "use client" 아님): layout.tsx 의 <head> 스크립트와 설정 화면이 함께 쓴다.
// "system"(기기 설정) | "light" | "dark". <html data-theme> 로 적용하고(시스템이면 속성 없음),
// 다음에 열 때 서버 응답 전에 바로 적용되도록 이 기기(localStorage)에도 적어 둔다.
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "club-theme";

// 글자·화면 크기 배율(설정 > 글자 크기). <html data-scale> + CSS(body zoom)로 적용, 이 기기에만 저장.
export const SCALES = [
  { v: "0.9", label: "작게" },
  { v: "1", label: "보통" },
  { v: "1.15", label: "크게" },
  { v: "1.3", label: "아주 크게" },
] as const;
export const SCALE_KEY = "club-scale";
// PC 에서 끌어서 바꾼 앱 너비(px). 회원 화면 / 관리자 화면 따로. CSS 변수 --app-w / --admin-w.
export const APP_W_KEY = "club-app-w";
export const ADMIN_W_KEY = "club-admin-w";

// 첫 화면을 그리기 전에 이 기기에 저장된 모드·글자 크기·앱 너비를 적용하는 짧은 스크립트(깜빡임 방지)
export const THEME_BOOT = `try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")d.dataset.theme=t;var s=localStorage.getItem(${JSON.stringify(SCALE_KEY)});if(s==="0.9"||s==="1.15"||s==="1.3")d.dataset.scale=s;var a=parseInt(localStorage.getItem(${JSON.stringify(APP_W_KEY)})||"",10);if(a>=420)d.style.setProperty("--app-w",a+"px");var m=parseInt(localStorage.getItem(${JSON.stringify(ADMIN_W_KEY)})||"",10);if(m>=420)d.style.setProperty("--admin-w",m+"px");}catch(e){}`;

// 브라우저에서만 부른다
export function readScale(): string {
  try {
    const s = localStorage.getItem(SCALE_KEY);
    return s && SCALES.some((x) => x.v === s) ? s : "1";
  } catch {
    return document.documentElement.dataset.scale ?? "1";
  }
}
export function applyScale(v: string): void {
  const root = document.documentElement;
  if (v === "1" || !SCALES.some((x) => x.v === v)) delete root.dataset.scale;
  else root.dataset.scale = v;
  try {
    if (v === "1") localStorage.removeItem(SCALE_KEY);
    else localStorage.setItem(SCALE_KEY, v);
  } catch {
    // 이번 화면에만 적용
  }
}

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
