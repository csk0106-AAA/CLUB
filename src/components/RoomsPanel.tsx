"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

type Room = { id: string; date: string; name: string; capacity: number; memo: string; guests: string[] };
type Mem = { id: string; name: string; gender?: string };
type Data = {
  published: boolean; same?: boolean; nights: string[]; dates: string[]; members: Mem[]; attendingIds: string[]; stayers?: Record<string, string[]>;
  rooms: Room[]; free: Record<string, string[]>;
};
type Col = { key: string; name: string; capacity: number; memo: string; ids: string[] };
type Mode = "manual" | "gender" | "random";

export const dayLabel = (d: string) => fmtDate(d); // "2026/12/11"

const MODE_TEXT: Record<Mode, { label: string; hint: string }> = {
  manual: { label: "관리자 배정", hint: "빈 방만 만들어요. 이름을 끌어서 직접 넣어 주세요." },
  gender: { label: "성별 나눠 배정", hint: "같은 성별끼리 무작위로 방을 나눠요. 회원 명단의 성별을 사용해요." },
  random: { label: "랜덤 배정", hint: "무작위로 나눠요." },
};

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
// n명을 방 k개에 고르게 나눈다
function split<T>(list: T[], k: number): T[][] {
  const out: T[][] = Array.from({ length: Math.max(1, k) }, () => []);
  list.forEach((m, i) => out[i % out.length].push(m));
  return out;
}

