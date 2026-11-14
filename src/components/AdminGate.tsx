"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { IconBack, IconExport } from "./Icons";
import { MemberTabs } from "./MemberTabs";
import { PasswordField } from "./PasswordField";

type Me = { name: string; perms: string[]; admin: boolean; consent: boolean };

// 관리자 화면 공통 틀: 로그인 확인 → 관리자 2차 비밀번호 → 권한 확인 → 위쪽 메뉴.
// mode: 회원관리 / 소모임관리 / 활동 템플릿 중 어느 쪽 화면인지(일정 관리 화면은 mode 없이 — 일정 페이지에서 들어온다).
// need: 필요한 권한(하나라도 있으면 통과).
export function AdminGate(props: {
  mode?: "members" | "clubs" | "templates";
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

  if (me.perms.length === 0) {
    return (
      <main className="app admin with-tabs">
        <div className="msg bad" role="alert">관리자 권한이 없는 계정이에요.</div>
        <button className="btn white" type="button" onClick={() => router.push("/board")}>회원 화면으로</button>
        <MemberTabs on="settings" />
      </main>
    );
  }

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

  const need = props.need ?? [];
  const allowed = need.length === 0 || me.perms.includes("all") || need.some((p) => me.perms.includes(p));

  const sub =
    props.mode === "members"
      ? [{ href: "/admin/settings", label: "원우회 설정" }, { href: "/admin/kinds", label: "회원 구분" }, { href: "/admin/members", label: "회원 명단" }, { href: "/admin/club", label: "조직도" }, { href: "/admin/admins", label: "권한설정" }, { href: "/admin/dues", label: "회비관리" }]
      : props.mode === "templates"
        ? []
        : props.mode === "clubs"
          ? [{ href: "/admin/clubs", label: "소모임 목록" }]
          : [];

  return (
    <main className="app admin with-tabs">
      <header className="topbar adminbar">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button className="mini" type="button" onClick={goBack} style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 40 }}>
            <IconBack size={16} /> 이전 페이지
          </button>
          <h1>관리자</h1>
          <span className="small" style={{ whiteSpace: "nowrap" }}>{me.name}</span>
          <Link className="mini" href="/admin/export" aria-current={props.active === "/admin/export" ? "page" : undefined}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 40, ...(props.active === "/admin/export" ? { borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 700 } : {}) }}>
            <IconExport size={16} /> 내보내기
          </Link>
        </div>
        <nav className="modes" aria-label="관리자 구분">
          <Link href="/admin/members" className={props.mode === "members" ? "on" : ""} aria-current={props.mode === "members" ? "true" : undefined}>회원관리</Link>
          <Link href="/admin/clubs" className={props.mode === "clubs" ? "on" : ""} aria-current={props.mode === "clubs" ? "true" : undefined}>소모임관리</Link>
          <Link href="/admin/templates" className={props.mode === "templates" ? "on" : ""} aria-current={props.mode === "templates" ? "true" : undefined}>활동 템플릿</Link>
        </nav>
      </header>
      {sub.length > 0 && (
        <nav className="subnav one" aria-label="하위 메뉴">
          {sub.map((s) => <Link key={s.href} href={s.href} className={props.active === s.href ? "on" : ""} aria-current={props.active === s.href ? "page" : undefined}>{s.label}</Link>)}
        </nav>
      )}
      {allowed ? props.children : <div className="msg bad" role="alert">이 화면을 볼 권한이 없어요.</div>}
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
