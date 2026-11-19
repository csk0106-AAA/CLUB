// 지도 보기: 구글 지도 / 네이버 지도. 설정 › 지도 보기에서 하나로 정하면 그 지도만 바로 연다("ask" 면 매번 고른다).
// 회원 설정(Members.prefs.map)에 저장하고, 화면에서 바로 쓰도록 이 기기(localStorage)에도 적어 둔다(ThemeSync 가 맞춘다).
export type MapPref = "ask" | "google" | "naver";
export const MAP_PREFS: readonly MapPref[] = ["ask", "google", "naver"];
export const MAP_KEY = "club-map";
export const MAP_NAME: Record<"google" | "naver", string> = { google: "구글 지도", naver: "네이버 지도" };

export function mapHref(kind: "google" | "naver", place: string): string {
  const q = encodeURIComponent(place.trim());
  return kind === "google" ? `https://www.google.com/maps/search/?api=1&query=${q}` : `https://map.naver.com/p/search/${q}`;
}

// 브라우저에서만 부른다
export function readMapPref(): MapPref {
  try {
    const v = localStorage.getItem(MAP_KEY);
    return v === "google" || v === "naver" ? v : "ask";
  } catch {
    return "ask";
  }
}
export function writeMapPref(v: MapPref): void {
  try {
    if (v === "ask") localStorage.removeItem(MAP_KEY);
    else localStorage.setItem(MAP_KEY, v);
  } catch {
    // 저장소를 못 쓰는 환경: 매번 고른다
  }
}