// 숙박 방배정: 조편성처럼 방을 만들고(관리자 배정 / 성별 나눠 / 랜덤) → 이름을 끌어서 옮기고 → 확인으로 회원에게 배포한다.
// 날짜별로 따로 배정하거나, "모든 밤 같은 배정"이면 첫날 밤 구성을 나머지 밤에 그대로 쓴다.
export function RoomsPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/rooms`;
  const [d, setD] = useState<Data | null>(null);
  const [day, setDay] = useState("");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  const [dirty, setDirty] = useState(false);
  const [over, setOver] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("manual");
  const [by, setBy] = useState<"size" | "count">("size");
  const [size, setSize] = useState("4");
  const [count, setCount] = useState("3");
  const [copyTo, setCopyTo] = useState("");
  const [memoKey, setMemoKey] = useState(""); // 메모를 고치는 중인 방

  const load = useCallback(async (want?: string) => {
    const r = await api<Data>(base);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    const x = r.data;
    // 모든 밤 같은 배정이면 첫날 밤만 고친다
    const pick = (cur: string) => (x.same && x.nights.length ? x.nights[0] : cur && x.dates.includes(cur) ? cur : x.dates[0] ?? "");
    setD(x);
    setDay((cur) => {
      const dd = pick(want ?? cur);
      setCols(x.rooms.filter((c) => c.date === dd).map((c) => ({ key: c.id, name: c.name, capacity: c.capacity, memo: c.memo, ids: c.guests })));
      return dd;
    });
    setDirty(false);
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const editable = canEdit;
  if (!d) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const people = new Map(d.members.map((m) => [m.id, m]));
  // 이 날 밤 숙박하는 참석자(같은 배정이면 어느 밤이든 숙박하는 사람 모두)
  const stay = d.same ? [...new Set(d.nights.flatMap((n) => d.stayers?.[n] ?? []))] : d.stayers?.[day] ?? d.attendingIds;
  const placed = new Set(cols.flatMap((c) => c.ids));
  const pool = stay.filter((id) => !placed.has(id));
  const otherDates = d.nights.filter((x) => x !== day && !d.rooms.some((r) => r.date === x));

  const leave = () => !dirty || window.confirm("저장하지 않은 변경이 있어요. 버리고 넘어갈까요?");
  function goDay(x: string) {
    if (x === day || !leave()) return;
    setMsg(null);
    load(x);
  }
  // 이름을 다른 방(또는 "pool" = 방 없음)으로 옮긴다. 드래그와 선택 상자가 같은 함수를 쓴다.
  function move(id: string, to: string) {
    const t = cols.find((c) => c.key === to);
    if (t && !t.ids.includes(id) && t.ids.length >= t.capacity) {
      return setMsg({ tone: "bad", text: `${t.name}은(는) 정원 ${t.capacity}명이 다 찼어요. 다른 사람을 빼거나 정원을 늘린 뒤 넣어 주세요.` });
    }
    setCols((cs) => cs.map((c) => ({ ...c, ids: c.ids.filter((x) => x !== id) })).map((c) => (c.key === to ? { ...c, ids: [...c.ids, id] } : c)));
    setDirty(true);
  }
  const edit = (key: string, patch: Partial<Col>) => {
    setCols((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    setDirty(true);
  };
  const nextName = (list: Col[]) => {
    let n = list.length + 1;
    while (list.some((c) => c.name === `객실 ${n}`)) n++;
    return `객실 ${n}`;
  };
  function addRoom() {
    setCols([...cols, { key: `new-${Date.now()}`, name: nextName(cols), capacity: Number(size) || 4, memo: "", ids: [] }]);
    setDirty(true);
  }
  function removeRoom(key: string) {
    setCols(cols.filter((c) => c.key !== key));
    setDirty(true);
  }

  // 방 만들기: 이 날 밤 숙박하는 사람으로 방을 새로 짠다(초안 — 확인을 눌러야 배포)
  function generate() {
    if (cols.some((c) => c.ids.length) && !window.confirm("지금 방 배정을 지우고 새로 만들까요?")) return;
    const n = stay.length;
    const cap = by === "size" ? Math.max(1, Number(size) || 4) : Math.max(1, Math.ceil(n / Math.max(1, Number(count) || 1)));
    const rooms = by === "count" ? Math.max(1, Number(count) || 1) : Math.max(1, Math.ceil(n / cap));
    let made: { ids: string[]; memo: string }[];
    if (mode === "manual") made = Array.from({ length: rooms }, () => ({ ids: [], memo: "" }));
    else if (mode === "random") made = split(shuffle(stay), rooms).map((ids) => ({ ids, memo: "" }));
    else {
      const groups = new Map<string, string[]>();
      for (const id of shuffle(stay)) {
        const g = people.get(id)?.gender?.trim() || "성별 미입력";
        groups.set(g, [...(groups.get(g) ?? []), id]);
      }
      made = [...groups.entries()].flatMap(([g, ids]) => split(ids, Math.ceil(ids.length / cap)).map((x) => ({ ids: x, memo: g })));
    }
    const next: Col[] = made.map((m, i) => ({ key: `new-${Date.now()}-${i}`, name: `객실 ${i + 1}`, capacity: Math.max(cap, m.ids.length), memo: m.memo, ids: m.ids }));
    setCols(next);
    setDirty(true);
    setMsg({ tone: "info", text: mode === "manual" ? `빈 방 ${next.length}개를 만들었어요. 이름을 끌어서 넣어 주세요.` : `방 ${next.length}개로 나눴어요. 끌어서 바꿀 수 있고, 마지막에 확인을 눌러야 배포돼요.` });
  }

  async function saveDraft(): Promise<boolean> {
    const r = await api(base, { method: "PUT", body: { date: day, rooms: cols.map((c, i) => ({ name: c.name.trim() || `객실 ${i + 1}`, capacity: c.capacity, memo: c.memo, guests: c.ids })) } });
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    return r.ok;
  }
  async function onSaveDraft() {
    setBusy(true);
    if (await saveDraft()) setMsg({ tone: "info", text: "초안을 저장했어요. 아직 회원에게는 보이지 않아요." });
    setBusy(false);
    load();
  }
  // 최종 확인: 화면의 구성을 저장하고 회원에게 배포한다.
  async function onConfirm() {
    setBusy(true);
    setMsg(null);
    if (dirty && !(await saveDraft())) return setBusy(false);
    const r = await api(`${base}/publish`, { body: { action: "publish" } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "방배정을 회원에게 배포했어요. 이제 회원 화면에 보여요." } : { tone: "bad", text: r.error });
    load();
  }
  async function onUnpublish() {
    setBusy(true);
    const r = await api(`${base}/publish`, { body: { action: "unpublish" } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "배포를 취소했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function copyDay() {
    const r = await api<{ copied?: number }>(`${base}/publish`, { body: { action: "copy", from: day, to: copyTo } });
    setMsg(r.ok ? { tone: "info", text: `${r.data.copied ?? 0}개 방을 ${dayLabel(copyTo)}로 복사했어요. 확인을 눌러야 배포돼요.` } : { tone: "bad", text: r.error });
    setCopyTo("");
    load();
  }
  // 배정 방식 바꾸기: 날짜별 / 모든 밤 같은 배정
  async function setSame(same: boolean) {
    if (same === !!d?.same || !d) return;
    if (!leave()) return;
    const later = d.rooms.some((r) => r.date !== d.nights[0]);
    if (same && later && !window.confirm(`둘째 날 밤부터의 배정을 ${dayLabel(d.nights[0])} 밤 배정과 똑같이 바꿀까요?\n따로 해 둔 배정은 첫날 기준으로 덮어써요.`)) return;
    const r = await api(`${base}/publish`, { body: { action: "mode", same } });
    setMsg(r.ok ? { tone: "info", text: same ? "모든 밤 같은 배정으로 바꿨어요. 첫날 밤만 짜면 나머지 밤도 같아요." : "날짜별 배정으로 바꿨어요. 이제 밤마다 따로 고칠 수 있어요." } : { tone: "bad", text: r.error });
    load();
  }

  const targets = [...cols.map((c) => ({ key: c.key, label: c.name })), { key: "pool", label: "방 없음" }];
  // 컴포넌트가 아니라 함수로 그린다(드래그 중 다시 그려져도 끌던 요소가 사라지지 않게)
  const person = (id: string, where: string) => {
    const m = people.get(id);
    const name = m?.name ?? "(삭제된 회원)";
    return (
      <div key={id} draggable={editable} onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; }}
        className="row" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px", background: "var(--card)", cursor: editable ? "grab" : "default", gap: 6 }}>
        <span className="grow" style={{ fontWeight: 700 }}>{name}{m?.gender ? <span className="small"> · {m.gender}</span> : null}{!stay.includes(id) && <span className="small"> · 숙박 안 함</span>}</span>
        {editable && (
          <select aria-label={`${name} 옮기기`} className="field" style={{ width: 96, minHeight: 36, fontSize: fs(14), padding: "0 6px" }} value={where} onChange={(e) => move(id, e.target.value)}>
            {targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        )}
      </div>
    );
  };
  const dropZone = (k: string) => ({
    onDragOver: (e: React.DragEvent) => { if (editable) { e.preventDefault(); setOver(k); } },
    onDragLeave: () => setOver(""),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain"); if (editable && id) move(id, k); },
  });
  const zoneStyle = (k: string, bad?: boolean): React.CSSProperties => ({
    display: "flex", flexDirection: "column", gap: 6, minHeight: 90,
    borderColor: over === k ? "var(--blue)" : bad ? "var(--red)" : undefined, background: over === k ? "var(--blue-bg)" : undefined,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b style={{ font: `700 ${fs(16)} var(--display)` }}>방 구성 ({day ? `${dayLabel(day)} 밤 숙박 ${stay.length}명` : "날짜 없음"})</b>
        <span className={`pill ${d.published ? "ok" : "warn"}`}>{d.published ? "회원에게 배포됨" : "배포 전 (회원에게 안 보여요)"}</span>
      </div>

      {/* 배정 방식: 날짜별 / 모든 밤 같은 배정(1박이면 고를 필요 없음) */}
      {editable && d.nights.length > 1 && (
        <div className="seg" role="group" aria-label="배정 방식" style={{ alignSelf: "flex-start" }}>
          <button type="button" aria-pressed={!d.same} onClick={() => setSame(false)} style={{ minHeight: 40, padding: "0 14px" }}>날짜별로 배정</button>
          <button type="button" aria-pressed={!!d.same} onClick={() => setSame(true)} style={{ minHeight: 40, padding: "0 14px" }}>모든 밤 같은 배정</button>
        </div>
      )}
      {d.same && d.nights.length > 1 ? (
        <span className="small">모든 밤({dayLabel(d.nights[0])} ~ {dayLabel(d.nights[d.nights.length - 1])}) 같은 배정이에요. 아래에서 한 번만 짜면 {d.nights.length}일 밤 모두 같아요.</span>
      ) : d.dates.length > 1 && (
        <div className="subnav" role="tablist" aria-label="숙박 날짜">
          {d.dates.map((x) => <a key={x} href="#" role="tab" aria-selected={day === x} className={day === x ? "on" : ""} onClick={(e) => { e.preventDefault(); goDay(x); }}>{dayLabel(x)} 밤</a>)}
        </div>
      )}
      {d.dates.length === 0 && <div className="msg info">일정 개요에 시작·종료 일시를 먼저 입력하면 숙박 날짜가 나와요.</div>}

      {editable && day && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
          <div className="pick" role="radiogroup" aria-label="방 배정 방식" style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {(Object.keys(MODE_TEXT) as Mode[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} aria-pressed={mode === k} className="opt" style={{ width: "auto", flex: "1 1 160px", minHeight: 46 }} onClick={() => setMode(k)}>
                <span className="name">{mode === k ? "✓ " : ""}{MODE_TEXT[k].label}</span>
              </button>
            ))}
          </div>
          <span className="small">{MODE_TEXT[mode].hint}</span>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <select className="field" aria-label="기준" style={{ width: 140 }} value={by} onChange={(e) => setBy(e.target.value as "size" | "count")}>
              <option value="size">방당 인원</option><option value="count">방 수</option>
            </select>
            {by === "size"
              ? <input className="field" aria-label="방당 인원" type="number" min={1} max={20} style={{ width: 100 }} value={size} onChange={(e) => setSize(e.target.value)} />
              : <input className="field" aria-label="방 수" type="number" min={1} max={60} style={{ width: 100 }} value={count} onChange={(e) => setCount(e.target.value)} />}
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={generate}>{cols.length > 0 ? "다시 만들기" : "방 만들기"}</button>
          </div>
          {!d.same && otherDates.length > 0 && cols.length > 0 && (
            <div className="row" style={{ flexWrap: "wrap", borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <span className="small">또는 이 밤 배정을 다른 밤으로 복사</span>
              <select aria-label="복사받을 날짜" className="field" style={{ width: "auto", minWidth: 140 }} value={copyTo} onChange={(e) => setCopyTo(e.target.value)}>
                <option value="">받을 날짜</option>
                {otherDates.map((x) => <option key={x} value={x}>{dayLabel(x)} 밤</option>)}
              </select>
              <button className="btn white" type="button" disabled={busy || !copyTo || dirty} title={dirty ? "먼저 초안을 저장해 주세요" : undefined} style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={copyDay}>복사하기</button>
            </div>
          )}
        </div>
      )}

      {day && cols.length === 0 && <div className="msg info">아직 방이 없어요. 위에서 방식을 고르고 만들어 주세요.</div>}
      {day && (cols.length > 0 || pool.length > 0) && (
        <>
          {editable && cols.length > 0 && <span className="small">이름을 끌어서 다른 방으로 옮길 수 있어요. 터치 화면에서는 이름 옆 선택 상자로 옮겨 주세요.</span>}
          <div className="cards">
            {cols.map((c) => {
              const full = c.ids.length > c.capacity;
              return (
                <div key={c.key} className="card" {...dropZone(c.key)} style={zoneStyle(c.key, full)}>
                  <div className="row" style={{ gap: 6 }}>
                    {editable ? (
                      <input className="field team-name" aria-label={`${c.name} 이름`} maxLength={30} value={c.name}
                        onChange={(e) => edit(c.key, { name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) edit(c.key, { name: nextName(cols.filter((x) => x.key !== c.key)) }); }} />
                    ) : <b>{c.name}</b>}
                    <span className={`pill ${full ? "bad" : c.ids.length === c.capacity ? "ok" : "blue"}`} style={{ flex: "none" }}>{c.ids.length}/{c.capacity}명</span>
                    <span className="grow" />
                    {editable && c.ids.length === 0 && <button className="mini danger" type="button" onClick={() => removeRoom(c.key)}>방 지우기</button>}
                  </div>
                  {editable && (
                    <div className="row" style={{ gap: 6 }}>
                      <label className="small" htmlFor={`cp-${c.key}`} style={{ flex: "none" }}>정원</label>
                      <input id={`cp-${c.key}`} className="field" type="number" min={1} max={20} style={{ width: 64, minHeight: 36, padding: "0 6px", textAlign: "center" }} value={c.capacity}
                        onChange={(e) => edit(c.key, { capacity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
                      {/* 메모: 평소엔 한 줄(길면 …), 더블클릭하면 전체를 보고 고친다 */}
                      {memoKey === c.key ? (
                        <textarea className="field" aria-label={`${c.name} 메모`} placeholder="메모작성" maxLength={100} rows={3} autoFocus
                          style={{ flex: 1, minWidth: 0, minHeight: 72, resize: "vertical", padding: "6px 8px" }} value={c.memo}
                          onChange={(e) => edit(c.key, { memo: e.target.value.replace(/\n/g, " ") })} onBlur={() => setMemoKey("")}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setMemoKey(""); } }} />
                      ) : (
                        <span className="room-memo" role="button" tabIndex={0} title={c.memo ? `${c.memo}\n(더블클릭해서 고치기)` : "더블클릭해서 메모 쓰기"}
                          onDoubleClick={() => setMemoKey(c.key)} onKeyDown={(e) => { if (e.key === "Enter") setMemoKey(c.key); }}>
                          {c.memo.trim() || <span className="hint">메모작성</span>}
                        </span>
                      )}
                    </div>
                  )}
                  {!editable && c.memo && <span className="small room-memo-ro" title={c.memo}>{c.memo}</span>}
                  {c.ids.map((id) => person(id, c.key))}
                  {c.ids.length === 0 && <span className="hint">{editable ? "여기로 끌어 놓으세요" : "비어 있어요"}</span>}
                  {full && <span className="small" style={{ color: "var(--red)" }}>정원보다 {c.ids.length - c.capacity}명 많아요.</span>}
                </div>
              );
            })}
            <div className="card" {...dropZone("pool")} style={zoneStyle("pool")}>
              <div className="row"><b>방 없음</b><span className="small" style={{ flex: "none" }}>{pool.length}명</span></div>
              {pool.map((id) => person(id, "pool"))}
              {pool.length === 0 && <span className="hint">모두 방이 정해졌어요</span>}
            </div>
          </div>
          {editable && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={addRoom}>+ 방 추가</button>
              <button className="btn white" type="button" disabled={busy || !dirty} style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={onSaveDraft}>초안 저장</button>
              <button className="btn" type="button" disabled={busy || cols.length === 0 || (d.published && !dirty)} style={{ width: "auto", minHeight: 48, fontSize: fs(15), minWidth: 140 }} onClick={onConfirm}>{d.published ? "변경 내용 다시 배포" : "확인 (회원에게 배포)"}</button>
              {d.published && !dirty && <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={onUnpublish}>배포 취소</button>}
            </div>
          )}
          {editable && <span className="small">“확인”을 눌러야 회원 화면에 보여요. 날짜를 바꾸기 전에 초안 저장이나 확인을 눌러 주세요.</span>}
        </>
      )}
    </div>
  );
}
