import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { THEME_BOOT } from "@/components/ThemeBoot";
import { ThemeSync } from "@/components/ThemeSync";
import { AppResizer } from "@/components/AppResizer";
import { getClubNames } from "@/lib/store";
import "./globals.css";

// 브라우저 탭 제목: 관리자 › 모임 설정에서 고른 "회원 화면에 보일 이름". 읽지 못하면 "모임".
export async function generateMetadata(): Promise<Metadata> {
  let title = "모임";
  let description = "모임 회원 전용";
  await connection(); // 요청마다 읽는다(빌드 때 이름이 굳지 않게). try 밖에 둬야 Next 가 동적 렌더링으로 처리한다.
  try {
    const n = await getClubNames();
    title = n.displayName;
    description = `${n.clubName || n.displayName} 회원 전용`;
  } catch {
    // 기본 이름으로
  }
  // iPhone: 홈 화면에 추가할 때 아이콘(SVG 는 쓰지 않아 PNG 180×180), 주소창 없이 앱처럼 열기
  return {
    title, description, manifest: "/manifest.webmanifest",
    icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
    appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5a5c61", // 그래파이트 바탕 맨 위 색(주소창·상태 표시줄)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme 은 그리기 전에 스크립트가 붙이므로 서버 HTML 과 달라도 경고하지 않는다
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 화면 모드(밝은/다크): 이 기기에 저장된 값을 첫 화면 전에 적용 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <ThemeSync />
        {children}
        <AppResizer />
      </body>
    </html>
  );
}
