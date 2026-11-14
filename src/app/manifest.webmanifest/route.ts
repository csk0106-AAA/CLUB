// 홈 화면에 추가해서 앱처럼 쓰기 위한 PWA 설정
export function GET() {
  return Response.json(
    {
      name: "AI 초격차 전략포럼 제6기 원우회",
      short_name: "원우회",
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
