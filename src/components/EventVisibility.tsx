"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { readVisibility, VIS_KEYS, VIS_LABEL, visDefaults, type Visibility, type VisKey } from "@/lib/event-visibility";
import { ActionNote, type ActionMsg } from "./ActionNote";

// 관리자 › 일정 편집: 미응답·불참 회원(공개 대상 중 아직 참석하지 않은 회원)에게 공개할 항목. 누르면 바로 저장.
//  개요·사진첩은 늘 공개(고정). 참석(확정)한 회원은 모두 본다. 비어 있으면 일정 유형 기본값(워크숍만 정해 둠).
export function EventVisibility({ eventId, type, visibility, onSaved }: { eventId: string; type: string; visibility?: string; onSaved?: () => void }) {
  const [v, setV] = useState<Visibility>(() => readVisibility({ type, visibility }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ActionMsg>(null);
  useEffect(() => setV(readVisibility({ type, visibility })), [type, visibility]);

  async function save(next: Visibility, text: string) {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/admin/events/${eventId}`, { method: "PATCH", body: { visibility: next } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setV(next);
    setMsg({ tone: "info", text });
    onSaved?.();
  }
  const toggle = (k: VisKey) => save({ ...v, [k]: !v[k] }, `${VIS_LABEL[k]}: ${!v[k] ? "미응답·불참 회원에게도 보여요" : "참석한 회원에게만 보여요"}.`);
  const def = visDefaults(type);

  return (
    <details className="card">
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: fs(15) }}>
        미응답·불참 회원에게 공개 <span className="small">({VIS_KEYS.filter((k) => v[k]).length}/{VIS_KEYS.length}개 공개)</span>
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        <span className="small">공개 대상 중 아직 참석하지 않은 회원(미응답·불참·승인 대기)에게 보여 줄 항목이에요. 체크하지 않은 항목은 “참석 신청하면 볼 수 있어요”로 잠겨 보여요. 참석한 회원은 모두 봐요. 누르면 바로 저장돼요.</span>
        <span className="small"><b>항상 공개</b> · 개요(제목·일시·장소), 사진첩(보기·좋아요·댓글·내려받기 — 사진 올리기는 참석자만)</span>
        <div className="checks" role="group" aria-label="미응답·불참 회원에게 공개할 항목">
          {VIS_KEYS.map((k) => (
            <label key={k}>
              <input type="checkbox" checked={v[k]} disabled={busy} onChange={() => toggle(k)} />
              {VIS_LABEL[k]}
            </label>
          ))}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="small grow">{type === "워크숍" ? "워크숍 기본값: 안내·일정·참가비·회의록 공개, 주요 활동·준비목록·배정은 참석자만." : "이 유형의 기본값은 모두 공개예요."}</span>
          <button className="mini" type="button" disabled={busy || VIS_KEYS.every((k) => v[k] === def[k])} onClick={() => save(def, "유형 기본값으로 되돌렸어요.")}>기본값으로</button>
        </div>
        <ActionNote msg={msg} />
      </div>
    </details>
  );
}
