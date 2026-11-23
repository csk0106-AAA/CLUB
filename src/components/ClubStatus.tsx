"use client";

import { useEffect, useState } from "react";
import { Popup } from "./Popup";
import { api, fmtDateTime } from "@/lib/client";
import { removeClub } from "@/lib/club-list-client";
import { fs } from "@/lib/fs";

// 클럽 상태 버튼(관리자 › 클럽관리 목록·클럽 화면): 활동 중지 / 다시 활동 / 삭제(모든 기록)
//  활동 중지: 기록은 그대로, 회원 화면에서 빠진다(지난 일정은 참석했던 회원만). 관리자는 그대로 들어가 회비 입금 등을 고친다.
//  삭제: 모든 권한 관리자만, 활동 중지한 클럽만. 지우기 전에 기록 백업 파일(JSON)을 내려받는다.
//  pausedAt 을 주지 않으면 스스로 불러온다(클럽 화면).
export function ClubStatus({ name, pausedAt: given, canDelete: givenDel, onChanged, onDeleted }: {
  name: string; pausedAt?: string; canDelete?: boolean; onChanged?: () => void; onDeleted?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ pausedAt: string; all: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (given !== undefined && givenDel !== undefined) return;
    api<{ clubs: { name: string; pausedAt: string }[]; all?: boolean }>("/api/admin/clubs").then((r) => {
      if (r.ok) setLoaded({ pausedAt: r.data.clubs.find((c) => c.name === name)?.pausedAt ?? "", all: !!r.data.all });
    });
  }, [name, given, givenDel]);

  const pausedAt = given ?? loaded?.pausedAt ?? "";
  const canDelete = givenDel ?? loaded?.all ?? false;
  if (given === undefined && !loaded) return null;

  async function setPaused(paused: boolean) {
    const ask = paused
      ? `“${name}” 클럽을 활동 중지할까요?\n\n· 회원 화면의 클럽 목록·가입 신청에서 빠지고, 새 일정을 만들 수 없어요.\n· 지난 일정과 사진첩은 참석했던 회원이 계속 볼 수 있어요.\n· 기록은 지워지지 않고, 관리자는 회비 입금 상태 등을 그대로 고칠 수 있어요.\n· ‘다시 활동’으로 언제든 되돌릴 수 있어요.`
      : `“${name}” 클럽을 다시 활동으로 바꿀까요? 회원 화면에 다시 보여요.`;
    if (!window.confirm(ask)) return;
    setBusy(true);
    setErr("");
    const r = await api(`/api/admin/clubs/${encodeURIComponent(name)}/status`, { method: "POST", body: { paused } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    if (given === undefined) setLoaded((l) => l && { ...l, pausedAt: paused ? new Date().toISOString() : "" });
    onChanged?.();
  }

  function openDelete() {
    if (!pausedAt) return void window.alert("삭제하려면 먼저 ‘활동 중지’해 주세요. 활동 중지한 클럽만 삭제할 수 있어요.");
    setTyped("");
    setErr("");
    setDel(true);
  }

  async function remove() {
    setBusy(true);
    setErr("");
    // 1) 백업 내려받기
    const b = await api<Record<string, unknown>>(`/api/admin/clubs/${encodeURIComponent(name)}/status`);
    if (!b.ok) { setBusy(false); return setErr(`백업을 만들지 못해 삭제를 멈췄어요. ${b.error}`); }
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([JSON.stringify(b.data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `클럽기록_${name}_${day}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    // 2) 일정·신청 내역·게시글 지우기
    const r = await api<{ events: number; requests: number; posts: number }>(`/api/admin/clubs/${encodeURIComponent(name)}/status`, { method: "DELETE", body: { confirm: typed.trim() } });
    if (!r.ok) { setBusy(false); return setErr(r.error); }
    // 3) 목록·회원 소속·개요·회비 설정·대표사진 정리
    const l = await removeClub(name);
    setBusy(false);
    if (!l.ok) return setErr(`일정과 기록은 지웠지만 클럽 목록에서 빼지 못했어요. 다시 눌러 주세요. ${l.error}`);
    setDel(false);
    window.alert(`“${name}” 클럽을 삭제했어요. (일정 ${r.data.events}개, 신청 내역 ${r.data.requests}건, 게시글 ${r.data.posts}개)`);
    onDeleted?.();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {pausedAt
          ? <>
              <span className="pill warn">활동 중지 · {fmtDateTime(pausedAt).slice(0, 10)}</span>
              <button className="mini" type="button" disabled={busy} onClick={() => setPaused(false)}>다시 활동</button>
            </>
          : <button className="mini" type="button" disabled={busy} onClick={() => setPaused(true)}>활동 중지</button>}
        {canDelete && <button className="mini danger" type="button" disabled={busy} onClick={openDelete}>삭제</button>}
      </div>
      {err && !del && <div className="msg bad" role="alert">{err}</div>}
      <Popup id={`club-del-${name}`} width={480} title={`“${name}” 클럽 삭제`} open={del} onClose={() => !busy && setDel(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="msg bad">이 클럽의 모든 기록이 지워지고 되돌릴 수 없어요.</div>
          <span className="small">지우는 것: 클럽 일정(참석 신청·사진첩·세부 일정·비용·활동 포함), 가입·참관 신청 내역, 클럽 회비 청구 글, 클럽 개요·회비 설정, 회원의 클럽 소속</span>
          <span className="small">삭제하기 직전에 기록 백업 파일(JSON)을 자동으로 내려받아요.</span>
          <label className="l" htmlFor={`cd-${name}`} style={{ marginBottom: 0 }}>확인을 위해 클럽 이름 “{name}”을 입력해 주세요</label>
          <input id={`cd-${name}`} className="field" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {err && <div className="msg bad" role="alert">{err}</div>}
          <button className="btn red" type="button" disabled={busy || typed.trim() !== name}
            style={{ width: "auto", alignSelf: "flex-end", minWidth: 150, minHeight: 46, fontSize: fs(15) }} onClick={remove}>
            {busy ? "지우는 중…" : "모든 기록 삭제"}
          </button>
        </div>
      </Popup>
    </div>
  );
}
