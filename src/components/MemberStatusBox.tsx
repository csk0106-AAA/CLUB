"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MyApply } from "./ApplyNotice";
import { resetHeaderCache } from "./MainHeader";
import { Popup } from "./Popup";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";
import { disablePush } from "@/lib/push-client";

// "2026년11월18일"(한국 시간)
const koDate = (iso: string) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3600_000);
  return `${d.getUTCFullYear()}년${d.getUTCMonth() + 1}월${d.getUTCDate()}일`;
};
type Apply = MyApply & { change?: { to: string; label: string } | null; approvedAt?: string; latest?: { label: string; at: string; tone: "ok" | "warn" | "bad" } | null };

// 설정 › 회원 정보: 지금 회원구분과 신청 상태, "회원 권한 수정"(관리자 승인 요청), "회원 탈퇴".
//  회원 권한 수정: 정회원·준회원 → 대기회원으로 변경 / 대기회원 → 정회원 신청 / 참관회원 → 준회원 신청
//  회원 탈퇴: 확인 창(탈퇴·취소) → 탈퇴하면 바로 로그인 화면으로
// leaveOnly: 설정 맨 아래에 "회원 탈퇴" 작은 링크와 확인 창만 그린다(위쪽 회원 정보에는 탈퇴 버튼을 두지 않는다)
export function MemberStatusBox({ leaveOnly = false }: { leaveOnly?: boolean } = {}) {
  const router = useRouter();
  const [d, setD] = useState<Apply | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    api<Apply>("/api/me/apply").then((r) => r.ok && setD(r.data));
  }, []);
  if (!d) return null;
  const a = d.app;
  const pending = a?.status === "pending";
  const rejected = a?.status === "rejected";

  async function requestChange() {
    if (!d?.change) return;
    if (!window.confirm(`“${d.change.label}”\n관리자에게 승인 요청합니다.`)) return;
    setBusy(true);
    setNote(null);
    const r = await api<Apply>("/api/me/apply", { body: { action: "change", to: d.change.to } });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setD(r.data);
    setEditOpen(false);
    setNote({ tone: "info", text: "관리자에게 승인 요청을 보냈어요. 승인되면 알려 드려요." });
  }

  async function leave() {
    setBusy(true);
    const r = await api("/api/me/withdraw", { body: {} });
    if (!r.ok) {
      setBusy(false);
      setLeaveOpen(false);
      return setNote({ tone: "bad", text: r.error });
    }
    await disablePush().catch(() => undefined); // 이 기기로 알림이 가지 않게
    resetHeaderCache();
    router.replace("/");
  }

  const leavePopup = (
      <Popup id="leave" width={420} title="회원 탈퇴" open={leaveOpen} onClose={() => !busy && setLeaveOpen(false)}
        footer={(
          <div className="row" style={{ gap: 8, width: "100%" }}>
            <button className="btn red" type="button" disabled={busy} style={{ flex: 1 }} onClick={leave}>{busy ? "탈퇴하는 중…" : "탈퇴"}</button>
            <button className="btn white" type="button" disabled={busy} style={{ flex: 1 }} onClick={() => setLeaveOpen(false)}>취소</button>
          </div>
        )}>
        <p style={{ margin: 0, lineHeight: 1.6 }} role="alert">회원을 탈퇴하시면 모든 정보가 삭제되며 로그인 시 재가입을 신청해야 합니다.</p>
        {note?.tone === "bad" && <div className="msg bad" role="alert" style={{ marginTop: 8 }}>{note.text}</div>}
      </Popup>
  );
  if (leaveOnly) {
    return (
      <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
        <button type="button" className="small" disabled={busy} onClick={() => setLeaveOpen(true)}
          style={{ background: "none", border: 0, color: "var(--red-t)", textDecoration: "underline", cursor: "pointer", padding: 6 }}>회원 탈퇴</button>
        {leavePopup}
      </div>
    );
  }
  return (
    <section className="sect" id="apply" aria-labelledby="s-member">
      <h2 id="s-member">회원 정보</h2>
      <div className="sect-body" style={{ gap: 10 }}>
        {/* 한 줄: 왼쪽 구분 이름(예: 정회원) · 오른쪽 끝 회원 정보 최신 상태와 날짜(예: 가입승인 2026년11월18일) */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <b className="grow" style={{ fontSize: fs(15) }}>{d.kind || "미지정"}</b>
          {(() => {
            const u = d.latest; // 서버: 승인·반려·신청 대기·탈퇴·탈퇴 해지·구분 변경 중 가장 최근 것(lib/member-history.ts latestStatus)
            return u && <span className="small" style={{ flex: "none", fontWeight: 700, color: u.tone === "warn" ? "var(--blue-t)" : u.tone === "bad" ? "var(--red-t)" : undefined }}>{u.label} {koDate(u.at)}</span>;
          })()}
        </div>
        {pending && a && (
          <span className="small" role="status">
            {fmtDate(a.createdAt)}에 보낸 {a.type === "change" ? `“${a.toKind}” 변경 요청` : a.type === "observe" ? "참관 신청" : "회원 신청"}을 관리자가 확인하고 있어요.
          </span>
        )}
        {rejected && a && (
          <div className="msg bad" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>{fmtDate(a.handledAt)}에 신청이 반려됐어요.</span>
            <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>사유: {a.reason || "(적힌 사유가 없어요)"}</span>
          </div>
        )}
        {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn white" type="button" style={{ flex: 1 }} disabled={busy} aria-expanded={editOpen} onClick={() => setEditOpen(!editOpen)}>회원 권한 수정</button>
        </div>
        {editOpen && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--soft)" }}>
            {pending ? (
              <span className="small">관리자가 확인 중인 요청이 있어요. 처리된 뒤에 다시 요청할 수 있어요.</span>
            ) : d.change ? (
              <>
                <span className="small">
                  {d.change.to === "대기회원"
                    ? "대기회원이 되면 프로필 북에서 공개가 해제돼요."
                    : `${d.change.to}이 되면 프로필 북에 공개돼요.`} 관리자가 승인하면 바로 바뀌어요.
                </span>
                <button className="btn" type="button" disabled={busy} onClick={requestChange}>{busy ? "보내는 중…" : d.change.label}</button>
              </>
            ) : (
              <span className="small">{d.kind || "지금"} 구분에서는 요청할 수 있는 변경이 없어요. 필요하면 관리자에게 문의해 주세요.</span>
            )}
          </div>
        )}
      </div>

    </section>
  );
}
