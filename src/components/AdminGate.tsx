"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { IconBack, IconExport } from "./Icons";
import { MemberTabs } from "./MemberTabs";
import { PasswordField } from "./PasswordField";

type Me = { name: string; perms: string[]; admin: boolean; consent: boolean; clubOfficerOf?: string[] };

export type AdminMode = "group" | "members" | "events" | "clubs" | "templates";
const MODES: { key: AdminMode; href: string; label: string }[] = [
  { key: "group", href: "/admin/settings", label: "모임설정" },
  { key: "members", href: "/admin/members", label: "회원관리" },
  { key: "events", href: "/admin/events", label: "일정관리" },
  { key: "clubs", href: "/admin/clubs", label: "소모임관리" },
  { key: "templates", href: "/admin/templates", label: "활동 템플릿" },
];
// 소모임 직책자(관리자 권한 없음)가 관리자 비밀번호 없이 들어올 수 있는 화면
const OFFICER_MODES: AdminMode[] = ["clubs", "templates"];

// 관리자 화면 공통 틀: 로그인 확인 → 관리자 2차 비밀번호 → 권한 확인 → 위쪽 메뉴.
// mode: 회원관리 / 일정관리 / 소모임관리 / 활동 템플릿 중 어느 쪽 화면인지.
// need: 필요한 권한(하나라도 있으면 통과).
// 접근: 관리자(권한이 하나라도 있음)는 네 메뉴 모두(각 화면은 필요한 권한을 다시 확인),
//       소모임 직책자는 소모임관리·활동 템플릿만(관리자 비밀번호 없이 — 서버도 직책자로 확인한다).
export function AdminGate(props: {
  mode?: AdminMode;
  need?: string[];
  active?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadMe() {
    const r = await api<Me>("/api/me");
    if (r.ok) setMe(r.data);
    else if (r.status === 401) router.replace("/");
    else setError(r.error);
  }
  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api("/api/auth/admin", { body: { passcode: code } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCode("");
    await loadMe();
  }

  // 이전 페이지로(관리자 화면을 바로 열었으면 설정으로)
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/settings");
  }

  if (!me) {
    return <main className="app admin with-tabs">{error ? <div className="msg bad" role="alert">{error}</div> : <p className="small">불러오는 중이에요…</p>}<MemberTabs on="admin" /></main>;
  }

  const need = props.need ?? [];
  const isAdmin = me.perms.length > 0;
  const officerOf = me.clubOfficerOf ?? [];
  const officer = officerOf.length > 0;
  const hasNeed = need.length === 0 || me.perms.includes("all") || need.some((p) => me.perms.includes(p));
  // 소모임 직책자로 들어가는 화면: 소모임관리·활동 템플릿이고, 관리자 권한으로는 이 화면 권한이 없을 때(관리자 비밀번호는 필요)
  const asOfficer = officer && !!props.mode && OFFICER_MODES.includes(props.mode) && !(isAdmin && hasNeed);
  const modes = isAdmin ? MODES : MODES.filter((m) => OFFICER_MODES.includes(m.key));

  if (!isAdmin && !asOfficer) {
    return (
      <main className="app admin with-tabs">
        {officer ? (
          <>
            <div className="msg bad" role="alert">소모임 직책자는 소모임관리와 활동 템플릿만 쓸 수 있어요.</div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link className="btn" href="/admin/clubs" style={{ width: "auto", minWidth: 160, textDecoration: "none" }}>소모임관리로</Link>
              <Link className="btn white" href="/admin/templates" style={{ width: "auto", minWidth: 160, textDecoration: "none" }}>활동 템플릿으로</Link>
            </div>
          </>
        ) : (
          <>
            <div className="msg bad" role="alert">관리자 권한이 없는 계정이에요.</div>
            <button className="btn white" type="button" onClick={() => router.push("/board")}>회원 화면으로</button>
          </>
        )}
        <MemberTabs on="settings" />
      </main>
    );
  }

  // 소모임 직책자도 관리자 기능을 쓸 때는 관리자 비밀번호를 한 번 더 입력한다.
  if (!me.admin) {
    return (
      <main className="app with-tabs">
        <h1 className="title">관리자 확인</h1>
        <p className="small" style={{ margin: 0 }}>{me.name} 님, 관리자 비밀번호를 한 번 더 입력해 주세요.</p>
        <form onSubmit={unlock} style={{ display: "contents" }}>
          <div>
            <label className="l" htmlFor="pc">관리자 비밀번호</label>
            <PasswordField id="pc" autoComplete="current-password" value={code} onChange={setCode} />
          </div>
          {error && <div className="msg bad" role="alert">{error}</div>}
          <div className="footer-actions">
            <button className="btn" type="submit" disabled={busy || !code}>{busy ? "확인 중…" : "확인"}</button>
          </div>
        </form>
        <MemberTabs on="admin" />
      </main>
    );
  }

  const allowed = asOfficer || hasNeed;

  const sub =
    props.mode === "members"
      ? [{ href: "/admin/kinds", label: "회원 구분" }, { href: "/admin/members", label: "회원 명단" }, { href: "/admin/club", label: "조직도" }, { href: "/admin/admins", label: "권한설정" }]
      : props.mode === "group"
        ? [{ href: "/admin/settings", label: "모임개요" }, { href: "/admin/dues", label: "회비관리" }, { href: "/admin/rules", label: "회칙" }]
      : props.mode === "templates"
        ? [{ href: "/admin/templates", label: "활동 템플릿" }, { href: "/admin/dev-requests", label: "개발 요청" }]
        : props.mode === "clubs"
          ? [{ href: "/admin/clubs", label: "소모임 목록" }, { href: "/admin/club-requests", label: "신청내역" }]
          : props.mode === "events"
            ? [{ href: "/admin/events", label: "일정 목록" }]
            : [];

  return (
    <main className="app admin with-tabs">
      <header className="topbar adminbar">
        {/* 윗줄(목업 C): ‹ 이전 페이지(아이콘) · 관리자 · (내 이름) · 내보내기 */}
        <div className="row" style={{ gap: 4 }}>
          <button className="iconbtn" type="button" onClick={goBack} aria-label="이전 페이지" title="이전 페이지">
            <IconBack size={20} />
          </button>
          <h1>관리자</h1>
          <span className="me">{me.name}</span>
          {isAdmin && (
            <Link className="exp" href="/admin/export" aria-current={props.active === "/admin/export" ? "page" : undefined}>
              <IconExport size={14} /> 내보내기
            </Link>
          )}
        </div>
        <nav className="modes" aria-label="관리자 구분">
          {modes.map((m) => (
            <Link key={m.key} href={m.href} className={props.mode === m.key ? "on" : ""} aria-current={props.mode === m.key ? "true" : undefined}>{m.label}</Link>
          ))}
        </nav>
      </header>
      {/* 하위 메뉴가 하나뿐이면(일정 목록·소모임 목록) 위쪽 메뉴와 같은 곳이라 보여 주지 않는다 */}
      {sub.length > 1 && (
        <nav className="subnav menu" aria-label="하위 메뉴">
          {sub.map((s) => <Link key={s.href} href={s.href} className={props.active === s.href ? "on" : ""} aria-current={props.active === s.href ? "page" : undefined}>{s.label}</Link>)}
        </nav>
      )}
      {asOfficer && <p className="small" style={{ margin: 0 }}>소모임 직책자로 들어왔어요 ({officerOf.join(", ")}).</p>}
      {allowed ? props.children : <div className="msg bad" role="alert">이 화면을 볼 권한이 없어요. 필요한 권한은 “모든 권한” 관리자에게 요청해 주세요.</div>}
      <MemberTabs on="admin" />
    </main>
  );
}

export const PERM_LABELS: Record<string, string> = {
  all: "모든 권한",
  members: "회원정보",
  events: "일정",
  fees: "회비·비용",
  activities: "활동·조편성",
  minutes: "회의록·회칙",
  board: "게시글",
};
