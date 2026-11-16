"use client";

import { useState } from "react";
import { Popup } from "@/components/Popup";
import { api, fmtDate } from "@/lib/client";
import { clubLabel } from "@/lib/club-label";
import { fs } from "@/lib/fs";

export type AttendReq = {
  id: string; kind: string; status: string; message: string; createdAt: string; handledAt: string; reason?: string;
} | null;
// 이 소모임 가입 신청(설정·게시글에서 보낸 것 포함) 중 최근 것
export type JoinReq = { id: string; status: string; reason: string; message: string; createdAt: string; handledAt: string } | null;
type Kind = "observe" | "join";

const KINDS: { k: Kind; title: string; desc: string }[] = [
  { k: "join", title: "소모임 가입하고 참석", desc: "소모임 회원이 되고, 이번 일정에도 참석해요." },
  { k: "observe", title: "이번 일정만 참관", desc: "소모임에 가입하지 않고 이번 일정에만 참석해요." },
];
const kindText = (k: string) => (k === "join" ? "소모임 가입 + 참석" : "참관 + 참석");

// 내가 속하지 않은 소모임 일정의 아래쪽 참석 칸. 일정 내용은 모두 읽을 수 있고, 여기에 "○○ 회원이 아닙니다." 를 보여 준다.
//  참석/불참 대신 "○○ 신청하러 가기" → 팝업에서 소모임 가입 / 이번만 참관을 골라 신청한다(승인되면 이 일정 참석까지).
//  소모임 관리자(직책자)가 소모임관리 › 신청내역(또는 종 알림)에서 승인하면 참석 신청까지 되어 이 칸 대신 보통 참석 칸이 보인다.
//  대기 중: "관리자 확인 중"(신청 취소 가능) / 반려: 사유를 보여 주고 다시 신청할 수 있다.
// guest(대기회원·참관회원): 소모임 가입 없이 "이번 일정 참관"만 신청한다. 소모임이 없는 일정이면 일정 관리자가 승인한다.
export function ClubRequestCard({ eventId, club, leaders, req, join = null, guest = false, onChange }: {
  eventId: string;
  guest?: boolean;
  club: string;
  leaders: { name: string; role: string }[];
  req: AttendReq;
  join?: JoinReq;
  onChange: () => void | Promise<void>;
}) {
  const cl = clubLabel(club); // 문장 안 이름: "독서" → "독서 모임"
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(guest ? "observe" : "join");
  const kinds = guest ? KINDS.filter((o) => o.k === "observe") : KINDS;
  // 승인하는 사람: 소모임 일정이면 소모임 관리자, 그 밖에는 일정 관리자
  const boss = club ? "소모임 관리자" : "일정 관리자";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const pending = req?.status === "pending";
  const declined = req?.status === "declined";
  // 이 일정과 상관없이 보낸 가입 신청이 대기 중이면(설정·게시글에서) 그 상태를 보여 준다
  const joinPending = !pending && join?.status === "pending";
  const who = leaders.length ? leaders.map((l) => `${l.role} ${l.name}`).join(", ") : "";

  async function send() {
    setBusy(true);
    setError("");
    const r = await api("/api/club-requests", { body: { kind, eventId, message, attend: true } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setMessage("");
    setNote(`신청을 보냈어요. ${boss}가 승인하면 참석 신청까지 완료돼요.`);
    await onChange();
  }

  // 보낸 신청 취소: 이 일정의 참석 요청, 또는 다른 곳(설정·게시글)에서 보낸 가입 신청
  async function cancel() {
    const id = pending ? req?.id : joinPending ? join?.id : "";
    if (!id || !window.confirm(pending ? "보낸 신청을 취소할까요?" : `${cl} 가입 신청을 취소할까요?`)) return;
    setBusy(true);
    setError("");
    const r = await api(`/api/club-requests/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNote("신청을 취소했어요.");
    await onChange();
  }

  return (
    <div className="footer-actions">
      <section className="card" aria-labelledby="creq-h" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <b id="creq-h" style={{ font: `700 ${fs(17)} var(--display)` }}>{guest ? "참관 신청 후 참석할 수 있어요." : `${cl} 회원이 아닙니다.`}</b>
          {(pending || joinPending) && <span className="pill warn">관리자 확인 중</span>}
          {declined && <span className="pill bad">반려됨</span>}
        </div>
        {pending && req ? (
          <div role="status" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>{boss}가 확인하고 있어요. 승인되면 참석 신청까지 완료돼요.</span>
            <span className="small">{kindText(req.kind)} 신청 · {fmtDate(req.createdAt)}</span>
            {req.message && <span className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{req.message}”</span>}
          </div>
        ) : declined ? (
          <div className="msg bad" role="status" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>신청이 반려됐어요. 필요하면 다시 신청할 수 있어요.</span>
            {req?.reason && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>사유: {req.reason}</span>}
          </div>
        ) : joinPending ? (
          <span role="status">{cl} 가입 신청을 소모임 관리자가 확인하고 있어요. 승인되면 이 일정에 참석 신청할 수 있어요.</span>
        ) : guest ? (
          <span className="small">일정 내용은 모두 볼 수 있어요. 참석하려면 이번 일정 참관을 신청해 주세요. {boss}가 승인하면 참석 신청까지 완료돼요.</span>
        ) : (
          <span className="small">
            일정 내용은 모두 볼 수 있어요. 참석하려면 {cl}에 가입하거나 이번 일정만 참관 신청해 주세요. 소모임 관리자가 승인하면 참석 신청까지 완료돼요.
          </span>
        )}
        {who && <span className="small">소모임 관리자: {who}</span>}
        {note && <div className="msg info" role="status">{note}</div>}
        {error && !open && <div className="msg bad" role="alert">{error}</div>}
      </section>
      {pending || joinPending ? (
        <button className="btn white" type="button" disabled={busy} onClick={cancel}>{pending ? "신청 취소" : "가입 신청 취소"}</button>
      ) : !joinPending && (
        <button className="btn" type="button" disabled={busy} onClick={() => { setError(""); setNote(""); setOpen(true); }}>
          {declined ? "다시 신청하기" : guest ? "참관 신청하기" : `${cl} 신청하러 가기`}
        </button>
      )}

      <Popup id="club-attend-req" title={guest ? "참관 신청" : `${cl} 신청`} open={open} onClose={() => setOpen(false)} dirty={!!message.trim()}
        footer={(
          <button className="btn" type="button" disabled={busy} onClick={send}>{busy ? "보내는 중…" : "신청하기"}</button>
        )}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span id="creq-kind-l" className="l" style={{ margin: 0 }}>어떻게 함께할까요?</span>
          <div role="radiogroup" aria-labelledby="creq-kind-l" className="pick">
            {kinds.map((o) => (
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
            <label className="l" htmlFor="creq-msg">신청 사유·인사말 (선택)</label>
            <textarea id="creq-msg" className="field" rows={2} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }}
              placeholder="예) 이번에 처음 참여해 보고 싶어요." value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="msg info">{boss}가 승인하면 {kind === "join" ? `${cl} 회원이 되고 ` : ""}이 일정 참석 신청까지 완료돼요.</div>
          {error && <div className="msg bad" role="alert">{error}</div>}
        </div>
      </Popup>
    </div>
  );
}
