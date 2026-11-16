"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, fmtDateDow } from "@/lib/client";
import { Popup } from "./Popup";
import { fs } from "@/lib/fs";

// 세부일정 한 줄: 시간(at), 내용(title, 여러 줄 가능), 위치(place), 메모(memo)
export type SchedItem = { at: string; title: string; place?: string; memo?: string };
type Item = SchedItem & { id: string; place: string; memo: string };
type Note = { tone: "bad" | "info"; text: string } | null;
type Draft = { time: string; title: string; place: string; memo: string };
type Field = "place" | "memo";

const dayOf = (at: string) => (/^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : "");
const timeOf = (at: string) => (/T\d{2}:\d{2}/.test(at) ? at.slice(11, 16) : "");
const FIELD: Record<Field, { label: string; ph: string; max: number }> = {
  place: { label: "위치", ph: "예) 강원도 평창군 ○○리조트 본관 2층 그랜드홀", max: 200 },
  memo: { label: "메모", ph: "예) 편한 복장, 개인 텀블러 지참", max: 1000 },
};
// 위치를 지도에서 찾아보는 링크(네이버 지도 검색)
const mapUrl = (place: string) => `https://map.naver.com/p/search/${encodeURIComponent(place)}`;

// 일정 기간의 날짜 목록(최대 7일)
function eventDays(startsAt: string, endsAt: string): string[] {
  const a = startsAt?.slice(0, 10);
  const b = (endsAt || startsAt)?.slice(0, 10);
  const out: string[] = [];
  if (!a || !b) return out;
  for (let t = Date.parse(`${a}T00:00:00Z`); t <= Date.parse(`${b}T00:00:00Z`) && out.length < 7; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// 일정을 날짜별로 묶는다: [날짜, 그 날짜의 일정(시간순)] — 날짜 없는 일정은 마지막 "날짜 미정"
export function groupByDay<T extends { at: string }>(items: T[], days: string[] = []): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const d of days) map.set(d, []);
  for (const i of [...items].sort((x, y) => x.at.localeCompare(y.at))) {
    const d = dayOf(i.at);
    map.set(d, [...(map.get(d) ?? []), i]);
  }
  const keys = [...map.keys()].filter((k) => k).sort();
  return [...keys.map((k) => [k, map.get(k)!] as [string, T[]]), ...(map.get("")?.length ? [["", map.get("")!] as [string, T[]]] : [])];
}

// 위치·메모 아이콘(값이 있으면 진하게, 없으면 흐리게)
function PinIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
}
function MemoIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></svg>;
}
function IconBtn({ field, on, label, onClick }: { field: Field; on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`sic${on ? " on" : ""}`} aria-haspopup="dialog" aria-label={label} title={label} onClick={onClick}>
      {field === "place" ? <PinIcon /> : <MemoIcon />}
    </button>
  );
}

// 내용 칸: 글이 길면 아래로 늘어난다(줄바꿈 가능)
function GrowText({ value, onChange, disabled, label, id }: { value: string; onChange: (v: string) => void; disabled?: boolean; label?: string; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea ref={ref} id={id} className="field grow-text" rows={1} maxLength={300} aria-label={label} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} />
  );
}

