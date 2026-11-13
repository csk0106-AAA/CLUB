"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { IconGear, IconHome, IconProfileBook, IconShield } from "./Icons";

// 관리자 권한 여부는 화면을 옮겨 다녀도 한 번만 묻는다(탭이 깜빡이지 않게).
let adminCache: boolean | null = null;

// 하단 탭: 행사 / 프로필 북 / 설정 / 관리자(관리자 권한이 있는 회원만).
// 이 탭을 쓰는 화면은 <main className="app with-tabs"> 로 감싼다.
export function MemberTabs({ on }: { on: "events" | "profiles" | "settings" | "admin" }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(adminCache ?? on === "admin");
  useEffect(() => {
    if (adminCache !== null) return;
    api<{ perms: string[] }>("/api/me").then((r) => {
      if (!r.ok) return;
      adminCache = r.data.perms.length > 0;
      setIsAdmin(adminCache);
    });
  }, []);

  const items = [
    { key: "events", href: "/events", label: "행사", icon: <IconHome /> },
    { key: "profiles", href: "/profiles", label: "프로필 북", icon: <IconProfileBook /> },
    { key: "settings", href: "/settings", label: "설정", icon: <IconGear /> },
    ...(isAdmin ? [{ key: "admin", href: "/admin", label: "관리자", icon: <IconShield /> }] : []),
  ];
  return (
    <nav className="tabs" aria-label="메뉴">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`tab ${on === t.key ? "on" : ""}`} aria-current={on === t.key ? "page" : undefined}>
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// 로그아웃하면 다른 계정으로 들어올 수 있으니 기억한 값을 지운다.
export function resetTabsCache() {
  adminCache = null;
}
