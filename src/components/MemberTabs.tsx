"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { setBadge } from "@/lib/push-client";
import { IconBoard, IconGear, IconHome, IconOrg, IconProfileBook, IconShield } from "./Icons";
import css from "./MemberTabs.module.css";

// 관리자 권한 여부는 화면을 옮겨 다녀도 한 번만 묻는다(탭이 깜빡이지 않게).
let adminCache: boolean | null = null;

// 하단 탭: 행사 / 게시글 / 조직도 / 프로필 북 / 설정 / 관리자(관리자 권한이 있는 회원만).
// 이 탭을 쓰는 화면은 <main className="app with-tabs"> 로 감싼다.
type Tab = "events" | "board" | "org" | "profiles" | "settings" | "admin";
type Counts = { events: number; posts: number; profiles: number };
// 탭 → 새 글 종류(lib/unread.ts)
const UNREAD_OF: Partial<Record<Tab, keyof Counts>> = { events: "events", board: "posts", profiles: "profiles" };

export function MemberTabs({ on }: { on: Tab }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(adminCache ?? on === "admin");
  useEffect(() => {
    if (adminCache !== null) return;
    api<{ perms: string[] }>("/api/me").then((r) => {
      if (!r.ok) return;
      adminCache = r.data.perms.length > 0;
      setIsAdmin(adminCache);
    });
  }, []);

  // 새 글 숫자: 지금 연 탭은 "봤음"으로 표시하고, 나머지 탭의 숫자를 받는다(1분마다 다시 확인).
  const [unread, setUnread] = useState<Counts>({ events: 0, posts: 0, profiles: 0 });
  useEffect(() => {
    const seenKind = UNREAD_OF[on];
    let stop = false;
    const apply = (r: { ok: boolean; data?: Counts }) => {
      if (stop || !r.ok || !r.data) return;
      setUnread(r.data);
      setBadge(r.data.events + r.data.posts + r.data.profiles);
    };
    (seenKind ? api<Counts>("/api/unread", { body: { kind: seenKind } }) : api<Counts>("/api/unread")).then(apply);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") api<Counts>("/api/unread").then(apply);
    }, 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [on]);

  const items = [
    { key: "events", href: "/events", label: "행사", icon: <IconHome /> },
    { key: "board", href: "/board", label: "게시글", icon: <IconBoard /> },
    { key: "org", href: "/org", label: "조직도", icon: <IconOrg /> },
    { key: "profiles", href: "/profiles", label: "프로필 북", icon: <IconProfileBook /> },
    { key: "settings", href: "/settings", label: "설정", icon: <IconGear /> },
    ...(isAdmin ? [{ key: "admin", href: "/admin", label: "관리자", icon: <IconShield /> }] : []),
  ];
  return (
    <nav className={`tabs ${css.many}`} aria-label="메뉴">
      {items.map((t) => {
        const kind = UNREAD_OF[t.key as Tab];
        const n = kind && on !== t.key ? unread[kind] : 0;
        return (
          <Link key={t.key} href={t.href} className={`tab ${css.tab} ${on === t.key ? "on" : ""}`} aria-current={on === t.key ? "page" : undefined}
            aria-label={n > 0 ? `${t.label}, 새 글 ${n}개` : undefined}>
            {t.icon}
            {n > 0 && <span className={css.badge} aria-hidden="true">{n > 99 ? "99+" : n}</span>}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// 로그아웃하면 다른 계정으로 들어올 수 있으니 기억한 값을 지운다.
export function resetTabsCache() {
  adminCache = null;
}
