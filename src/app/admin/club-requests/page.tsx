"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { Popup } from "@/components/Popup";
import { refreshUnread } from "@/components/MemberTabs";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

type Item = {
  id: string; club: string; kind: string; kindLabel: string; attend: boolean; eventId: string; eventName: string;
  memberName: string; memberInfo: string; nowMember: boolean; message: string; status: string;
  createdAt: string; handledAt: string; handledByName: string; reason: string; canHandle: boolean;
};
type Data = { items: Item[]; clubs: string[]; all: boolean };
type Note = { tone: "bad" | "info"; text: string } | null;
type View = "pending" | "done";

const STATUS: Record<string, { text: string; tone: string }> = {
  pending: { text: "대기", tone: "warn" },
  approved: { text: "승인", tone: "ok" },
  declined: { text: "반려", tone: "bad" },
};

// 관리자 › 소모임관리 › 신청내역.
//  대기: 소모임 관리자(직책자)가 승인하면 자동으로 소모임 회원이 되고(참석 요청이면 그 일정 참석까지), 반려는 사유를 적는다.
//  처리 내역: 승인·반려한 신청과 처리자·처리일·반려 사유. 관리자는 모든 소모임, 소모임 직책자는 자기 소모임만 본다.
function Requests() {
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [view, setView] = useState<View>("pending");
  const [club, setClub] = useState("");
  const [busy, setBusy] = useState("");
  const [decline, setDecline] = useState<Item | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const r = await api<Data>("/api/admin/club-requests");
    if (r.ok) setData(r.data);
    else setNote({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(it: Item, decision: "approve" | "decline", why = "") {
    setBusy(it.id);
    setNote(null);
    const r = await api(`/api/club-requests/${it.id}`, { method: "PATCH", body: { decision, reason: why } });
    setBusy("");
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({
      tone: "info",
      text: decision === "approve"
        ? `${it.memberName} 님의 ${it.kindLabel}을 승인했어요.${it.kind === "join" ? ` 이제 ${it.club} 회원이에요.` : ""}${it.attend ? " 그 일정 참석 신청까지 됐어요." : ""}`
        : `${it.memberName} 님의 신청을 반려했어요. 사유는 신청한 회원에게 보여요.`,
    });
    setDecline(null);
    setReason("");
    refreshUnread();
    load();
  }

  if (!data) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const inClub = data.items.filter((i) => !club || i.club === club);
  const pending = inClub.filter((i) => i.status === "pending");
  const done = inClub.filter((i) => i.status !== "pending").sort((a, b) => (b.handledAt || b.createdAt).localeCompare(a.handledAt || a.createdAt));
  const what = (i: Item) => `${i.club} · ${i.kindLabel}${i.eventName ? ` · ${i.eventName}` : ""}`;

  return (
    <>
      <p className="small" style={{ margin: 0, fontSize: fs(12) }}>
        소모임 가입·참관 신청이에요. 승인하면 자동으로 소모임 회원이 되고(일정에서 보낸 신청이면 그 일정 참석까지), 반려하면 사유를 적을 수 있어요.
        {data.all ? " 관리자는 모든 소모임의 신청과 처리 내역을 볼 수 있어요." : " 내가 직책을 맡은 소모임의 신청만 보여요."}
      </p>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="보기" style={{ width: 220, flex: "none" }}>
          <button type="button" aria-pressed={view === "pending"} onClick={() => setView("pending")} style={{ minHeight: 40, fontSize: fs(13) }}>대기 {pending.length}</button>
          <button type="button" aria-pressed={view === "done"} onClick={() => setView("done")} style={{ minHeight: 40, fontSize: fs(13) }}>처리 내역 {done.length}</button>
        </div>
        {data.clubs.length > 1 && (
          <select className="field" aria-label="소모임" style={{ width: "auto", minWidth: 120, minHeight: 40 }} value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">모든 소모임</option>
            {data.clubs.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>

      {view === "pending" && (
        pending.length === 0 ? <div className="msg info">처리할 신청이 없어요.</div> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map((i) => (
              <li key={i.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <b className="grow" style={{ fontSize: fs(15) }}>{i.memberName} <span className="small">{i.memberInfo}</span></b>
                  {i.nowMember && <span className="pill gray">이미 회원</span>}
                </div>
                <span className="small">{what(i)} · {fmtDate(i.createdAt)} 신청</span>
                {i.message && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: fs(14) }}>“{i.message}”</span>}
                {i.canHandle ? (
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn" type="button" disabled={!!busy} style={{ minHeight: 44 }} onClick={() => decide(i, "approve")} aria-label={`${i.memberName} 님 ${i.kindLabel} 승인`}>
                      {busy === i.id ? "처리 중…" : "승인"}
                    </button>
                    <button className="btn white" type="button" disabled={!!busy} style={{ minHeight: 44 }} aria-haspopup="dialog"
                      onClick={() => { setReason(""); setDecline(i); }} aria-label={`${i.memberName} 님 ${i.kindLabel} 반려`}>반려</button>
                  </div>
                ) : <span className="small">이 소모임의 직책자가 처리해요.</span>}
              </li>
            ))}
          </ul>
        )
      )}

      {view === "done" && (
        done.length === 0 ? <div className="msg info">아직 처리한 신청이 없어요.</div> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {done.map((i) => (
              <li key={i.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <b className="grow" style={{ fontSize: fs(15) }}>{i.memberName}</b>
                  <span className={`pill ${STATUS[i.status]?.tone ?? "gray"}`}>{STATUS[i.status]?.text ?? i.status}</span>
                </div>
                <span className="small">{what(i)}</span>
                <span className="small">{fmtDate(i.createdAt)} 신청 · {i.handledAt ? `${fmtDate(i.handledAt)} ` : ""}{i.handledByName ? `${i.handledByName} 님이 ` : ""}{STATUS[i.status]?.text ?? "처리"}</span>
                {i.message && <span className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>신청 내용: “{i.message}”</span>}
                {i.status === "declined" && (
                  <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: fs(14) }}>반려 사유: {i.reason || "(적지 않음)"}</span>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      <Popup id="creq-decline" width={460} title={decline ? `${decline.memberName} 님 신청 반려` : "반려"} open={!!decline} onClose={() => setDecline(null)} dirty={!!reason.trim()}
        footer={decline && (
          <button className="btn" type="button" disabled={!!busy} onClick={() => decide(decline, "decline", reason)}>{busy ? "처리 중…" : "반려하기"}</button>
        )}>
        {decline && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="small">{what(decline)}</span>
            <div>
              <label className="l" htmlFor="creq-reason">반려 사유</label>
              <textarea id="creq-reason" className="field" rows={3} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }}
                placeholder="예) 이번 시즌 정원이 다 찼어요. 다음 모집 때 다시 신청해 주세요." value={reason} onChange={(e) => setReason(e.target.value)} />
              <span className="hint" style={{ fontSize: fs(12) }}>신청한 회원에게 사유가 보여요. 비워도 반려할 수 있어요.</span>
            </div>
          </div>
        )}
      </Popup>
    </>
  );
}

export default function ClubRequestsPage() {
  return <AdminGate mode="clubs" need={["members"]} active="/admin/club-requests"><Requests /></AdminGate>;
}
