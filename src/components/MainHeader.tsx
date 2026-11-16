"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertsPanel } from "./AlertsPanel";
import { Avatar, type AvatarView } from "./Avatars";
import { headIcon, headLabel, HEAD_ICON_MAX, HEAD_ICON_SIZE } from "./HeadIcon";
import { IconBell, IconLogout, IconOrg, IconShield } from "./Icons";
import { Mascot } from "./Mascot";
import tabsCss from "./MemberTabs.module.css";
import { OrgView } from "./OrgView";
import { Popup } from "./Popup";
import { api } from "@/lib/client";
import { disablePush } from "@/lib/push-client";

type Me = { name: string; avatar: AvatarView; perms: string[]; clubs: { name: string; role: string }[] };

// 홈·일정·프로필 북·설정 공통 윗줄: 프로필(왼쪽) + 모임 이름·회원 이름 + 관리자·알림·조직도·로그아웃(오른쪽)
//  - 관리자: 관리자 권한이 있거나 소모임 직책자일 때만(처리할 일 숫자 배지). 관리자 비밀번호를 한 번 더 확인한다.
//  - 알림: 새 글·소모임 신청 알림 창(숫자 배지), 조직도: 조직도 창
//  - openAlerts: 처음부터 알림 창을 열 때(홈 /board?alerts=1)
//  - onAlertsClosed: 알림 창을 닫은 뒤 화면 목록을 다시 불러올 때
export function MainHeader({ openAlerts = false, onAlertsClosed }: { openAlerts?: boolean; onAlertsClosed?: () => void }) {
  const router = useRouter();
  const [who, setWho] = useState<Me | null>(null);
  const [club, setClub] = useState("");
  const [bell, setBell] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(openAlerts);
  const [orgOpen, setOrgOpen] = useState(false);
  const [issues, setIssues] = useState(0);

  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      if (!r.ok) return;
      setWho(r.data);
      if (r.data.perms.length > 0) api<{ count: number }>("/api/admin/issues").then((x) => x.ok && setIssues(x.data.count));
    });
    api<{ displayName: string }>("/api/public/club").then((c) => c.ok && setClub(c.data.displayName));
  }, []);
  useEffect(() => setAlertsOpen(openAlerts), [openAlerts]);
  // 종 아이콘 숫자: 처음 한 번, 그 뒤 1분마다(화면이 보일 때만)
  useEffect(() => {
    const get = () => api<{ posts: number; alerts: number }>("/api/unread").then((r) => r.ok && setBell(r.data.posts + (r.data.alerts ?? 0)));
    get();
    const t = setInterval(() => document.visibilityState === "visible" && get(), 60_000);
    return () => clearInterval(t);
  }, []);
  const onCount = useCallback((n: number) => setBell(n), []);

  // 로그아웃: 로그인 화면으로 돌아가 이름과 초대코드를 다시 넣고 들어올 수 있다.
  async function logout() {
    if (!window.confirm("로그아웃할까요? 다시 들어오려면 이름과 초대코드(연락처 뒷자리 4자리)를 넣으면 돼요.")) return;
    // 로그아웃한 기기로 다른 사람 알림이 가지 않게 이 기기 구독을 푼다.
    await disablePush();
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.replace("/");
  }

  return (
    <>
      <header className="topbar">
        <div className="row">
          {who ? <Avatar member={who} size={40} /> : <Mascot size={40} />}
          <div className="who">
            {club && <span>{club}</span>}
            {who && <b>{who.name}</b>}
          </div>
          <div className="icons">
            {who && (who.perms.length > 0 || who.clubs.some((c) => c.role)) && (
              <Link href="/admin" aria-label={issues > 0 ? `관리자 화면, 처리할 일 ${issues}개` : "관리자 화면"} title="관리자 화면" style={headIcon}>
                <IconShield size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
                <span style={headLabel} aria-hidden="true">관리자</span>
                {issues > 0 && <span className={tabsCss.badge} aria-hidden="true">{issues > 99 ? "99+" : issues}</span>}
              </Link>
            )}
            <button type="button" onClick={() => setAlertsOpen(true)} aria-haspopup="dialog" title="알림"
              aria-label={bell > 0 ? `알림, 새 소식 ${bell}개` : "알림"} style={headIcon}>
              <IconBell size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
              <span style={headLabel} aria-hidden="true">알림</span>
              {bell > 0 && <span className={tabsCss.badge} aria-hidden="true">{bell > 99 ? "99+" : bell}</span>}
            </button>
            <button type="button" onClick={() => setOrgOpen(true)} aria-haspopup="dialog" aria-label="조직도" title="조직도" style={headIcon}>
              <IconOrg size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
              <span style={headLabel} aria-hidden="true">조직도</span>
            </button>
            <button type="button" onClick={logout} aria-label="로그아웃" title="로그아웃" style={headIcon}>
              <IconLogout size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
              <span style={headLabel} aria-hidden="true">로그아웃</span>
            </button>
          </div>
        </div>
      </header>
      <Popup id="alerts" title="알림" open={alertsOpen} onClose={() => { setAlertsOpen(false); onAlertsClosed?.(); }}>
        {alertsOpen && <AlertsPanel onCount={onCount} />}
      </Popup>
      <Popup id="org" width={760} title="조직도" open={orgOpen} onClose={() => setOrgOpen(false)}>
        {orgOpen && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}><OrgView /></div>}
      </Popup>
    </>
  );
}
