import type { Metadata, Viewport } from "next";
import { THEME_BOOT } from "@/components/ThemeBoot";
import { ThemeSync } from "@/components/ThemeSync";
import { AppResizer } from "@/components/AppResizer";
import "./globals.css";

export const metadata: Metadata = {
  title: "원우회",
  description: "AI 초격차 전략포럼(ASSF) 제6기 원우회",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#181b1e" },
  ],
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
