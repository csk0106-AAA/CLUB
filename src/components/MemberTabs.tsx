"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { setBadge } from "@/lib/push-client";
import { IconCalendar, IconGear, IconHome, IconProfileBook } from "./Icons";
import css from "./MemberTabs.module.css";

// 하단 탭: 홈(게시글 + 알림 + 조직도) / 행사 / 프로필 북 / 설정.
// 조직도는 홈 화면 위쪽 "조직도" 아이콘으로 연다(/org 로 바로 들어오면 "홈" 탭이 켜진다).
// 관리자 화면은 설정 안(설정 화면 위쪽 관리자 아이콘)으로 들어가므로, 관리자 화면에서는 "설정" 탭이 켜진다.
// 이 탭을 쓰는 화면은 <main className="app with-tabs"> 로 감싼다.
// 하단 탭 칸 높이는 그대로: 아이콘·글자는 글자 크기 설정을 따르되 120%까지만 커진다(MemberTabs.module.css 와 같은 값).
const TAB_ICON = 22;
const TAB_MAX = 1.2;
type Tab = "events" | "board" | "org" | "profiles" | "settings" | "admin";
// alerts: 소모임 가입·참관 신청 알림(lib/unread.ts)
type Counts = { events: number; posts: number; profiles: number; alerts: number };
// 탭을 열면 "봤음"으로 표시하는 종류. 홈은 종 아이콘 알림 창을 열어야 새 글을 "봤음"으로 표시한다.
const SEEN_ON_OPEN: Partial<Record<Tab, "events" | "profiles">> = { events: "events", profiles: "profiles" };
// 탭 숫자: 홈은 종 아이콘과 같은 숫자(새 글 + 소모임 신청 알림)
const countOf = (t: Tab, c: Counts): number =>
  t === "board" ? c.posts + c.alerts : t === "events" ? c.events : t === "profiles" ? c.profiles : 0;

export function MemberTabs({ on: tab }: { on: Tab }) {
  const on: Tab = tab === "admin" ? "settings" : tab === "org" ? "board" : tab;

  // 새 글 숫자: 지금 연 탭은 "봤음"으로 표시하고, 나머지 탭의 숫자를 받는다(1분마다 다시 확인).
  const [unread, setUnread] = useState<Counts>({ events: 0, posts: 0, profiles: 0, alerts: 0 });
  useEffect(() => {
    const seenKind = SEEN_ON_OPEN[on];
    let stop = false;
    const apply = (r: { ok: boolean; data?: Counts }) => {
      if (stop || !r.ok || !r.data) return;
      setUnread(r.data);
      setBadge(r.data.events + r.data.posts + r.data.profiles + (r.data.alerts ?? 0));
    };
    const refresh = () => api<Counts>("/api/unread").then(apply);
    if (seenKind) api<Counts>("/api/unread", { body: { kind: seenKind } }).then(apply);
    else refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    // 홈 화면 알림 창에서 읽음 처리·신청 처리를 하면 바로 다시 센다.
    window.addEventListener("club:unread", refresh);
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener("club:unread", refresh);
    };
  }, [on]);

  const items: { key: Tab; href: string; label: string; icon: React.ReactNode }[] = [
    { key: "board", href: "/board", label: "홈", icon: <IconHome size={TAB_ICON} max={TAB_MAX} /> },
    { key: "events", href: "/events", label: "행사", icon: <IconCalendar size={TAB_ICON} max={TAB_MAX} /> },
    { key: "profiles", href: "/profiles", label: "프로필 북", icon: <IconProfileBook size={TAB_ICON} max={TAB_MAX} /> },
    { key: "settings", href: "/settings", label: "설정", icon: <IconGear size={TAB_ICON} max={TAB_MAX} /> },
  ];
  return (
    <nav className={`tabs ${css.many}`} aria-label="메뉴">
      {items.map((t) => {
        const n = on !== t.key ? countOf(t.key, unread) : 0;
        return (
          <Link key={t.key} href={t.href} className={`tab ${css.tab} ${on === t.key ? "on" : ""}`} aria-current={on === t.key ? "page" : undefined}
            aria-label={n > 0 ? `${t.label}, 새 소식 ${n}개` : undefined}>
            {t.icon}
            {n > 0 && <span className={css.badge} aria-hidden="true">{n > 99 ? "99+" : n}</span>}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// 홈 화면 알림 창 등에서 숫자가 바뀌었을 때 하단 탭·앱 배지를 다시 세게 한다.
export function refreshUnread() {
  window.dispatchEvent(new Event("club:unread"));
}

// (예전 관리자 탭용 기억 값 초기화. 관리자 탭이 설정 안으로 옮겨져 지금은 할 일이 없다.)
export function resetTabsCache() {}
