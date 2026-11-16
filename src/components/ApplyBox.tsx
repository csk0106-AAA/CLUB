"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MyApply } from "./ApplyNotice";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

// 설정 › 회원 신청 칸(대기회원·참관회원, 또는 신청이 대기 중·반려된 회원에게만 보인다).
//  "정회원 신청"(교육 이수자) / "회원 신청"(비이수자 → 준회원)을 보내면 관리자 › 회원관리 › 회원신청관리에서 승인한다.
export function ApplyBox() {
  const [d, setD] = useState<MyApply | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);

  useEffect(() => {
    api<MyApply>("/api/me/apply").then((r) => r.ok && setD(r.data));
  }, []);

  if (!d) return null;
  const a = d.app;
  const pending = a?.status === "pending";
  const rejected = a?.status === "rejected";
  if (!d.waiting && !d.observer && !pending && !rejected) return null;
  const label = d.edu ? "정회원 신청" : "회원 신청";

  async function send() {
    if (!window.confirm(`${label}을 보낼까요? 관리자가 승인하면 ${d?.edu ? "정회원" : "준회원"}이 돼요.`)) return;
    setBusy(true);
    setNote(null);
    const r = await api<MyApply>("/api/me/apply", { body: { action: "apply", message } });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setD(r.data);
    setMessage("");
    setNote({ tone: "info", text: `${label}을 보냈어요. 관리자가 승인하면 알려 드려요.` });
  }

  return (
    <section className="sect" id="apply" aria-labelledby="s-apply">
      <h2 id="s-apply">회원 신청</h2>
      <div className="sect-body" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="grow" style={{ fontSize: fs(14) }}>지금 회원구분: <b>{d.kind || "미지정"}</b>{d.edu ? " · 교육 이수" : ""}</span>
          {pending && <span className="pill warn">승인 전</span>}
          {rejected && <span className="pill bad">반려</span>}
        </div>
        {pending && a && (
          <span className="small" role="status">{fmtDate(a.createdAt)}에 보낸 {a.type === "observe" ? "참관" : "회원"} 신청을 관리자가 확인하고 있어요.</span>
        )}
        {rejected && a && (
          <div className="msg bad" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>{fmtDate(a.handledAt)}에 신청이 반려됐어요.</span>
            <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>사유: {a.reason || "(적힌 사유가 없어요)"}</span>
          </div>
        )}
        {d.canApply && (
          <>
            <span className="small">
              {d.edu ? "정회원으로 활동하려면 정회원 신청을 보내 주세요." : "회원(준회원)으로 활동하려면 회원 신청을 보내 주세요."} 일정에 참관만 하려면 <Link href="/events">일정</Link>에서 참관을 신청해요.
            </span>
            <div>
              <label className="l" htmlFor="ap-msg">남길 말 (선택)</label>
              <textarea id="ap-msg" className="field" rows={2} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <button className="btn" type="button" disabled={busy} onClick={send}>{busy ? "보내는 중…" : rejected ? `다시 ${label}` : label}</button>
          </>
        )}
        {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      </div>
    </section>
  );
}
