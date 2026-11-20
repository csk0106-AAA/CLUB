"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { applyTheme } from "./ThemeBoot";
import { writeMapPref } from "@/lib/map-pref";

// 로그인한 회원의 저장된 화면 모드(/api/me prefs.theme)를 이 기기에 맞춘다.
// 한 번 맞추면 다시 부르지 않고, 첫 화면(로그인)으로 돌아가면 다음 화면에서 다시 확인한다(다른 회원이 로그인할 수 있으므로).
// 로그인 전(401)·진행자 화면·연결 오류는 조용히 넘어간다.
export function ThemeSync() {
  const path = usePathname() ?? "";
  const done = useRef(false);
  useEffect(() => {
    if (path === "/") {
      done.current = false;
      return;
    }
    if (done.current || path.startsWith("/host")) return;
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prefs?: { screen?: string; mapApp?: string } } | null) => {
        const t = d?.prefs?.screen;
        // 지도 보기 설정도 이 기기에 맞춘다
        const m = d?.prefs?.mapApp;
        if (alive && (m === "ask" || m === "google" || m === "naver")) writeMapPref(m);
        if (!alive || (t !== "system" && t !== "light" && t !== "dark")) return;
        done.current = true;
        applyTheme(t);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);
  return null;
}
