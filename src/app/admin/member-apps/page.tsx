"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { refreshUnread } from "@/components/MemberTabs";
import { Popup } from "@/components/Popup";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

type App = {
  id: string; memberId: string; name: string; removed: boolean; phone: string; kind: string;
  type: "member" | "observe" | "change" | "rejoin"; typeLabel: string; edu: string; recommenders: string; message: string;
  source: string; sourceLabel: string; status: "pending" | "approved" | "rejected" | "canceled"; reason: string;
  createdAt: string; handledAt: string; handledByName: string; toKind: string; fromKind: string;
  note?: string; // 관리자에게 보일 안내(탈퇴회원과 이름·전화번호 대조 결과 등)
};
type Note = { tone: "bad" | "info"; text: string } | null;
type View = "pending" | "done";

const STATUS: Record<string, { text: string; tone: string }> = {
  pending: { text: "승인 전", tone: "warn" },
  approved: { text: "승인", tone: "ok" },
  rejected: { text: "반려", tone: "bad" },
  canceled: { text: "취소(탈퇴)", tone: "gray" },
};

// 승인하면 어떻게 되는지 한 줄
function outcome(a: App): string {
  if (a.type === "rejoin") return "승인하면 탈퇴를 해지해요. 탈퇴 전 회원구분으로 돌아가고 다시 로그인할 수 있어요.";
  if (a.type === "change") return `승인하면 ${a.kind || "지금 구분"} → ${a.toKind}으로 바로 바뀌고, 프로필 북 공개도 ${a.toKind === "대기회원" ? "해제돼요" : "켜져요"}.`;
  if (a.type === "observe") return `승인하면 ${a.kind || "지금 구분"}을 유지하고 “승인 전” 표시만 사라져요. 일정은 참관 신청으로 참석해요.`;
  return `승인하면 ${a.toKind}으로 바뀌어요.`;
}

