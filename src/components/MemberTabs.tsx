"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { setBadge } from "@/lib/push-client";
import { IconBoard, IconGear, IconHome, IconOrg, IconProfileBook } from "./Icons";
import css from "./MemberTabs.module.css";

// 하단 탭: 행사 / 게시글 / 조직도 / 프로필 북 / 설정.
// 관리자 화면은 설정 안(설정 화면 위쪽 관리자 아이콘)으로 들어가므로, 관리자 화면에서는 "설정" 탭이 켜진다.
// 이 탭을 쓰는 화면은 <main className="app with-tabs"> 로 감싼다.
type Tab = "events" | "board" | "org" | "profiles" | "settings" | "admin";
type Counts = { events: number; posts: number; profiles: number };
// 탭 → 새 글 종류(lib/unread.ts)
const UNREAD_OF: Partial<Record<Tab, keyof Counts>> = { events: "events", board: "posts", profiles: "profiles" };

export function MemberTabs({ on: tab }: { on: Tab }) {
  const on: Tab = tab === "admin" ? "settings" : tab;

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

// (예전 관리자 탭용 기억 값 초기화. 관리자 탭이 설정 안으로 옮겨져 지금은 할 일이 없다.)
export function resetTabsCache() {}
