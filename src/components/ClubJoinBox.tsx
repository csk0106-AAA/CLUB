"use client";

import { useState } from "react";
import { Popup } from "./Popup";
import type { ClubJoinState } from "./board/types";
import { api, fmtDate } from "@/lib/client";
import { clubLabel } from "@/lib/club-label";
import { fs } from "@/lib/fs";

// 소모임 회원이 아닌 회원에게 보이는 칸: "○○ 회원이 아닙니다." + "○○ 신청하러 가기".
//  누르면 신청 양식(남길 말)이 뜨고, 보내면 소모임 관리자(직책자)가 소모임관리 › 신청내역에서 승인·반려한다.
//  승인되면 자동으로 소모임 회원이 된다. 대기 중이면 "관리자 확인 중"(신청 취소 가능), 반려되면 사유와 함께 다시 신청할 수 있다.
//  소모임 회비 글(게시글)에서 쓴다. 일정은 참석 요청까지 함께 보내는 ClubRequestCard 를 쓴다.
export function ClubJoinBox({ club, initial }: { club: string; initial: ClubJoinState }) {
  const cl = clubLabel(club); // 문장 안 이름: "독서" → "독서 모임"
  const [req, setReq] = useState<ClubJoinState>(initial);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const pending = req?.status === "pending";
  const declined = req?.status === "declined";

  async function send() {
    setBusy(true);
    setError("");
    const r = await api<{ request: { id: string } }>("/api/club-requests", { body: { kind: "join", club, message } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setReq({ id: r.data.request.id, status: "pending", reason: "", message: message.trim(), createdAt: new Date().toISOString(), handledAt: "" });
    setOpen(false);
    setMessage("");
    setNote(`${cl} 가입 신청을 보냈어요. 소모임 관리자가 승인하면 바로 ${cl} 회원이 돼요.`);
  }

  async function cancel() {
    if (!req || !window.confirm("보낸 가입 신청을 취소할까요?")) return;
    setBusy(true);
    setError("");
    const r = await api(`/api/club-requests/${req.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setReq(null);
    setNote("가입 신청을 취소했어요.");
  }

  return (
    <section className="card" aria-labelledby="cjoin-h" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b id="cjoin-h" style={{ font: `700 ${fs(17)} var(--display)` }}>{cl} 회원이 아닙니다.</b>
        {pending && <span className="pill warn">관리자 확인 중</span>}
        {declined && <span className="pill bad">반려됨</span>}
      </div>
      {pending && req ? (
        <div role="status" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>가입 신청을 소모임 관리자가 확인하고 있어요. 승인되면 바로 {cl} 회원이 돼요.</span>
          <span className="small">{fmtDate(req.createdAt)} 신청</span>
          {req.message && <span className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{req.message}”</span>}
        </div>
      ) : declined && req ? (
        <div className="msg bad" role="status" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span>가입 신청이 반려됐어요.{req.handledAt ? ` (${fmtDate(req.handledAt)})` : ""}</span>
          {req.reason && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>사유: {req.reason}</span>}
        </div>
      ) : (
        <span className="small">{cl}에 가입하면 이 소모임의 회비·일정에 함께할 수 있어요.</span>
      )}
      {note && <div className="msg info" role="status">{note}</div>}
      {error && !open && <div className="msg bad" role="alert">{error}</div>}
      {pending ? (
        <button className="btn white" type="button" disabled={busy} onClick={cancel}>신청 취소</button>
      ) : (
        <button className="btn" type="button" disabled={busy} onClick={() => { setError(""); setNote(""); setOpen(true); }}>
          {declined ? "다시 신청하기" : `${cl} 신청하러 가기`}
        </button>
      )}

      <Popup id="club-join" title={`${cl} 가입 신청`} open={open} onClose={() => setOpen(false)} dirty={!!message.trim()}
        footer={<button className="btn" type="button" disabled={busy} onClick={send}>{busy ? "보내는 중…" : "신청하기"}</button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="l" htmlFor="cjoin-msg">신청 사유·인사말 (선택)</label>
            <textarea id="cjoin-msg" className="field" rows={3} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }}
              placeholder={`예) ${cl} 활동에 함께하고 싶어요.`} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="msg info">소모임 관리자가 승인하면 바로 {cl} 회원이 돼요. 결과는 홈 화면 종 알림으로 알려 드려요.</div>
          {error && <div className="msg bad" role="alert">{error}</div>}
        </div>
      </Popup>
    </section>
  );
}
