"use client";

import { useState } from "react";
import { api } from "@/lib/client";

type St = "" | "pending" | "approved" | "declined";

// 내가 속하지 않은 소모임 행사: 읽기만 되고, 소모임 가입 또는 이번 행사 1회 참관을 신청할 수 있다.
// 신청은 그 소모임 직책자에게 알림으로 가고, 승인되면 이 행사에 참석 신청할 수 있다.
export function ClubRequestCard({ eventId, club, requests, onSent }: {
  eventId: string;
  club: string;
  requests: { join: string; observe: string } | null;
  onSent: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const join = (requests?.join ?? "") as St;
  const observe = (requests?.observe ?? "") as St;

  async function send(kind: "join" | "observe") {
    setBusy(true);
    setNote(null);
    const r = await api("/api/club-requests", { body: { kind, eventId, message } });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setMessage("");
    setNote({ tone: "ok", text: kind === "join" ? `${club} 가입 신청을 보냈어요. 소모임 직책자가 확인하면 알려 드려요.` : "참관 신청을 보냈어요. 소모임 직책자가 확인하면 알려 드려요." });
    onSent();
  }

  const stateText = (s: St, what: string) =>
    s === "pending" ? `${what}을 보냈어요 · 확인을 기다리는 중이에요.` : s === "declined" ? `지난 ${what}은 받아들여지지 않았어요. 다시 신청할 수 있어요.` : "";

  return (
    <section className="card" aria-labelledby="creq-h" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b id="creq-h" style={{ font: "400 19px var(--display)" }}>이 소모임 회원이 아니에요</b>
      <span className="small">
        {club} 소모임 행사라 내용은 볼 수 있지만, 참석 신청은 소모임 회원과 참관자만 할 수 있어요.
        소모임에 가입하거나 이번 행사만 참관하고 싶다면 신청해 주세요.
      </span>
      {join && stateText(join, "가입 신청") && <div className="msg info" role="status">{stateText(join, "가입 신청")}</div>}
      {observe && stateText(observe, "참관 신청") && <div className="msg info" role="status">{stateText(observe, "참관 신청")}</div>}
      {note && <div className={`msg ${note.tone === "ok" ? "info" : "bad"}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <div>
        <label className="l" htmlFor="creq-msg">남길 말 (선택)</label>
        <textarea id="creq-msg" className="field" rows={2} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }}
          placeholder="예) 이번에 처음 참여해 보고 싶어요." value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn" type="button" disabled={busy || join === "pending"} onClick={() => send("join")}>
          {join === "pending" ? "가입 신청 보냄 ✓" : "소모임 가입 신청"}
        </button>
        <button className="btn white" type="button" disabled={busy || observe === "pending"} onClick={() => send("observe")}>
          {observe === "pending" ? "참관 신청 보냄 ✓" : "이번 행사 1회 참관 신청"}
        </button>
      </div>
    </section>
  );
}
