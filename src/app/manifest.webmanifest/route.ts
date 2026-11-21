import { getClubNames } from "@/lib/store";

export const dynamic = "force-dynamic";

// 홈 화면에 추가해서 앱처럼 쓰기 위한 PWA 설정. 이름은 관리자 › 모임 설정 값을 따른다.
export async function GET() {
  let name = "모임";
  let shortName = "모임";
  try {
    const n = await getClubNames();
    name = n.clubName || n.displayName || "모임";
    shortName = n.clubShortName || (n.displayName.length > 12 ? n.displayName.slice(0, 12) : n.displayName) || "모임";
  } catch {
    // 설정을 읽지 못하면 기본 이름으로
  }
  return Response.json(
    {
      name,
      short_name: shortName,
      id: "/",
      start_url: "/",
      // 설치한 앱을 다시 열 때 새 창을 만들지 않고 이미 열린 창을 쓴다(Chrome)
      launch_handler: { client_mode: ["navigate-existing", "auto"] },
      display: "standalone",
      background_color: "#4c4e52",
      theme_color: "#5a5c61",
      lang: "ko",
      icons: [
        // PNG 를 먼저(Firefox 안드로이드는 SVG 아이콘을 못 그려 기본 로봇 아이콘이 붙는다). 브라우저 탭은 layout 의 icon.svg
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
