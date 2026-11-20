// 지도 보기: 기본은 네이버 지도. 설정 › 지도 보기에서 구글 지도나 "매번 고르기"(ask)로 바꿀 수 있다.
// 회원 설정(Members.prefs.mapApp)에 저장하고, 화면에서 바로 쓰도록 이 기기(localStorage)에도 적어 둔다(ThemeSync 가 맞춘다).
export type MapPref = "ask" | "google" | "naver";
export const MAP_PREFS: readonly MapPref[] = ["ask", "google", "naver"];
export const MAP_KEY = "club-map-app"; // 예전 칸(club-map)은 쓰지 않는다
export const MAP_NAME: Record<"google" | "naver", string> = { google: "구글 지도", naver: "네이버 지도" };

export function mapHref(kind: "google" | "naver", place: string): string {
  const q = encodeURIComponent(place.trim());
  return kind === "google" ? `https://www.google.com/maps/search/?api=1&query=${q}` : `https://map.naver.com/p/search/${q}`;
}

// 브라우저에서만 부른다
export function readMapPref(): MapPref {
  try {
    const v = localStorage.getItem(MAP_KEY);
    return v === "google" || v === "ask" ? v : "naver";
  } catch {
    return "naver";
  }
}
export function writeMapPref(v: MapPref): void {
  try {
    if (v === "naver") localStorage.removeItem(MAP_KEY);
    else localStorage.setItem(MAP_KEY, v);
    localStorage.removeItem("club-map");
  } catch {
    // 저장소를 못 쓰는 환경: 매번 고른다
  }
}
