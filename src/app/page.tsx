"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resetHeaderCache } from "@/components/MainHeader";
import { Mascot } from "@/components/Mascot";
import { resetTabsCache } from "@/components/MemberTabs";
import { PasswordField } from "@/components/PasswordField";
import { SignupSheet } from "@/components/SignupSheet";
import { fs } from "@/lib/fs";

type Club = { clubName: string; displayName: string; members: { id: string; name: string }[]; requirement?: string };

export default function LoginPage() {
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(false);

  // pick: 이 이름을 골라 둔다(회원 신청을 마친 뒤)
  function loadClub(pick?: string) {
    fetch("/api/public/club")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Club) => {
        setClub(d);
        setMemberId(d.members.find((m) => m.name === pick)?.id ?? d.members[0]?.id ?? "");
      })
      .catch(() => setLoadError(true));
  }
  useEffect(() => {
    loadClub();
  }, []);
  function afterSignup(name: string) {
    setCode("");
    setError("");
    loadClub(name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, code }),
      });
      // 서버 오류 화면(HTML)이 오면 JSON 이 아니다 → 상태 코드를 함께 보여 줘서 원인을 찾을 수 있게
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) {
        setError(d?.error ?? `서버에서 오류가 났어요(코드 ${r.status}). 잠시 후 다시 시도하고, 계속되면 관리자에게 이 코드를 알려 주세요.`);
        return;
      }
      resetTabsCache();
      resetHeaderCache();
      // 로그인 직후 한 번: 회원 신청 상태 안내(대기회원·참관회원·반려·정보 입력, components/ApplyNotice.tsx)
      try { sessionStorage.setItem("applyNotice", "1"); } catch { /* 저장 못 해도 로그인은 된다 */ }
      // 진행자 접속번호로 들어오면 활동 진행 화면만 쓴다.
      // 바로가기 링크(?next=/events/…)로 왔으면 그 화면으로. 같은 사이트 안의 경로만 허용한다.
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "";
      router.push(d.host ? "/host" : safeNext || "/board");
    } catch {
      setError("연결이 불안정해요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <div style={{ paddingTop: 20, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <Mascot />
        <h1 className="title center" style={{ fontSize: fs(20) }}>
          {club ? club.displayName || club.clubName : "모임"}
        </h1>
        <p className="small" style={{ margin: 0 }}>모임 회원 전용</p>
      </div>

      {loadError && (
        <div className="msg bad" role="alert">
          명단을 불러오지 못했어요. 화면을 새로 고쳐 주세요.
        </div>
      )}
      {!club && !loadError && <p className="small center">불러오는 중이에요…</p>}

      {club && club.members.length === 0 && (
        <div className="msg info">아직 등록된 회원이 없어요. 아래에서 신청하거나 관리자에게 문의해 주세요.</div>
      )}

      {club && club.members.length > 0 && (
        <form onSubmit={submit} style={{ display: "contents" }}>
          <div>
            <label className="l" htmlFor="nm">이름을 골라 주세요</label>
            <select id="nm" className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              {club.members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="l" htmlFor="cd">초대코드 (내 연락처 뒷자리 4자리)</label>
            <PasswordField id="cd" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={setCode} />
          </div>
          <p className="hint">진행자로 지정되었다면 받은 진행자 접속번호를 넣으면 활동 진행 화면으로 들어가요. 연락처가 등록되지 않았다면 관리자에게 받은 공통 초대코드를 넣어 주세요. 5회 틀리면 1분간 잠겨요.</p>
          {error && <div className="msg bad" role="alert">{error}</div>}
          <div className="footer-actions">
            <button className="btn" type="submit" disabled={busy || !code}>
              {busy ? "확인 중…" : "들어가기"}
            </button>
          </div>
        </form>
      )}
      {club && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginTop: 4 }}>
          <span className="small">명단에 내 이름이 없나요?</span>
          <button className="btn white" type="button" style={{ width: "auto", minWidth: 220 }} aria-haspopup="dialog" onClick={() => setSignup(true)}>회원 또는 참관 신청</button>
        </div>
      )}
      {club && <SignupSheet open={signup} onClose={() => setSignup(false)} requirement={club.requirement ?? ""} onDone={afterSignup} />}
    </main>
  );
}
