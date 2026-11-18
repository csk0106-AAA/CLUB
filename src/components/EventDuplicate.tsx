"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateField } from "./DateField";
import { Popup } from "./Popup";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 일정 복제 버튼 + 창: 새 이름과 시작 일시를 정해 이 일정을 새 초안으로 복사한다(서버: /api/admin/events/[id]/duplicate).
// 복제하면 새 일정 관리 화면으로 간다. variant: list(일정 목록 줄의 작은 버튼) | page(일정 관리 화면 아래쪽 버튼)
export function EventDuplicate({ ev, variant = "list" }: { ev: { id: string; name: string; startsAt?: string; club?: string }; variant?: "list" | "page" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function start() {
    setName(`${ev.name} (복사)`.slice(0, 80));
    setStartsAt(ev.startsAt ?? "");
    setErr("");
    setOpen(true);
  }
  async function run() {
    setBusy(true);
    setErr("");
    const r = await api<{ event: { id: string; club: string } }>(`/api/admin/events/${encodeURIComponent(ev.id)}/duplicate`, { body: { name, startsAt } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setOpen(false);
    const c = r.data.event.club;
    router.push(`/admin/events/${r.data.event.id}${c ? `?club=${encodeURIComponent(c)}` : ""}`);
  }

  return (
    <>
      {variant === "list" ? (
        <button type="button" className="mini" style={{ minHeight: 34, width: 76, fontSize: fs(13), padding: "0 10px", justifyContent: "center" }} aria-haspopup="dialog" onClick={start}>복제</button>
      ) : (
        <button type="button" className="btn white" style={{ width: "auto", minWidth: 160 }} aria-haspopup="dialog" onClick={start}>일정 복제</button>
      )}
      <Popup id="event-duplicate" width={520} title="일정 복제" open={open} onClose={() => setOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {err && <div className="msg bad" role="alert">{err}</div>}
          <div><label className="l" htmlFor="dup-name">새 일정 이름</label><input id="dup-name" className="field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="l" htmlFor="dup-start">시작 일시</label><DateField id="dup-start" mode="datetime" value={startsAt} onChange={setStartsAt} /></div>
          <span className="small">
            일정 정보·회비 설정·세부일정·준비목록·비용 항목·활동을 복사해 <b>초안</b>으로 만들어요. 시작 날짜를 바꾸면 세부일정·활동 시간·회비 마감일도 그만큼 옮겨요.
            참석 신청·입금·사진·조편성·카풀·방배정·회의록은 복사하지 않아요.
          </span>
          <button className="btn" type="button" disabled={busy || !name.trim()} style={{ width: "auto", minWidth: 160, alignSelf: "flex-start" }} onClick={run}>{busy ? "복제하는 중…" : "복제하기"}</button>
        </div>
      </Popup>
    </>
  );
}
