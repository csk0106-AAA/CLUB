"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { readVisibility, VIS_LABEL, type VisKey } from "@/lib/event-visibility";

// 관리자 › 일정의 각 탭: "미응답·불참 회원에게도 보이기 [스위치]" — 공개 대상 중 아직 참석하지 않은 회원(미응답·불참·승인 대기)에게
//  이 항목을 보여 줄지. 끄면 회원 화면에 "참석 신청하면 볼 수 있어요"로 잠겨 보이고 서버도 내용을 보내지 않는다.
//  누르면 바로 저장(이 항목만 바꾼다)하고 잠깐 "저장됨 ✓"을 보여 준다. 처음 값은 일정에 저장된 값, 없으면 일정 유형 기본값(lib/event-visibility.ts).
//  준비목록·비용은 EventItems 의 "보는 사람"(관리자만·참석자·모든 회원)으로 함께 정한다.
//  inline: 다른 줄(안내 칸 제목·세부일정 안내) 옆에 붙여 쓴다
export function VisSwitch({ eventId, k, canEdit = true, inline = false, note }: { eventId: string; k: VisKey; canEdit?: boolean; inline?: boolean; note?: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    api<{ event: { type?: string; visibility?: string } }>(`/api/admin/events/${eventId}`).then((r) => {
      if (!stop && r.ok) setOn(readVisibility(r.data.event)[k]);
    });
    return () => { stop = true; window.clearTimeout(timer.current); };
  }, [eventId, k]);

  async function flip() {
    if (on === null) return;
    const next = !on;
    setBusy(true);
    setErr("");
    setSaved(false);
    setOn(next);
    const r = await api(`/api/admin/events/${eventId}`, { method: "PATCH", body: { visibility: { [k]: next } } });
    setBusy(false);
    if (!r.ok) {
      setOn(!next);
      setErr(r.error);
      return;
    }
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 2500);
  }

  if (on === null) return null;
  const id = `vis-nr-${k}`;
  const sw = (
    <span className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: inline ? undefined : "flex-end" }}>
      <span id={id} style={{ fontSize: fs(13), fontWeight: 600 }}>{VIS_LABEL[k]}: 미응답·불참 회원에게도 보이기</span>
      <button type="button" role="switch" className="switch" aria-checked={on} aria-labelledby={id}
        title={on ? "아직 참석하지 않은 회원(미응답·불참·승인 대기)도 봐요" : "참석한 회원만 봐요(나머지는 잠겨 보여요)"}
        disabled={!canEdit || busy} onClick={flip} />
      <span className="small" role="status" style={{ color: "var(--green-t)", fontWeight: 700, minWidth: 0 }}>{saved ? "저장됨 ✓" : ""}</span>
    </span>
  );
  if (inline) return <>{sw}{err && <span className="small" role="alert" style={{ color: "var(--red-t)" }}>{err}</span>}</>;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      {sw}
      <span className="small" style={{ fontSize: fs(11), textAlign: "right" }}>{note ?? (on ? "참석하지 않은 회원도 봐요." : "참석한 회원만 봐요. 나머지는 잠겨 보여요.")}</span>
      {err && <div className="msg bad" role="alert">{err}</div>}
    </div>
  );
}
