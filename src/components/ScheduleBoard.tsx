"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, fmtDateDow } from "@/lib/client";
import { readDayPlaces, type DayPlaces } from "@/lib/day-places";
import { Popup } from "./Popup";
import { fs } from "@/lib/fs";

// 세부일정 한 줄: 시간(at), 내용(title, 여러 줄 가능), 위치(place), 메모(memo)
export type SchedItem = { at: string; title: string; place?: string; memo?: string };
type Item = SchedItem & { id: string; place: string; memo: string };
type Note = { tone: "bad" | "info"; text: string } | null;
type Draft = { time: string; title: string; place: string; memo: string };
type Field = "place" | "memo";
// 위치·메모 팝업: 일정 한 줄의 위치/메모, 또는 그날의 기본 위치
type Edit = { kind: "item"; id: string; field: Field; value: string } | { kind: "day"; day: string; value: string };

const dayOf = (at: string) => (/^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : "");
const timeOf = (at: string) => (/T\d{2}:\d{2}/.test(at) ? at.slice(11, 16) : "");
const FIELD: Record<Field, { label: string; ph: string; max: number }> = {
  place: { label: "위치", ph: "예) 강원도 평창군 ○○리조트 본관 2층 그랜드홀", max: 200 },
  memo: { label: "메모", ph: "예) 편한 복장, 개인 텀블러 지참", max: 1000 },
};
// 위치를 지도에서 찾아보는 링크(네이버 지도 검색)
const mapUrl = (place: string) => `https://map.naver.com/p/search/${encodeURIComponent(place)}`;
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

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
// plain: 회원 화면용(배경 없이 아이콘만, 내용 글 끝에 붙는다)
function IconBtn({ field, on, label, onClick, plain }: { field: Field; on: boolean; label: string; onClick: () => void; plain?: boolean }) {
  return (
    <button type="button" className={`sic${on ? " on" : ""}${plain ? " plain" : ""}`} aria-haspopup="dialog" aria-label={label} title={label} onClick={onClick}>
      {field === "place" ? <PinIcon /> : <MemoIcon />}
    </button>
  );
}

// 날짜 제목 옆 "기본 위치" 칩: 그날 일정 대부분이 열리는 곳. 일정마다 위치를 따로 적으면 그 일정은 따로 적은 곳.
function DayPlaceChip({ place, onClick, edit }: { place: string; onClick: () => void; edit?: boolean }) {
  return (
    <button type="button" className={`dplace${place ? " on" : ""}`} aria-haspopup="dialog" onClick={onClick}
      aria-label={place ? `이날 기본 위치: ${place}${edit ? " (고치기)" : ""}` : "이날 기본 위치 적기"}>
      <PinIcon />
      <span>{place || "기본 위치 적기"}</span>
    </button>
  );
}

// 내용 칸: 글이 길면 아래로 늘어난다(줄바꿈 가능)
function GrowText({ value, onChange, onBlur, disabled, label, id }: { value: string; onChange: (v: string) => void; onBlur?: () => void; disabled?: boolean; label?: string; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea ref={ref} id={id} className="field grow-text" rows={1} maxLength={300} aria-label={label} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
  );
}

