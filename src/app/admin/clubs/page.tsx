"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { Popup } from "@/components/Popup";
import { api } from "@/lib/client";
import { addClub } from "@/lib/club-list-client";
import { fs } from "@/lib/fs";
import { ClubStatus } from "@/components/ClubStatus";

type Club = { name: string; count: number; leaders: { name: string; role: string }[]; account: string; cycle: string; pausedAt: string };

// 관리자 › 클럽관리 › 클럽 목록. 맨 위 줄 오른쪽 끝 "+ 클럽 추가"(관리자만).
// 클럽 이름 바꾸기·삭제는 각 클럽 화면의 "클럽개요" 탭에서.
function Clubs() {
  const router = useRouter();
  const [list, setList] = useState<Club[] | null>(null);
  const [msg, setMsg] = useState("");
  const [admin, setAdmin] = useState(true); // false 면 클럽 직책자: 내 클럽만 보인다
  const [all, setAll] = useState(false); // 모든 권한(클럽 삭제)
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ clubs: Club[]; admin: boolean; all?: boolean }>("/api/admin/clubs");
    if (!r.ok) return setMsg(r.error);
    setList(r.data.clubs);
    setAdmin(r.data.admin);
    setAll(!!r.data.all);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    if (list?.some((c) => c.name === v)) return setErr(`“${v}” 클럽이 이미 있어요.`);
    setBusy(true);
    setErr("");
    const r = await addClub(v);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setOpen(false);
    setName("");
    // 만든 클럽 화면으로 가서 개요·회원·회비를 채운다
    router.push(`/admin/clubs/${encodeURIComponent(v)}`);
  }

  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <h1 className="title grow" style={{ fontSize: fs(20), margin: 0 }}>클럽 목록</h1>
        {admin && (
          <button type="button" className="btn" aria-haspopup="dialog" style={{ width: "auto", minWidth: 130, minHeight: 44, fontSize: fs(14), flex: "none" }}
            onClick={() => { setErr(""); setName(""); setOpen(true); }}>+ 클럽 추가</button>
        )}
      </div>
      <p className="small" style={{ margin: 0 }}>
        {admin
          ? "클럽을 누르면 개요·회원·회비·일정·신청내역을 관리해요. 활동 중지한 클럽은 회원 화면에서 빠지고, 활동 중지한 클럽만 삭제할 수 있어요."
          : "내가 직책을 맡은 클럽의 개요·회원·회비·일정·신청내역을 관리해요. 클럽 직책은 관리자가 정해요."}
      </p>
      {msg && <div className="msg bad" role="alert">{msg}</div>}
      {!list && !msg && <p className="small">불러오는 중이에요…</p>}
      {list && list.length === 0 && (admin
        ? <div className="msg info">아직 클럽이 없어요. 오른쪽 위 “+ 클럽 추가”로 시작해 보세요.</div>
        : <div className="msg info">직책을 맡은 클럽이 없어요.</div>)}
      <div className="cards">
        {list?.map((c) => (
          <div key={c.name} className="card" style={{ display: "flex", flexDirection: "column", gap: 8, opacity: c.pausedAt ? 0.85 : 1 }}>
            <Link href={`/admin/clubs/${encodeURIComponent(c.name)}`}
              style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", color: "inherit", textDecoration: "none" }}>
              <b style={{ font: `700 ${fs(18)} var(--display)` }}>{c.name}</b>
              <span className="small">회원 {c.count}명{c.cycle ? ` · ${c.cycle}` : ""}</span>
              <span className="small">{c.leaders.length ? c.leaders.map((l) => `${l.role} ${l.name}`).join(", ") : "리더를 아직 정하지 않았어요"}</span>
              <span className={`pill ${c.account ? "ok" : "gray"}`}>{c.account ? "입금계좌 있음" : "입금계좌 없음"}</span>
            </Link>
            {/* 활동 중지 / 다시 활동 / 삭제(관리자만) */}
            {admin ? <ClubStatus name={c.name} pausedAt={c.pausedAt} canDelete={all} onChanged={load} onDeleted={load} />
              : c.pausedAt ? <span className="pill warn" style={{ alignSelf: "flex-start" }}>활동 중지</span> : null}
          </div>
        ))}
      </div>

      <Popup id="club-new" width={420} title="클럽 추가" open={open} onClose={() => setOpen(false)} dirty={!!name.trim()}>
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="l" htmlFor="club-new-name">클럽 이름</label>
            <input id="club-new-name" className="field" maxLength={30} placeholder="예) 독서 모임" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <span className="small">추가하면 그 클럽 화면으로 이동해요. 개요·회원·회비를 채워 주세요.</span>
          {err && <div className="msg bad" role="alert">{err}</div>}
          <button className="btn" type="submit" disabled={busy || !name.trim()} style={{ width: "auto", minWidth: 140, alignSelf: "flex-end" }}>{busy ? "추가하는 중…" : "추가"}</button>
        </form>
      </Popup>
    </>
  );
}

export default function ClubsAdminPage() {
  return <AdminGate mode="clubs" need={["clubs"]} active="/admin/clubs"><Clubs /></AdminGate>;
}