// 관리자 › 회원관리 › 회원신청관리: 로그인 화면 "회원 또는 참관 신청"과 설정의 "정회원 신청"을 승인·반려한다.
function MemberApps() {
  const [apps, setApps] = useState<App[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [view, setView] = useState<View>("pending");
  const [busy, setBusy] = useState("");
  const [reject, setReject] = useState<App | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ apps: App[] }>("/api/admin/member-apps");
    if (r.ok) setApps(r.data.apps);
    else setNote({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(a: App, decision: "approve" | "reject", why = "") {
    setBusy(a.id);
    setNote(null);
    const r = await api<{ toKind: string }>(`/api/admin/member-apps/${a.id}`, { method: "PATCH", body: { decision, reason: why } });
    setBusy("");
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({
      tone: "info",
      text: decision === "approve"
        ? `${a.name} 님의 ${a.typeLabel}을 승인했어요. 회원구분: ${r.data.toKind}`
        : `${a.name} 님의 신청을 반려했어요. 회원 명단에 “반려” 표시가 붙고, 신청한 분은 로그인하면 사유를 볼 수 있어요.`,
    });
    setReject(null);
    setReason("");
    refreshUnread();
    load();
  }

  if (!apps) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const pending = apps.filter((a) => a.status === "pending");
  const done = apps.filter((a) => a.status !== "pending");
  const shown = view === "pending" ? pending : done;

  return (
    <>
      <details className="card" style={{ fontSize: fs(13) }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>회원 신청 절차 보기</summary>
        <ol style={{ margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.5 }}>
          <li><b>관리자가 미리 등록한 교육 이수자</b>: 회원 명단에 “대기회원” + 교육 이수 YES로 등록 → 로그인하면 “정회원 신청 또는 참관을 원하는 일정을 선택하세요” 안내 → 설정에서 <b>정회원 신청</b>하면 여기에 올라와요(승인 → 정회원). 일정 참관은 일정에서 신청하고 일정 관리자가 승인해요.</li>
          <li><b>명단에 없는 분</b>: 로그인 화면 <b>회원 또는 참관 신청</b> → 정회원 필수 조건(<Link href="/admin/settings">모임개요</Link>) 질문 → 이름·전화번호(비이수자는 추천인)를 적으면 바로 회원 명단에 “승인 전”으로 등록돼요(초대코드 = 전화번호 뒷자리 4자리).
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              <li>수료 “네” + 회원요청 → 대기회원 → 승인: <b>정회원</b></li>
              <li>수료 “네” + 참관요청 → 대기회원 → 승인: 대기회원 유지</li>
              <li>수료 “아니요” + 회원요청 → 대기회원 → 승인: <b>준회원</b></li>
              <li>수료 “아니요” + 참관요청 → 참관회원 → 승인: 참관회원 유지</li>
            </ul>
          </li>
          <li><b>반려</b>: 사유를 적으면 회원 명단에 “반려” 표시가 붙고(누르면 사유), 신청한 분은 로그인 뒤 안내에서 사유를 봐요. 로그인까지 막으려면 <Link href="/admin/members">회원 명단</Link>에서 지워 주세요.</li>
          <li><b>회원 권한 수정</b>(설정): 정회원·준회원 → <b>대기회원으로 변경</b>, 대기회원 → <b>정회원 신청</b>, 참관회원 → <b>준회원 신청</b>. 승인하면 바로 바뀌고 프로필 북 공개도 맞춰져요(대기회원은 해제, 정회원·준회원은 공개).</li>
          <li><b>회원 탈퇴</b>(설정): 회원구분이 “탈퇴회원”이 되고 로그인할 수 없어요. 명단과 활동 기록은 남아요. 로그인 화면에서 <b>재가입</b>을 신청하면 이름·전화번호를 탈퇴회원과 대조해 여기에 알려 줘요(승인 = 탈퇴 해지). 회원 수정의 “탈퇴 해지”로도 되돌릴 수 있어요.</li>
          <li><b>명예회원</b>은 신청 없이 관리자가 회원 명단에서 등록하고, 메모에 등록 사유를 적어요.</li>
        </ol>
      </details>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <div className="seg" role="group" aria-label="보기" style={{ width: 240, flex: "none" }}>
        <button type="button" aria-pressed={view === "pending"} onClick={() => setView("pending")} style={{ minHeight: 40, fontSize: fs(13) }}>승인 전 {pending.length}</button>
        <button type="button" aria-pressed={view === "done"} onClick={() => setView("done")} style={{ minHeight: 40, fontSize: fs(13) }}>처리 내역 {done.length}</button>
      </div>

      {shown.length === 0 ? (
        <div className="msg info">{view === "pending" ? "확인할 회원 신청이 없어요." : "아직 처리한 신청이 없어요."}</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map((a) => (
            <li key={a.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <b className="grow" style={{ fontSize: fs(16) }}>
                  {a.name}{a.removed && <span className="small"> (명단에서 지움)</span>}
                </b>
                <span className="pill blue">{a.typeLabel}</span>
                <span className={`pill ${STATUS[a.status]?.tone ?? "gray"}`}>{STATUS[a.status]?.text ?? a.status}</span>
              </div>
              <dl className="small" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
                <dt>전화번호</dt><dd style={{ margin: 0 }}>{a.phone || "-"}</dd>
                <dt>교육 이수</dt><dd style={{ margin: 0 }}>{a.edu === "yes" ? "네 (수료)" : "아니요"}</dd>
                {a.recommenders && (<><dt>추천인</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{a.recommenders}</dd></>)}
                <dt>지금 구분</dt><dd style={{ margin: 0 }}>{a.kind || "-"}</dd>
                <dt>신청</dt><dd style={{ margin: 0 }}>{fmtDate(a.createdAt)} · {a.sourceLabel}</dd>
                {a.status !== "pending" && (
                  <><dt>처리</dt><dd style={{ margin: 0 }}>{fmtDate(a.handledAt)}{a.handledByName ? ` · ${a.handledByName} 님` : ""}{a.status === "approved" && a.fromKind !== a.toKind ? ` · ${a.fromKind} → ${a.toKind}` : ""}</dd></>
                )}
              </dl>
              {a.note && <div className="msg info" role="note" style={{ margin: 0, fontSize: fs(13) }}>⚠ {a.note}</div>}
              {a.message && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: fs(14) }}>“{a.message}”</span>}
              {a.status === "rejected" && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: fs(14) }}>반려 사유: {a.reason || "(적지 않음)"}</span>}
              {a.status === "pending" && (
                <>
                  <span className="small" style={{ color: "var(--blue-t)" }}>{outcome(a)}</span>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn" type="button" disabled={!!busy || a.removed} style={{ minHeight: 44 }} onClick={() => decide(a, "approve")} aria-label={`${a.name} 님 ${a.typeLabel} 승인`}>
                      {busy === a.id ? "처리 중…" : "승인"}
                    </button>
                    <button className="btn white" type="button" disabled={!!busy} style={{ minHeight: 44 }} aria-haspopup="dialog"
                      onClick={() => { setReason(""); setReject(a); }} aria-label={`${a.name} 님 ${a.typeLabel} 반려`}>반려</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Popup id="mapp-reject" width={460} title={reject ? `${reject.name} 님 신청 반려` : "반려"} open={!!reject} onClose={() => setReject(null)} dirty={!!reason.trim()}
        footer={reject && (
          <button className="btn" type="button" disabled={!!busy || !reason.trim()} onClick={() => decide(reject, "reject", reason)}>{busy ? "처리 중…" : "반려하기"}</button>
        )}>
        {reject && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="small">{reject.typeLabel} · {fmtDate(reject.createdAt)} 신청</span>
            <div>
              <label className="l" htmlFor="mapp-reason">반려 사유 (꼭 적어 주세요)</label>
              <textarea id="mapp-reason" className="field" rows={3} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }}
                placeholder="예) 제6기 수료 명단에서 확인되지 않아요. 관리자에게 연락 주세요." value={reason} onChange={(e) => setReason(e.target.value)} />
              <span className="hint" style={{ fontSize: fs(12) }}>신청한 분이 로그인하면 사유를 볼 수 있어요. 회원 명단에는 “반려” 표시가 붙어요.</span>
            </div>
          </div>
        )}
      </Popup>
    </>
  );
}

export default function MemberAppsPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/member-apps"><MemberApps /></AdminGate>;
}
