"use client";

import { useState } from "react";
import { api, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

// 이미 프로필 북에 실명 소개가 공개된 회원이 '내가 누구일까요?'(프로필 북 익명 + 맞히기 게임)에 참여할 때 고른다(lib/who-join.ts).
//  [프로필북 초기화] 지금 소개를 지우고 별칭으로 새로 써서 모든 활동에 참여(맞히기 대상)
//  [일부활동참여]   지금 소개는 그대로, 맞히기 대상만 빠지고 나머지 활동(맞히기·투표 등)에 참여
// 활동 화면과 일정 화면(참석 신청한 뒤)에서 같이 쓴다. partial: 이미 일부활동참여를 고른 상태(초기화로 바꾸기만 보여 줌)
export function WhoChoice({ aid, name, canReset, revealAt, partial, onDone }: { aid: string; name?: string; canReset: boolean; revealAt?: string; partial?: boolean; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pick(decision: "update" | "partial") {
    if (decision === "update" && !window.confirm("지금 프로필 북에 공개된 내 소개가 지워지고, 이 활동에서 별칭으로 새로 써요. 진행할까요?")) return;
    setBusy(true);
    setErr("");
    const r = await api<{ state: string; alias?: string }>(`/api/who/${aid}/join`, { body: { decision } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onDone(decision === "update"
      ? `프로필 북을 초기화했어요. 이제 별칭 “${r.data.alias ?? ""}”(으)로 이 활동에 참여해요. 인터뷰부터 시작해 주세요.`
      : "일부 활동에 참여해요. 내 소개는 그대로 두고, 맞히기·투표에 참여할 수 있어요.");
  }
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(16)} var(--display)` }}>{partial ? "일부 활동에 참여하고 있어요" : `${name ? `‘${name}’ ` : ""}참여 방법을 골라 주세요`}</b>
      <span className="small" style={{ lineHeight: 1.6 }}>
        {partial
          ? "내 실명 소개는 그대로 두고, 맞히기 대상만 빠지고 누구일까요? 맞히기와 현장 투표에 참여해요."
          : "이 활동은 프로필 북을 익명(별칭)으로 바꾸고, 회원들이 누구인지 맞히는 게임이 들어 있어요. 회원님은 이미 프로필 북에 실명 소개가 공개돼 있어요."}
      </span>
      {!partial && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li><b>프로필북 초기화</b>: 지금 소개를 지우고 별칭으로 새로 써서 모든 활동에 참여해요{revealAt ? `. ${fmtDateTime(revealAt)}에 새 소개가 실명으로 다시 공개돼요` : ""}.</li>
          <li><b>일부활동참여</b>: 지금 소개는 그대로 두고, 맞히기 대상만 빼고 나머지 활동에 참여해요.</li>
        </ul>
      )}
      {err && <div className="msg bad" role="alert">{err}</div>}
      <div className="row" style={{ gap: 8 }}>
        {canReset && <button className="btn" type="button" disabled={busy} style={{ flex: 1 }} onClick={() => pick("update")}>{partial ? "프로필북 초기화로 바꾸기" : "프로필북 초기화"}</button>}
        {!partial && <button className="btn white" type="button" disabled={busy} style={{ flex: 1 }} onClick={() => pick("partial")}>일부활동참여</button>}
      </div>
      {!canReset && !partial && <span className="small">사전 작성이 마감돼 “일부활동참여”만 고를 수 있어요.</span>}
      {!canReset && partial && <span className="small">사전 작성이 마감돼 초기화로 바꿀 수 없어요.</span>}
    </div>
  );
}
