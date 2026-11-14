// 화면 모드(서버·클라이언트 공용, "use client" 아님): layout.tsx 의 <head> 스크립트와 설정 화면이 함께 쓴다.
// "system"(기기 설정) | "light" | "dark". <html data-theme> 로 적용하고(시스템이면 속성 없음),
// 다음에 열 때 서버 응답 전에 바로 적용되도록 이 기기(localStorage)에도 적어 둔다.
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "club-theme";

// 글자 크기(설정 > 글자 크기): 1~10 단계, 5가 보통(100%). 이 기기에만 저장. 글자와 아이콘만 바뀌고 화면 틀은 그대로.
// <html data-scale="단계"> + --fs(배율) → CSS 의 calc(Npx * var(--fs, 1)) 글자·아이콘 크기. 폭 400px 미만 휴대폰은 넘치지 않게 최대 130%.
export const SCALE_LEVELS = [0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const;
export const SCALE_DEFAULT = 5;
export const SCALE_NARROW_MAX = 1.3;
export const SCALE_KEY = "club-scale-lv";
const OLD_SCALE_KEY = "club-scale"; // 예전 4단계(0.9/1.15/1.3) 값 → 단계로 옮긴다
// PC 에서 끌어서 바꾼 앱 너비(px). 회원 화면 / 관리자 화면 따로. CSS 변수 --app-w / --admin-w.
export const APP_W_KEY = "club-app-w";
export const ADMIN_W_KEY = "club-admin-w";

// 첫 화면을 그리기 전에 이 기기에 저장된 모드·글자 크기·앱 너비를 적용하는 짧은 스크립트(깜빡임 방지)
export const THEME_BOOT = `try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")d.dataset.theme=t;var L=${JSON.stringify(SCALE_LEVELS)},o={"0.9":3,"1.15":7,"1.3":8}[localStorage.getItem(${JSON.stringify(OLD_SCALE_KEY)})||""],s=parseInt(localStorage.getItem(${JSON.stringify(SCALE_KEY)})||(o?String(o):""),10);if(s>=1&&s<=10&&s!==${SCALE_DEFAULT}){var z=L[s-1];if(window.innerWidth<400&&z>${SCALE_NARROW_MAX})z=${SCALE_NARROW_MAX};d.dataset.scale=String(s);d.style.setProperty("--fs",String(z));}var a=parseInt(localStorage.getItem(${JSON.stringify(APP_W_KEY)})||"",10);if(a>=420)d.style.setProperty("--app-w",a+"px");var m=parseInt(localStorage.getItem(${JSON.stringify(ADMIN_W_KEY)})||"",10);if(m>=420)d.style.setProperty("--admin-w",m+"px");}catch(e){}`;

// 브라우저에서만 부른다
export function readScale(): number {
  const n = Number(document.documentElement.dataset.scale);
  return n >= 1 && n <= 10 ? n : SCALE_DEFAULT;
}
// 이 기기에서 실제로 쓰는 배율(좁은 휴대폰 상한 반영)
export function scaleOf(level: number): number {
  const z = SCALE_LEVELS[Math.min(10, Math.max(1, level)) - 1];
  return window.innerWidth < 400 ? Math.min(z, SCALE_NARROW_MAX) : z;
}
export function applyScale(level: number): void {
  const root = document.documentElement;
  const lv = Math.min(10, Math.max(1, Math.round(level)));
  if (lv === SCALE_DEFAULT) {
    delete root.dataset.scale;
    root.style.removeProperty("--fs");
  } else {
    root.dataset.scale = String(lv);
    root.style.setProperty("--fs", String(scaleOf(lv)));
  }
  try {
    localStorage.removeItem(OLD_SCALE_KEY);
    if (lv === SCALE_DEFAULT) localStorage.removeItem(SCALE_KEY);
    else localStorage.setItem(SCALE_KEY, String(lv));
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