// 회원 화면용 읽기 전용 일정(날짜 제목 아래 시간순). 위치·메모가 있으면 오른쪽 끝 아이콘 → 팝업으로 본다.
export function ScheduleView({ items }: { items: SchedItem[] }) {
  const [show, setShow] = useState<{ field: Field; item: SchedItem } | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
      {groupByDay(items).map(([day, list]) => (
        <div key={day || "none"}>
          <b style={{ display: "block", fontSize: fs(15) }}>{day ? fmtDateDow(day) : "날짜 미정"}</b>
          <ol className="tl" style={{ marginTop: 4 }}>
            {list.map((s, i) => (
              <li key={i} className="tlrow">
                <span className="tlb">
                  <b className="num">{timeOf(s.at) || "시간 미정"}</b>
                  <span style={{ whiteSpace: "pre-wrap" }}>{s.title || "(내용 없음)"}</span>
                </span>
                {(s.place || s.memo) && (
                  <span className="sics">
                    {s.place && <IconBtn field="place" on label={`${timeOf(s.at)} 위치 보기`} onClick={() => setShow({ field: "place", item: s })} />}
                    {s.memo && <IconBtn field="memo" on label={`${timeOf(s.at)} 메모 보기`} onClick={() => setShow({ field: "memo", item: s })} />}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <Popup id="sched-view" width={420} title={show ? FIELD[show.field].label : ""} open={!!show} onClose={() => setShow(null)}>
        {show && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="small">{show.item.at ? `${fmtDateDow(dayOf(show.item.at))} ${timeOf(show.item.at)}` : ""} · {show.item.title}</span>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: fs(16), lineHeight: 1.6 }}>{show.field === "place" ? show.item.place : show.item.memo}</p>
            {show.field === "place" && show.item.place && (
              <a className="btn white" href={mapUrl(show.item.place)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>지도에서 보기</a>
            )}
          </div>
        )}
      </Popup>
    </div>
  );
}

// 관리자 세부일정 탭: 날짜별로 묶어 보여 주고 고친다. 추가할 때는 날짜를 먼저 고르고 시간과 내용(+ 위치·메모)을 넣는다.
// 일정마다 오른쪽 끝 위치·메모 아이콘을 누르면 팝업에서 적고 바로 저장한다.
export function ScheduleBoard({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/items/schedule`;
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [days, setDays] = useState<string[]>([]);
  const [addDay, setAddDay] = useState("");
  const [add, setAdd] = useState<Draft>({ time: "", title: "", place: "", memo: "" });
  const [note, setNote] = useState<Note>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  // 위치·메모 팝업: 고치는 일정과 칸
  const [edit, setEdit] = useState<{ id: string; field: Field; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      api<{ items: Item[] }>(base),
      api<{ event: { startsAt: string; endsAt: string } }>(`/api/admin/events/${eventId}`),
    ]);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    const list = r.data.items.map((i) => ({ id: i.id, at: String(i.at ?? ""), title: String(i.title ?? ""), place: String(i.place ?? ""), memo: String(i.memo ?? "") }));
    setItems(list);
    setDraft(Object.fromEntries(list.map((i) => [i.id, { time: timeOf(i.at), title: i.title, place: i.place, memo: i.memo }])));
    if (e.ok) {
      const d = eventDays(e.data.event.startsAt, e.data.event.endsAt);
      setDays(d);
      setAddDay((cur) => cur || d[0] || "");
    }
  }, [base, eventId]);
  useEffect(() => {
    load();
  }, [load]);

  const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!addDay) return setErr("날짜를 먼저 골라 주세요.");
    if (!validTime(add.time)) return setErr("시간을 14:30 처럼 넣어 주세요.");
    setErr("");
    const r = await api(base, { body: { at: `${addDay}T${add.time}`, title: add.title.trim(), place: add.place.trim(), memo: add.memo.trim() } });
    if (!r.ok) return setErr(r.error);
    setNote({ tone: "info", text: "일정을 추가했어요." });
    setAdd({ time: "", title: "", place: "", memo: "" });
    setOpen(false);
    load();
  }
  // 저장: 시간·내용·위치·메모를 함께 보낸다(over: 팝업에서 바꾼 칸)
  async function save(i: Item, over?: Partial<Draft>) {
    const d = { ...(draft[i.id] ?? { time: timeOf(i.at), title: i.title, place: i.place, memo: i.memo }), ...over };
    if (!validTime(d.time)) {
      setNote({ tone: "bad", text: "시간을 14:30 처럼 넣어 주세요." });
      return false;
    }
    if (!d.title.trim()) {
      setNote({ tone: "bad", text: "내용을 적어 주세요." });
      return false;
    }
    const day = dayOf(i.at) || addDay;
    const r = await api(`${base}/${i.id}`, { method: "PATCH", body: { at: `${day}T${d.time}`, title: d.title.trim(), place: d.place.trim(), memo: d.memo.trim() } });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    if (r.ok) load();
    return r.ok;
  }
  async function saveField() {
    if (!edit || !items) return;
    const i = items.find((x) => x.id === edit.id);
    if (!i) return;
    setBusy(true);
    const ok = await save(i, { [edit.field]: edit.value });
    setBusy(false);
    if (ok) setEdit(null);
  }
  async function remove(i: Item) {
    if (!window.confirm("이 일정을 지울까요?")) return;
    const r = await api(`${base}/${i.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!items) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const groups = groupByDay(items, days);
  const editing = edit ? items.find((x) => x.id === edit.id) : undefined;
  const editOrig = editing && edit ? editing[edit.field] : "";

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <span className="small">날짜별로 시간 순서대로 보여요. 오른쪽 위치·메모 아이콘을 누르면 적을 수 있고, 회원 일정 화면에도 같은 아이콘으로 보여요(누르면 팝업).</span>
      {groups.length === 0 && <div className="msg info">아직 일정이 없어요. 일정 일시를 먼저 정하고 “+ 일정 추가”로 넣어 주세요.</div>}

      {groups.map(([day, list]) => (
        <section key={day || "none"} className="card" aria-label={day ? fmtDateDow(day) : "날짜 미정"} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>{day ? fmtDateDow(day) : "날짜 미정"}</b>
          {list.length === 0 && <span className="small">이 날의 일정이 아직 없어요.</span>}
          {list.map((i) => {
            const d = draft[i.id] ?? { time: timeOf(i.at), title: i.title, place: i.place, memo: i.memo };
            const changed = d.time !== timeOf(i.at) || d.title !== i.title;
            return (
              <div key={i.id} className="schedrow">
                <input className="field num" aria-label="시간" placeholder="14:30" inputMode="numeric" maxLength={5} style={{ width: 76, minHeight: 44, flex: "none" }}
                  value={d.time} disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, [i.id]: { ...d, time: e.target.value.replace(/[^\d:]/g, "") } })} />
                <GrowText label="내용" value={d.title} disabled={!canEdit} onChange={(v) => setDraft({ ...draft, [i.id]: { ...d, title: v } })} />
                <span className="sics">
                  <IconBtn field="place" on={!!i.place} label={i.place ? `위치: ${i.place}` : "위치 적기"} onClick={() => canEdit ? setEdit({ id: i.id, field: "place", value: i.place }) : undefined} />
                  <IconBtn field="memo" on={!!i.memo} label={i.memo ? "메모 보기·고치기" : "메모 적기"} onClick={() => canEdit ? setEdit({ id: i.id, field: "memo", value: i.memo }) : undefined} />
                </span>
                {canEdit && (
                  <span className="row schedacts" style={{ gap: 6 }}>
                    <button className="mini" type="button" disabled={!changed} onClick={() => save(i)}>저장</button>
                    <button className="mini danger" type="button" onClick={() => remove(i)}>삭제</button>
                  </span>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {canEdit && (
        <>
        <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={() => { setErr(""); setOpen(true); }}>+ 일정 추가</button>
        <Popup id="schedule-new" title="일정 추가" open={open} onClose={() => setOpen(false)} dirty={!!(add.time || add.title.trim() || add.place.trim() || add.memo.trim())}>
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {err && <div className="msg bad" role="alert">{err}</div>}
          <div>
            <label className="l" htmlFor="s-day">① 날짜</label>
            {days.length > 0 ? (
              <select id="s-day" className="field" style={{ maxWidth: 260 }} value={addDay} onChange={(e) => setAddDay(e.target.value)}>
                {days.map((d) => <option key={d} value={d}>{fmtDateDow(d)}</option>)}
              </select>
            ) : (
              <div className="small">일정 개요에서 시작·끝나는 일시를 먼저 정해 주세요.</div>
            )}
          </div>
          <div>
            <label className="l" htmlFor="s-time">② 시간</label>
            <input id="s-time" className="field num" placeholder="14:30" inputMode="numeric" maxLength={5} style={{ width: 110 }} value={add.time}
              onChange={(e) => setAdd({ ...add, time: e.target.value.replace(/[^\d:]/g, "") })} />
          </div>
          <div>
            <label className="l" htmlFor="s-title">③ 내용</label>
            <GrowText id="s-title" value={add.title} onChange={(v) => setAdd({ ...add, title: v })} />
          </div>
          <div>
            <label className="l" htmlFor="s-place">위치 (선택)</label>
            <input id="s-place" className="field" maxLength={200} placeholder={FIELD.place.ph} value={add.place} onChange={(e) => setAdd({ ...add, place: e.target.value })} />
          </div>
          <div>
            <label className="l" htmlFor="s-memo">메모 (선택)</label>
            <textarea id="s-memo" className="field" rows={2} maxLength={1000} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }} placeholder={FIELD.memo.ph} value={add.memo} onChange={(e) => setAdd({ ...add, memo: e.target.value })} />
          </div>
          <button className="btn" type="submit" disabled={!addDay || !add.time || !add.title.trim()} style={{ width: "auto", minWidth: 120, minHeight: 46, fontSize: fs(15), alignSelf: "flex-start" }}>추가</button>
        </form>
        </Popup>
        </>
      )}

      <Popup id="schedule-field" width={440} title={edit ? `${FIELD[edit.field].label}${editing ? ` · ${timeOf(editing.at)}` : ""}` : ""} open={!!edit} onClose={() => setEdit(null)}
        dirty={!!edit && edit.value !== editOrig}
        footer={edit && (
          <div className="row" style={{ gap: 8, width: "100%" }}>
            <button className="btn" type="button" style={{ flex: 1 }} disabled={busy || edit.value === editOrig} onClick={saveField}>{busy ? "저장 중…" : "저장"}</button>
            {editOrig && <button className="btn white" type="button" style={{ flex: 1 }} disabled={busy} onClick={() => setEdit({ ...edit, value: "" })}>지우기</button>}
          </div>
        )}>
        {edit && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {editing && <span className="small" style={{ whiteSpace: "pre-wrap" }}>{editing.title}</span>}
            <label className="l" htmlFor="sf-v" style={{ margin: 0 }}>{FIELD[edit.field].label}</label>
            {edit.field === "place" ? (
              <input id="sf-v" className="field" maxLength={FIELD.place.max} placeholder={FIELD.place.ph} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
            ) : (
              <textarea id="sf-v" className="field" rows={5} maxLength={FIELD.memo.max} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }} placeholder={FIELD.memo.ph} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
            )}
            {edit.field === "place" && edit.value.trim() && <a className="small" href={mapUrl(edit.value.trim())} target="_blank" rel="noopener noreferrer">지도에서 확인하기 ›</a>}
            <span className="hint" style={{ fontSize: fs(12) }}>저장하면 회원 일정 화면에 {FIELD[edit.field].label} 아이콘으로 보여요. 비우고 저장하면 아이콘이 사라져요.</span>
          </div>
        )}
      </Popup>
    </>
  );
}
