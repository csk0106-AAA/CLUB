"use client";

import { useState } from "react";
import { Popup } from "@/components/Popup";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

export type AttendReq = {
  id: string; kind: string; status: string; message: string; createdAt: string; handledAt: string;
} | null;
type Kind = "observe" | "join";

const KINDS: { k: Kind; title: string; desc: string }[] = [
  { k: "observe", title: "이번 일정만 참관", desc: "소모임에 가입하지 않고 이번 일정에만 참석해요." },
  { k: "join", title: "소모임 가입하고 참석", desc: "소모임 회원이 되고, 이번 일정에도 참석해요." },
];
const kindText = (k: string) => (k === "join" ? "소모임 가입 + 참석" : "참관 + 참석");

// 내가 속하지 않은 소모임 일정의 아래쪽 참석 칸.
//  참석/불참 대신 "소모임 관리자에게 요청하기" → 팝업에서 참관 / 소모임 가입을 골라 요청을 보낸다.
//  관리자가 승인하면 참석 신청까지 되어(신청 완료) 이 칸 대신 보통 참석 칸이 보인다.
//  대기 중: "관리자 확인 중"(요청 취소 가능) / 거절: 다시 요청할 수 있다.
export function ClubRequestCard({ eventId, club, leaders, req, onChange }: {
  eventId: string;
  club: string;
  leaders: { name: string; role: string }[];
  req: AttendReq;
  onChange: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("observe");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const pending = req?.status === "pending";
  const declined = req?.status === "declined";
  const who = leaders.length ? leaders.map((l) => `${l.role} ${l.name}`).join(", ") : "";

  async function send() {
    setBusy(true);
    setError("");
    const r = await api("/api/club-requests", { body: { kind, eventId, message, attend: true } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setMessage("");
    setNote("요청을 보냈어요. 소모임 관리자가 승인하면 신청 완료돼요.");
    await onChange();
  }

  async function cancel() {
    if (!req || !window.confirm("보낸 요청을 취소할까요?")) return;
    setBusy(true);
    setError("");
    const r = await api(`/api/club-requests/${req.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNote("요청을 취소했어요.");
    await onChange();
  }

  return (
    <div className="footer-actions">
      <section className="card" aria-labelledby="creq-h" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <b id="creq-h" style={{ font: `700 ${fs(17)} var(--display)` }}>{club} 소모임 일정이에요</b>
          {pending && <span className="pill warn">관리자 확인 중</span>}
          {declined && <span className="pill bad">요청 거절됨</span>}
        </div>
        {pending && req ? (
          <div role="status" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>소모임 관리자가 확인하고 있어요. 승인되면 신청 완료돼요.</span>
            <span className="small">{kindText(req.kind)} 요청 · {fmtDate(req.createdAt)}</span>
            {req.message && <span className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{req.message}”</span>}
          </div>
        ) : declined ? (
          <div className="msg bad" role="status">요청이 거절됐어요. 필요하면 다시 요청할 수 있어요.</div>
        ) : (
          <span className="small">
            소모임 회원과 참관자만 바로 참석 신청할 수 있어요. 소모임 관리자에게 요청하면, 승인되는 대로 신청 완료돼요.
          </span>
        )}
        {who && <span className="small">소모임 관리자: {who}</span>}
        {note && <div className="msg info" role="status">{note}</div>}
        {error && !open && <div className="msg bad" role="alert">{error}</div>}
      </section>
      {pending ? (
        <button className="btn white" type="button" disabled={busy} onClick={cancel}>요청 취소</button>
      ) : (
        <button className="btn" type="button" disabled={busy} onClick={() => { setError(""); setNote(""); setOpen(true); }}>
          {declined ? "다시 요청하기" : "소모임 관리자에게 요청하기"}
        </button>
      )}

      <Popup id="club-attend-req" title="소모임 관리자에게 요청하기" open={open} onClose={() => setOpen(false)} dirty={!!message.trim()}
        footer={(
          <button className="btn" type="button" disabled={busy} onClick={send}>{busy ? "보내는 중…" : "요청 보내기"}</button>
        )}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span id="creq-kind-l" className="l" style={{ margin: 0 }}>어떻게 참석할까요?</span>
          <div role="radiogroup" aria-labelledby="creq-kind-l" className="pick">
            {KINDS.map((o) => (
              <button key={o.k} type="button" role="radio" aria-checked={kind === o.k} aria-pressed={kind === o.k} className="opt rowopt"
                onClick={() => setKind(o.k)}>
                <span className="grow">
                  <span className="name">{o.title}</span>
                  <span className="small">{o.desc}</span>
                </span>
                <span className="tick" />
              </button>
            ))}
          </div>
          <div>
            <label className="l" htmlFor="creq-msg">남길 말 (선택)</label>
            <textarea id="creq-msg" className="field" rows={2} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }}
              placeholder="예) 이번에 처음 참여해 보고 싶어요." value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="msg info">소모임 관리자가 승인하면 신청 완료돼요.</div>
          {error && <div className="msg bad" role="alert">{error}</div>}
        </div>
      </Popup>
    </div>
  );
}
