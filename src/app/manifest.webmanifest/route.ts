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
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
      lang: "ko",
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
