"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Popup } from "./Popup";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

export type MyApply = {
  kind: string; waiting: boolean; observer: boolean; edu: boolean;
  app: { id: string; type: string; status: string; reason: string; toKind: string; createdAt: string; handledAt: string; unseen: boolean } | null;
  canApply: boolean; needProfile: boolean;
};

const FLAG = "applyNotice";
const takeFlag = () => {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
};
const dropFlag = () => {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    /* 무시 */
  }
};

// 로그인 직후(그리고 아직 안 본 신청 결과가 있을 때) 한 번 뜨는 회원 신청 안내.
//  - 승인 전: 관리자가 확인 중
//  - 반려: 반려 사유
//  - 승인: 바뀐 회원구분
//  - 대기회원: "정회원 신청 또는 참관을 원하는 일정을 선택하세요"
//  - 참관회원: "참관을 원하는 일정을 선택하세요"
//  - 로그인 화면으로 신청해 승인된 분: 설정에서 성별·회사명·직책 입력
// ready: 개인정보 동의 등 앞선 안내가 끝났을 때만 띄운다.
export function ApplyNotice({ ready = true }: { ready?: boolean }) {
  const [d, setD] = useState<MyApply | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    api<MyApply>("/api/me/apply").then((r) => {
      if (!live || !r.ok) return;
      const v = r.data;
      const fresh = takeFlag();
      const pending = v.app?.status === "pending";
      const something = pending || v.waiting || v.observer || v.needProfile || !!v.app?.unseen;
      // 로그인 직후에는 안내할 것이 있으면, 그 밖에는 안 본 결과(승인·반려)가 있을 때만
      if ((fresh && something) || v.app?.unseen) {
        setD(v);
        setOpen(true);
      } else if (fresh) dropFlag();
    });
    return () => {
      live = false;
    };
  }, [ready]);

  function close() {
    setOpen(false);
    dropFlag();
    if (d?.app?.unseen) api("/api/me/apply", { body: { action: "seen" } });
  }

  if (!d) return null;
  const a = d.app;
  const pending = a?.status === "pending";
  const rejected = a?.status === "rejected";
  const approved = a?.status === "approved" && a.unseen;
  const applyLabel = d.edu ? "정회원 신청" : "회원 신청";
  const title = rejected ? "신청이 반려됐어요" : approved ? "신청이 승인됐어요 ✓" : pending ? "신청을 확인하고 있어요" : "안내";

  return (
    <Popup id="apply-notice" width={440} title={title} open={open} onClose={close}
      footer={<button className="btn" type="button" onClick={close}>확인</button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: fs(15), lineHeight: 1.55 }}>
        {pending && a && (
          <span role="status">
            {a.type === "observe" ? "참관" : "회원"} 신청({fmtDate(a.createdAt)})을 관리자가 확인하고 있어요. 승인되면 알려 드려요.
          </span>
        )}
        {rejected && a && (
          <div className="msg bad" role="status" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>{fmtDate(a.handledAt)}에 {a.type === "observe" ? "참관" : "회원"} 신청이 반려됐어요.</span>
            <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>사유: {a.reason || "(적힌 사유가 없어요)"}</span>
            <span className="small">궁금한 점은 관리자에게 문의해 주세요.</span>
          </div>
        )}
        {approved && a && (
          <span role="status">{a.type === "member" ? `이제 ${a.toKind}이에요. 환영해요!` : "참관 신청이 승인됐어요. 일정에서 참관을 신청해 주세요."}</span>
        )}

        {!pending && d.waiting && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: `700 ${fs(16)}/1.4 var(--display)` }}>{applyLabel} 또는 참관을 원하는 일정을 선택하세요</b>
            <div className="row" style={{ gap: 8 }}>
              {d.canApply && <Link className="btn" href="/settings#apply" onClick={close} style={{ textDecoration: "none" }}>{applyLabel}</Link>}
              <Link className="btn white" href="/events" onClick={close} style={{ textDecoration: "none" }}>일정 보기</Link>
            </div>
          </div>
        )}
        {!pending && d.observer && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: `700 ${fs(16)}/1.4 var(--display)` }}>참관을 원하는 일정을 선택하세요</b>
            <Link className="btn white" href="/events" onClick={close} style={{ textDecoration: "none" }}>일정 보기</Link>
          </div>
        )}
        {d.needProfile && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: `700 ${fs(16)}/1.4 var(--display)` }}>설정에서 내 정보(성별, 회사명, 직책)를 입력해 주세요</b>
            <Link className="btn white" href="/settings" onClick={close} style={{ textDecoration: "none" }}>설정으로</Link>
          </div>
        )}
      </div>
    </Popup>
  );
}