// 회원 화면용 읽기 전용 일정(날짜 제목 아래 시간순).
//  날짜 제목 옆: 그날 기본 위치(누르면 팝업). 일정마다 따로 적은 위치·메모가 있으면 오른쪽 끝 아이콘 → 팝업.
export function ScheduleView({ items, dayPlaces = {} }: { items: SchedItem[]; dayPlaces?: DayPlaces }) {
  const [show, setShow] = useState<{ field: Field; head: string; text: string } | null>(null);
  const when = (s: SchedItem) => (s.at ? `${fmtDateDow(dayOf(s.at))} ${timeOf(s.at)}` : "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
      {groupByDay(items).map(([day, list]) => (
        <div key={day || "none"}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: fs(15) }}>{day ? fmtDateDow(day) : "날짜 미정"}</b>
            {day && dayPlaces[day] && <DayPlaceChip place={dayPlaces[day]} onClick={() => setShow({ field: "place", head: `${fmtDateDow(day)} 기본 위치`, text: dayPlaces[day] })} />}
          </div>
          <ol className="tl" style={{ marginTop: 4 }}>
            {list.map((s, i) => (
              <li key={i} className="tlrow">
                <span className="tlb">
                  <b className="num">{timeOf(s.at) || "시간 미정"}</b>
                  <span style={{ whiteSpace: "pre-wrap" }}>
                    {s.title || "(내용 없음)"}
                    {/* 위치·메모 아이콘: 배경 없이 내용 글 맨 끝에 붙인다 */}
                    {s.place && <IconBtn plain field="place" on label={`${timeOf(s.at)} 위치 보기`} onClick={() => setShow({ field: "place", head: `${when(s)} · ${s.title}`, text: s.place! })} />}
                    {s.memo && <IconBtn plain field="memo" on label={`${timeOf(s.at)} 메모 보기`} onClick={() => setShow({ field: "memo", head: `${when(s)} · ${s.title}`, text: s.memo! })} />}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <Popup id="sched-view" width={420} title={show ? FIELD[show.field].label : ""} open={!!show} onClose={() => setShow(null)}>
        {show && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="small" style={{ whiteSpace: "pre-wrap" }}>{show.head}</span>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: fs(16), lineHeight: 1.6 }}>{show.text}</p>
            {show.field === "place" && (
              <a className="btn white" href={mapUrl(show.text)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>지도에서 보기</a>
            )}
          </div>
        )}
      </Popup>
    </div>
  );
}

// 관리자 세부일정 탭: 날짜별로 묶어 보여 주고 고친다. 추가할 때는 날짜를 먼저 고르고 시간과 내용(+ 위치·메모)을 넣는다.
//  - 시간·내용은 고친 줄에서 다른 곳으로 옮기면 자동 저장된다(저장 버튼 없음).
//  - 일정마다 오른쪽 끝 위치·메모 아이콘 → 팝업에서 적고 저장.
//  - 날짜마다 "기본 위치": 그날 일정 대부분이 열리는 곳. 위치를 따로 적은 일정만 그곳으로 보인다.
export function ScheduleBoard({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/items/schedule`;
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [days, setDays] = useState<string[]>([]);
  const [dayPlaces, setDayPlaces] = useState<DayPlaces>({});
  const [addDay, setAddDay] = useState("");
  const [add, setAdd] = useState<Draft>({ time: "", title: "", place: "", memo: "" });
  const [note, setNote] = useState<Note>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(""); // 자동 저장 중인 줄

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      api<{ items: Item[] }>(base),
      api<{ event: { startsAt: string; endsAt: string; dayPlaces?: string } }>(`/api/admin/events/${eventId}`),
    ]);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    const list = r.data.items.map((i) => ({ id: i.id, at: String(i.at ?? ""), title: String(i.title ?? ""), place: String(i.place ?? ""), memo: String(i.memo ?? "") }));
    setItems(list);
    setDraft(Object.fromEntries(list.map((i) => [i.id, { time: timeOf(i.at), title: i.title, place: i.place, memo: i.memo }])));
    if (e.ok) {
      const d = eventDays(e.data.event.startsAt, e.data.event.endsAt);
      setDays(d);
      setDayPlaces(readDayPlaces(e.data.event.dayPlaces));
      setAddDay((cur) => cur || d[0] || "");
    }
  }, [base, eventId]);
  useEffect(() => {
    load();
  }, [load]);

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

  // 한 줄 저장: 시간·내용·위치·메모를 함께 보낸다(over: 팝업에서 바꾼 칸). 저장한 줄만 화면 값을 바꾼다(다른 줄에서 고치던 글은 그대로).
  async function save(i: Item, over?: Partial<Draft>): Promise<boolean> {
    const d = { ...(draft[i.id] ?? { time: timeOf(i.at), title: i.title, place: i.place, memo: i.memo }), ...over };
    if (!validTime(d.time)) {
      setNote({ tone: "bad", text: `${d.time || "(빈 칸)"} — 시간을 14:30 처럼 넣어 주세요. 고치기 전까지 저장되지 않아요.` });
      return false;
    }
    if (!d.title.trim()) {
      setNote({ tone: "bad", text: "내용이 비어 있어 저장하지 않았어요. 내용을 적거나 줄을 삭제해 주세요." });
      return false;
    }
    const day = dayOf(i.at) || addDay;
    const at = `${day}T${d.time}`;
    const body = { at, title: d.title.trim(), place: d.place.trim(), memo: d.memo.trim() };
    setSaving(i.id);
    const r = await api(`${base}/${i.id}`, { method: "PATCH", body });
    setSaving("");
    if (!r.ok) {
      setNote({ tone: "bad", text: r.error });
      return false;
    }
    setNote({ tone: "info", text: "저장했어요." });
    setItems((cur) => cur?.map((x) => (x.id === i.id ? { ...x, ...body } : x)) ?? cur);
    setDraft((cur) => ({ ...cur, [i.id]: { time: d.time, title: body.title, place: body.place, memo: body.memo } }));
    return true;
  }
  // 줄에서 벗어날 때 자동 저장(바뀐 것이 있을 때만)
  function autoSave(i: Item) {
    const d = draft[i.id];
    if (!d || (d.time === timeOf(i.at) && d.title === i.title)) return;
    save(i);
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    if (edit.kind === "day") {
      const r = await api<{ dayPlaces: DayPlaces }>(`/api/admin/events/${eventId}/day-place`, { method: "PUT", body: { day: edit.day, place: edit.value.trim() } });
      setBusy(false);
      if (!r.ok) return setNote({ tone: "bad", text: r.error });
      setDayPlaces(r.data.dayPlaces);
      setNote({ tone: "info", text: "기본 위치를 저장했어요." });
      setEdit(null);
      return;
    }
    const i = items?.find((x) => x.id === edit.id);
    if (!i) return setBusy(false);
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
  const editing = edit?.kind === "item" ? items.find((x) => x.id === edit.id) : undefined;
  const editOrig = !edit ? "" : edit.kind === "day" ? dayPlaces[edit.day] ?? "" : editing?.[edit.field] ?? "";
  const editLabel = !edit ? "" : edit.kind === "day" ? "기본 위치" : FIELD[edit.field].label;
  const editField: Field = edit?.kind === "item" ? edit.field : "place";

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <span className="small">
        날짜별로 시간 순서대로 보여요. 시간·내용은 고치고 다른 곳을 누르면 자동 저장돼요. 날짜 옆 “기본 위치”는 그날 일정의 장소이고, 장소가 다른 일정만 오른쪽 위치 아이콘에 따로 적어 주세요. 회원 일정 화면에도 같은 아이콘으로 보여요(누르면 팝업).
      </span>
      {groups.length === 0 && <div className="msg info">아직 일정이 없어요. 일정 일시를 먼저 정하고 “+ 일정 추가”로 넣어 주세요.</div>}

      {groups.map(([day, list]) => (
        <section key={day || "none"} className="card" aria-label={day ? fmtDateDow(day) : "날짜 미정"} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <b style={{ font: `700 ${fs(17)} var(--display)` }}>{day ? fmtDateDow(day) : "날짜 미정"}</b>
            {day && (canEdit || dayPlaces[day]) && (
              <DayPlaceChip place={dayPlaces[day] ?? ""} edit={canEdit} onClick={() => canEdit && setEdit({ kind: "day", day, value: dayPlaces[day] ?? "" })} />
            )}
          </div>
          {list.length === 0 && <span className="small">이 날의 일정이 아직 없어요.</span>}
          {list.map((i) => {
            const d = draft[i.id] ?? { time: timeOf(i.at), title: i.title, place: i.place, memo: i.memo };
            const dp = dayPlaces[dayOf(i.at)] ?? "";
            return (
              <div key={i.id} className="schedrow">
                <input className="field num" aria-label="시간" placeholder="14:30" inputMode="numeric" maxLength={5} style={{ width: 76, minHeight: 44, flex: "none" }}
                  value={d.time} disabled={!canEdit} onBlur={() => autoSave(i)}
                  onChange={(e) => setDraft({ ...draft, [i.id]: { ...d, time: e.target.value.replace(/[^\d:]/g, "") } })} />
                <GrowText label="내용" value={d.title} disabled={!canEdit} onBlur={() => autoSave(i)} onChange={(v) => setDraft({ ...draft, [i.id]: { ...d, title: v } })} />
                <span className="sics">
                  <IconBtn field="place" on={!!i.place}
                    label={i.place ? `위치: ${i.place}` : dp ? `위치: 기본 위치(${dp}) · 다른 곳이면 적기` : "위치 적기"}
                    onClick={() => canEdit && setEdit({ kind: "item", id: i.id, field: "place", value: i.place })} />
                  <IconBtn field="memo" on={!!i.memo} label={i.memo ? "메모 보기·고치기" : "메모 적기"}
                    onClick={() => canEdit && setEdit({ kind: "item", id: i.id, field: "memo", value: i.memo })} />
                </span>
                {canEdit && (
                  <span className="row schedacts" style={{ gap: 6 }}>
                    {saving === i.id && <span className="small">저장 중…</span>}
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
            <input id="s-place" className="field" maxLength={200} placeholder={dayPlaces[addDay] ? `비워 두면 이날 기본 위치(${dayPlaces[addDay]})` : FIELD.place.ph} value={add.place} onChange={(e) => setAdd({ ...add, place: e.target.value })} />
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

      <Popup id="schedule-field" width={440}
        title={!edit ? "" : edit.kind === "day" ? `${fmtDateDow(edit.day)} 기본 위치` : `${editLabel}${editing ? ` · ${timeOf(editing.at)}` : ""}`}
        open={!!edit} onClose={() => setEdit(null)} dirty={!!edit && edit.value !== editOrig}
        footer={edit && (
          <div className="row" style={{ gap: 8, width: "100%" }}>
            <button className="btn" type="button" style={{ flex: 1 }} disabled={busy || edit.value === editOrig} onClick={saveEdit}>{busy ? "저장 중…" : "저장"}</button>
            {editOrig && <button className="btn white" type="button" style={{ flex: 1 }} disabled={busy} onClick={() => setEdit({ ...edit, value: "" })}>지우기</button>}
          </div>
        )}>
        {edit && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {editing && <span className="small" style={{ whiteSpace: "pre-wrap" }}>{editing.title}</span>}
            {edit.kind === "day" && <span className="small">그날 일정 대부분이 열리는 곳을 적어 주세요. 장소가 다른 일정만 일정 줄의 위치 아이콘에 따로 적으면 돼요.</span>}
            {edit.kind === "item" && edit.field === "place" && editing && dayPlaces[dayOf(editing.at)] && !edit.value && (
              <span className="small">비워 두면 이날 기본 위치(<b>{dayPlaces[dayOf(editing.at)]}</b>)로 보여요.</span>
            )}
            <label className="l" htmlFor="sf-v" style={{ margin: 0 }}>{editLabel}</label>
            {editField === "place" ? (
              <input id="sf-v" className="field" maxLength={FIELD.place.max} placeholder={FIELD.place.ph} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
            ) : (
              <textarea id="sf-v" className="field" rows={5} maxLength={FIELD.memo.max} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }} placeholder={FIELD.memo.ph} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
            )}
            {editField === "place" && edit.value.trim() && <a className="small" href={mapUrl(edit.value.trim())} target="_blank" rel="noopener noreferrer">지도에서 확인하기 ›</a>}
            <span className="hint" style={{ fontSize: fs(12) }}>
              {edit.kind === "day" ? "저장하면 회원 일정 화면의 날짜 옆에 보여요." : `저장하면 회원 일정 화면에 ${editLabel} 아이콘으로 보여요. 비우고 저장하면 아이콘이 사라져요.`}
            </span>
          </div>
        )}
      </Popup>
    </>
  );
}
