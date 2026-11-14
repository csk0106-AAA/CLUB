"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateDow } from "@/lib/client";
import { Popup } from "./Popup";
import { fs } from "@/lib/fs";

type Item = { id: string; at: string; title: string };
type Note = { tone: "bad" | "info"; text: string } | null;

const dayOf = (at: string) => (/^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : "");
const timeOf = (at: string) => (/T\d{2}:\d{2}/.test(at) ? at.slice(11, 16) : "");

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

// 회원 화면용 읽기 전용 일정(날짜 제목 아래 시간순)
export function ScheduleView({ items }: { items: { at: string; title: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
      {groupByDay(items).map(([day, list]) => (
        <div key={day || "none"}>
          <b style={{ display: "block", fontSize: fs(15) }}>{day ? fmtDateDow(day) : "날짜 미정"}</b>
          <ol className="tl" style={{ marginTop: 4 }}>
            {list.map((s, i) => (
              <li key={i}><b className="num">{timeOf(s.at) || "시간 미정"}</b><span>{s.title || "(내용 없음)"}</span></li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

// 관리자 일정 탭: 날짜별로 묶어 보여 주고 고친다. 추가할 때는 날짜를 먼저 고르고 시간과 내용을 넣는다.
export function ScheduleBoard({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/items/schedule`;
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { time: string; title: string }>>({});
  const [days, setDays] = useState<string[]>([]);
  const [addDay, setAddDay] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [note, setNote] = useState<Note>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      api<{ items: Item[] }>(base),
      api<{ event: { startsAt: string; endsAt: string } }>(`/api/admin/events/${eventId}`),
    ]);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setItems(r.data.items.map((i) => ({ id: i.id, at: String(i.at ?? ""), title: String(i.title ?? "") })));
    setDraft(Object.fromEntries(r.data.items.map((i) => [i.id, { time: timeOf(String(i.at ?? "")), title: String(i.title ?? "") }])));
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
    if (!validTime(addTime)) return setErr("시간을 14:30 처럼 넣어 주세요.");
    setErr("");
    const r = await api(base, { body: { at: `${addDay}T${addTime}`, title: addTitle.trim() } });
    if (!r.ok) return setErr(r.error);
    setNote({ tone: "info", text: "일정을 추가했어요." });
    setAddTime("");
    setAddTitle("");
    setOpen(false);
    load();
  }
  async function save(i: Item) {
    const d = draft[i.id];
    if (!validTime(d.time)) return setNote({ tone: "bad", text: "시간을 14:30 처럼 넣어 주세요." });
    const day = dayOf(i.at) || addDay;
    const r = await api(`${base}/${i.id}`, { method: "PATCH", body: { at: `${day}T${d.time}`, title: d.title.trim() } });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(i: Item) {
    if (!window.confirm("이 일정을 지울까요?")) return;
    const r = await api(`${base}/${i.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!items) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const groups = groupByDay(items, days);

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <span className="small">날짜별로 시간 순서대로 보여요. 여기에 적은 일정은 회원의 일정 화면에도 같은 모양으로 보여요.</span>
      {groups.length === 0 && <div className="msg info">아직 일정이 없어요. 일정 일시를 먼저 정하고 “+ 일정 추가”로 넣어 주세요.</div>}

      {groups.map(([day, list]) => (
        <section key={day || "none"} className="card" aria-label={day ? fmtDateDow(day) : "날짜 미정"} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>{day ? fmtDateDow(day) : "날짜 미정"}</b>
          {list.length === 0 && <span className="small">이 날의 일정이 아직 없어요.</span>}
          {list.map((i) => {
            const d = draft[i.id] ?? { time: timeOf(i.at), title: i.title };
            return (
              <div key={i.id} className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <input className="field num" aria-label="시간" placeholder="14:30" inputMode="numeric" maxLength={5} style={{ width: 96, minHeight: 44 }}
                  value={d.time} disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, [i.id]: { ...d, time: e.target.value.replace(/[^\d:]/g, "") } })} />
                <input className="field" aria-label="내용" style={{ flex: "1 1 200px", minHeight: 44 }} value={d.title} disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, [i.id]: { ...d, title: e.target.value } })} />
                {canEdit && (
                  <span className="row" style={{ gap: 6 }}>
                    <button className="mini" type="button" onClick={() => save(i)}>저장</button>
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
        <Popup id="schedule-new" title="일정 추가" open={open} onClose={() => setOpen(false)} dirty={!!(addTime || addTitle.trim())}>
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
          <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div>
              <label className="l" htmlFor="s-time">② 시간</label>
              <input id="s-time" className="field num" placeholder="14:30" inputMode="numeric" maxLength={5} style={{ width: 110 }} value={addTime}
                onChange={(e) => setAddTime(e.target.value.replace(/[^\d:]/g, ""))} />
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label className="l" htmlFor="s-title">③ 내용</label>
              <input id="s-title" className="field" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={!addDay || !addTime || !addTitle.trim()} style={{ width: "auto", minWidth: 100, minHeight: 46, fontSize: fs(15) }}>추가</button>
          </div>
        </form>
        </Popup>
        </>
      )}
    </>
  );
}
