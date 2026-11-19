"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fetchUnread, UNREAD_EVERY } from "@/lib/unread-client";
import { setBadge } from "@/lib/push-client";
import { IconCalendar, IconGear, IconHome, IconProfileBook, IconShield } from "./Icons";
import css from "./MemberTabs.module.css";

// 관리자 탭 표시 여부·처리할 일 숫자(화면을 옮겨도 깜빡이지 않게 기억, 로그아웃하면 지운다)
const adminMemo = { show: false, issues: 0 };

// 하단 탭: 홈(게시글 + 알림 + 조직도) / 일정 / 프로필 북 / 설정.
// 조직도는 홈 화면 위쪽 "조직도" 아이콘으로 연다(/org 로 바로 들어오면 "홈" 탭이 켜진다).
// 관리자: 관리자 권한이 있거나 클럽 직책자에게만 맨 오른쪽 탭으로 보인다(관리자 화면에서는 이 탭이 켜진다).
// 이 탭을 쓰는 화면은 <main className="app with-tabs"> 로 감싼다.
// 하단 탭 칸 높이는 그대로: 아이콘·글자는 글자 크기 설정을 따르되 120%까지만 커진다(MemberTabs.module.css 와 같은 값).
const TAB_ICON = 22;
const TAB_MAX = 1.2;
type Tab = "events" | "board" | "org" | "profiles" | "settings" | "admin";
// alerts: 클럽 가입·참관 신청 알림(lib/unread.ts)
type Counts = { events: number; posts: number; profiles: number; alerts: number };
// "봤음" 표시는 탭을 여는 순간이 아니라 각 화면이 정한다:
//  일정·프로필 북: 목록을 받아 NEW / UP 을 그린 뒤 markSeenAfterList() (이번 방문 동안은 표시가 남고, 다음에 열면 사라진다)
//  홈: 종 아이콘 알림 창을 열어야 새 글을 "봤음"으로 표시한다.
// 탭 숫자: 홈은 종 아이콘과 같은 숫자(새 글 + 클럽 신청 알림)
const countOf = (t: Tab, c: Counts): number =>
  t === "board" ? c.posts + c.alerts : t === "events" ? c.events : t === "profiles" ? c.profiles : 0;

export function MemberTabs({ on: tab }: { on: Tab }) {
  const on: Tab = tab === "org" ? "board" : tab;

  // 새 글 숫자: 탭마다 숫자를 받는다(지금 연 탭은 숫자를 감춤, 2분마다 다시 확인 — lib/unread-client.ts).
  const [unread, setUnread] = useState<Counts>({ events: 0, posts: 0, profiles: 0, alerts: 0 });
  useEffect(() => {
    let stop = false;
    const apply = (r: { ok: boolean; data?: Counts }) => {
      if (stop || !r.ok || !r.data) return;
      setUnread(r.data);
      setBadge(r.data.events + r.data.posts + r.data.profiles + (r.data.alerts ?? 0));
    };
    const refresh = (force?: unknown) => fetchUnread(force === true || force instanceof Event).then(apply);
    refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, UNREAD_EVERY);
    // 홈 화면 알림 창에서 읽음 처리·신청 처리를 하면 바로 다시 센다.
    window.addEventListener("club:unread", refresh);
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener("club:unread", refresh);
    };
  }, [on]);

  // 관리자 탭: 관리자 권한이 있거나 클럽 직책자일 때만(처리할 일 숫자 배지). 마지막 값을 기억해 깜빡이지 않게.
  const [adm, setAdm] = useState(adminMemo);
  useEffect(() => {
    let stop = false;
    api<{ perms: string[]; clubs?: { role: string }[] }>("/api/me").then(async (r) => {
      if (stop || !r.ok) return;
      const show = r.data.perms.length > 0 || !!r.data.clubs?.some((c) => c.role);
      let issues = 0;
      if (r.data.perms.length > 0) {
        const x = await api<{ count: number }>("/api/admin/issues");
        if (x.ok) issues = x.data.count;
      }
      if (stop) return;
      Object.assign(adminMemo, { show, issues });
      setAdm({ show, issues });
    });
    return () => {
      stop = true;
    };
  }, [on]);

  const items: { key: Tab; href: string; label: string; icon: React.ReactNode }[] = [
    { key: "board", href: "/board", label: "홈", icon: <IconHome size={TAB_ICON} max={TAB_MAX} /> },
    { key: "events", href: "/events", label: "일정", icon: <IconCalendar size={TAB_ICON} max={TAB_MAX} /> },
    { key: "profiles", href: "/profiles", label: "프로필 북", icon: <IconProfileBook size={TAB_ICON} max={TAB_MAX} /> },
    { key: "settings", href: "/settings", label: "설정", icon: <IconGear size={TAB_ICON} max={TAB_MAX} /> },
    ...(adm.show ? [{ key: "admin" as Tab, href: "/admin", label: "관리자", icon: <IconShield size={TAB_ICON} max={TAB_MAX} /> }] : []),
  ];
  return (
    <nav className={`tabs ${css.many}`} aria-label="메뉴">
      {items.map((t) => {
        const n = on !== t.key ? (t.key === "admin" ? adm.issues : countOf(t.key, unread)) : 0;
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

// 일정·프로필 북 화면: 목록(NEW / UP 포함)을 받은 뒤 "봤음"으로 표시하고 하단 탭·앱 배지 숫자를 다시 센다.
// 서버는 목록을 줄 때 이전에 본 시각으로 NEW / UP 을 정하므로, 이번 방문 동안은 표시가 남는다.
export async function markSeenAfterList(kind: "events" | "profiles") {
  await api("/api/unread", { body: { kind } });
  refreshUnread();
}

// 로그아웃·로그인할 때 앞 사람의 관리자 탭이 잠깐 보이지 않게 비운다.
export function resetTabsCache() {
  Object.assign(adminMemo, { show: false, issues: 0 });
}
