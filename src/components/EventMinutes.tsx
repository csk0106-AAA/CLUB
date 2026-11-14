"use client";

import { useCallback, useEffect, useState } from "react";
import { MinutesFields } from "@/components/board/FormFields";
import { MinutesView } from "@/components/board/PostView";
import { Popup } from "@/components/Popup";
import type { MinutesData } from "@/lib/board";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

type M = MinutesData & { saved: boolean };

// 회의 일정의 회의록: 회원은 읽기, 관리자(all/events/minutes)는 팝업 창에서 쓰고 고친다.
// 회원 일정 화면(개요·홈)과 관리자 일정 관리 화면(회의록 탭)이 함께 쓴다.
export function EventMinutes({ eventId, admin }: { eventId: string; admin?: boolean }) {
  const [m, setM] = useState<M | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MinutesData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ minutes: M; canEdit: boolean; labels: Record<string, string> }>(`/api/events/${encodeURIComponent(eventId)}/minutes`);
    if (!r.ok) return setErr(r.error);
    setM(r.data.minutes);
    setCanEdit(r.data.canEdit);
    setLabels(r.data.labels ?? {});
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  function edit() {
    if (!m) return;
    const { saved: _s, ...data } = m;
    void _s;
    setDraft({ ...data, agenda: data.agenda.length ? data.agenda : [{ title: "", status: "논의 전", note: "" }] });
    setDirty(false);
    setErr("");
    setOpen(true);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setErr("");
    const r = await api<{ minutes: M }>(`/api/events/${encodeURIComponent(eventId)}/minutes`, { method: "PUT", body: draft });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setM(r.data.minutes);
    setDirty(false);
    setOpen(false);
    setNote("회의록을 저장했어요.");
  }

  if (!m) return err ? <div className="msg bad" role="alert">{err}</div> : null;
  const empty = !m.attendees && !m.followUp && !m.agenda.some((a) => a.title || a.note);

  return (
    <section aria-label="회의록" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b className="grow" style={{ font: `700 ${fs(17)} var(--display)` }}>회의록</b>
        {canEdit && (
          <button className="mini" type="button" aria-haspopup="dialog" onClick={edit} style={{ minHeight: 40 }}>
            {m.saved ? "회의록 고치기" : "회의록 쓰기"}
          </button>
        )}
      </div>
      {note && <div className="msg ok" role="status">{note}</div>}
      {empty ? (
        <div className="msg info">{canEdit ? "아직 회의록이 없어요. “회의록 쓰기”로 일시·참석자·안건·후속 조치를 적어 주세요." : "아직 회의록이 올라오지 않았어요."}</div>
      ) : (
        <MinutesView data={m} labels={labels} />
      )}
      {admin && !canEdit && <span className="small">회의록은 일정·회의록 권한이 있는 관리자가 고칠 수 있어요.</span>}

      <Popup id="event-minutes" title="회의록" open={open} onClose={() => setOpen(false)} dirty={dirty} width={720}
        footer={
          <>
            <button className="btn white" type="button" style={{ width: "auto" }} onClick={() => setOpen(false)}>취소</button>
            <button className="btn" type="button" style={{ width: "auto", minWidth: 120 }} disabled={busy} onClick={save}>{busy ? "저장하는 중…" : "저장"}</button>
          </>
        }>
        {err && <div className="msg bad" role="alert">{err}</div>}
        {draft && <MinutesFields data={draft} labels={labels} onChange={(d) => { setDraft(d); setDirty(true); }} />}
      </Popup>
    </section>
  );
}
