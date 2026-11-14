"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { PasswordField } from "@/components/PasswordField";
import { DateField } from "@/components/DateField";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 회원구분·직책·소모임 목록은 "회원 구분" 화면(/admin/kinds)으로 옮겼다.
type S = { clubName: string; clubShortName: string; inviteCode: string };

function Settings() {
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<S>("/api/admin/settings");
    if (r.ok) setS(r.data);
    else setMsg({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setMsg(null);
    const r = await api("/api/admin/settings", { method: "PUT", body: s });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "저장했어요. 회원 화면에 바로 적용돼요." });
    load();
  }

  if (!s) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: `400 ${fs(20)} var(--display)` }}>원우회 이름</b>
        <div className="grid2">
          <div><label className="l" htmlFor="s-name">원우회 이름 (회원 첫 화면에 표시)</label><input id="s-name" className="field" value={s.clubName} onChange={(e) => setS({ ...s, clubName: e.target.value })} /></div>
          <div><label className="l" htmlFor="s-short">줄여 쓰는 이름</label><input id="s-short" className="field" value={s.clubShortName} onChange={(e) => setS({ ...s, clubShortName: e.target.value })} /></div>
          <div>
            <label className="l" htmlFor="s-code">공통 초대코드 (연락처가 없는 회원용, 4자 이상)</label>
            <PasswordField id="s-code" autoComplete="off" value={s.inviteCode} onChange={(v) => setS({ ...s, inviteCode: v })} />
          </div>
        </div>
        <span className="small">회원은 명단에 등록된 연락처 뒷자리 4자리로 로그인해요. 연락처가 없는 회원만 이 공통 초대코드를 써요.</span>
        <div className="card" style={{ background: "var(--soft)" }}>
          <span className="pill gray">회원 첫 화면 미리보기</span>
          <div className="say" style={{ alignItems: "center", marginTop: 8 }}>
            <Mascot size={56} />
            <b style={{ font: `400 ${fs(21)}/1.3 var(--display)` }}>{s.clubName || "원우회 이름"}</b>
          </div>
        </div>
      </div>

      <span className="small">회원구분·직책·소모임 목록은 <Link href="/admin/kinds">회원 구분</Link> 메뉴에서 정해요.</span>

      <button className="btn" type="submit" disabled={busy} style={{ width: "auto", minWidth: 200, alignSelf: "flex-start" }}>{busy ? "저장 중…" : "저장"}</button>
      <ProfileReveal />
    </form>
  );
}

// 프로필 북 실명 공개 시점. 이 시각 전에는 별칭으로만 보인다.
function ProfileReveal() {
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  useEffect(() => {
    api<{ revealAt: string }>("/api/admin/profile-settings").then((r) => r.ok && setAt(r.data.revealAt));
  }, []);
  async function save() {
    const r = await api("/api/admin/profile-settings", { method: "PUT", body: { revealAt: at } });
    setMsg(r.ok ? { tone: "info", text: at ? "실명 공개 시점을 저장했어요." : "공개 시점을 지웠어요. 별칭으로만 보여요." } : { tone: "bad", text: r.error });
  }
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `400 ${fs(20)} var(--display)` }}>프로필 북 실명 공개 시점</b>
      <span className="small">행사가 끝난 뒤 별칭 대신 실명으로 보여 줄 시점이에요(한국 시간). 비워 두면 계속 별칭으로만 보여요.</span>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <DateField mode="datetime" ariaLabel="실명 공개 시점" style={{ width: 300, maxWidth: "100%" }} value={at} onChange={setAt} />
        <button className="mini" type="button" style={{ minHeight: 54 }} onClick={save}>저장</button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/settings"><Settings /></AdminGate>;
}
