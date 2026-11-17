"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDate, won } from "@/lib/client";
import { DateField } from "./DateField";
import { Popup } from "./Popup";
import { ScheduleBoard } from "./ScheduleBoard";
import { fs } from "@/lib/fs";

type Kind = "schedule" | "prep" | "costs";
type Item = Record<string, string | number | boolean> & { id: string };
type Note = { tone: "bad" | "info"; text: string } | null;

const BLANK: Record<Kind, Record<string, string | number | boolean>> = {
  schedule: { at: "", title: "" },
  prep: { item: "", owner: "", done: false },
  costs: { item: "", budget: 0, spent: 0, status: "예정", owner: "", memo: "" },
};
const STATUS = ["예정", "집행 완료", "보류"];
const TITLE: Record<Kind, string> = { schedule: "일정", prep: "준비 목록", costs: "비용" };

type FileMeta = { id: string; name: string; type: string; size: number; uploadedBy: string; createdAt: string };
const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

// 준비목록 파일: 올리기(여러 개), 목록, 내려받기, 지우기. 한 파일 4MB, 일정 하나에 20개까지.
function PrepFiles({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/files`;
  const [files, setFiles] = useState<FileMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note>(null);
  const ref = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const r = await api<{ files: FileMeta[] }>(base);
    if (r.ok) setFiles(r.data.files);
    else setMsg({ tone: "bad", text: r.error });
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setMsg(null);
    const fails: string[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 4 * 1024 * 1024) { fails.push(`“${f.name}”: 4MB보다 커요.`); continue; }
      const fd = new FormData();
      fd.append("file", f, f.name);
      try {
        const r = await fetch(base, { method: "POST", body: fd });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) fails.push(`“${f.name}”: ${j.error ?? "올리지 못했어요."}`);
      } catch {
        fails.push(`“${f.name}”: 연결이 불안정해요.`);
      }
    }
    setBusy(false);
    setMsg(fails.length ? { tone: "bad", text: fails.join(" ") } : { tone: "info", text: "파일을 올렸어요." });
    load();
  }
  async function remove(f: FileMeta) {
    if (!window.confirm(`“${f.name}” 파일을 지울까요?`)) return;
    const r = await api(`${base}/${f.id}`, { method: "DELETE" });
    setMsg(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  return (
    <section className="card" aria-label="준비목록 파일" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b className="grow" style={{ font: `700 ${fs(16)} var(--display)` }}>파일 {files ? `${files.length}개` : ""}</b>
        {canEdit && (
          <>
            <input ref={ref} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
              accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.zip,.txt,.csv"
              onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <button className="mini" type="button" disabled={busy || (files?.length ?? 0) >= 20} onClick={() => ref.current?.click()}>{busy ? "올리는 중…" : "+ 파일 올리기"}</button>
          </>
        )}
      </div>
      <span className="small">사진·문서(pdf, 오피스, hwp, zip, txt)를 하나에 4MB까지, 일정 하나에 20개까지 올려요. “회원에게 준비 목록 보이기”를 켜면 회원도 내려받을 수 있어요.</span>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {files && files.length === 0 && <span className="small">아직 올린 파일이 없어요.</span>}
      {files && files.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f) => (
            <li key={f.id} className="row" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              <span className="grow" style={{ minWidth: 0 }}>
                <a href={`${base}/${f.id}`} download={f.name} style={{ overflowWrap: "anywhere", fontWeight: 600 }}>📎 {f.name}</a>
                <span className="small" style={{ display: "block" }}>{fmtSize(f.size)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ""}{f.createdAt ? ` · ${fmtDate(f.createdAt)}` : ""}</span>
              </span>
              <a className="mini" href={`${base}/${f.id}`} download={f.name} style={{ textDecoration: "none" }} aria-label={`${f.name} 내려받기`}>내려받기</a>
              {canEdit && <button className="mini danger" type="button" onClick={() => remove(f)} aria-label={`${f.name} 지우기`}>삭제</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// 세부 일정 / 준비 목록 / 비용(예산과 집행). 같은 화면 틀로 세 가지를 다룬다.
// 일정은 회원에게 보이고, 준비 목록과 비용은 관리자만 본다.
export function EventItems(props: { eventId: string; kind: Kind; canEdit: boolean }) {
  // 일정은 날짜별로 묶어 보여 주는 전용 화면을 쓴다.
  if (props.kind === "schedule") return <ScheduleBoard eventId={props.eventId} canEdit={props.canEdit} />;
  return <ItemsTable {...props} />;
}

function ItemsTable({ eventId, kind, canEdit }: { eventId: string; kind: Kind; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/items/${kind}`;
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Item>>({});
  const [add, setAdd] = useState<Record<string, string | number | boolean>>({ ...BLANK[kind] });
  const [note, setNote] = useState<Note>(null);
  const [attend, setAttend] = useState(0);
  const [support, setSupport] = useState(0); // 지원금 합계(회비 탭)
  // 비용 메모 보기·고치기 창(목록에는 메모 아이콘만)
  const [memoOf, setMemoOf] = useState<{ id: string; item: string; text: string } | null>(null);
  const [fee, setFee] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  // 준비목록·비용을 회원의 일정 화면에도 보일지(일정의 showPrep / showCosts)
  const flag = kind === "prep" ? "showPrep" : "showCosts";
  const [shown, setShown] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ items: Item[] }>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setItems(r.data.items);
    setDraft(Object.fromEntries(r.data.items.map((i) => [i.id, { ...i }])));
    if (kind !== "schedule") {
      const ev = await api<{ event: Record<string, unknown> }>(`/api/admin/events/${eventId}`);
      if (ev.ok) setShown(ev.data.event[kind === "prep" ? "showPrep" : "showCosts"] === "true");
    }
    if (kind === "costs") {
      const e = await api<{ event: { fee: string; feeRules?: { days: string; kind: string; position: string; amount: string }[]; supports?: { amount: string }[] }; rows: { answer: string }[] }>(`/api/admin/events/${eventId}`);
      if (e.ok) {
        setAttend(e.data.rows.filter((x) => x.answer === "참석").length);
        setSupport((e.data.event.supports ?? []).reduce((n, x) => n + (Number(x.amount) || 0), 0));
        // 현재 기본 회비 = 모두 "전체"인 회비 줄 금액(예전 fee 값이 남아 있으면 그 값)
        const all = (e.data.event.feeRules ?? []).find((x) => !x.days && !x.kind && !x.position);
        setFee(all?.amount ?? e.data.event.fee);
      }
    }
  }, [base, kind, eventId]);
  useEffect(() => {
    load();
  }, [load]);

  const set = (id: string, k: string, v: string | number | boolean) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));
  const body = (x: Record<string, unknown>) => {
    const { id: _id, ...rest } = x;
    void _id;
    return rest;
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await api(base, { body: add });
    if (!r.ok) return setErr(r.error);
    setNote({ tone: "info", text: "추가했어요." });
    setAdd({ ...BLANK[kind] });
    setOpen(false);
    load();
  }
  async function save(id: string) {
    const r = await api(`${base}/${id}`, { method: "PATCH", body: body(draft[id]) });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function toggle(id: string, done: boolean) {
    const r = await api(`${base}/${id}`, { method: "PATCH", body: { ...body(draft[id]), done } });
    if (!r.ok) setNote({ tone: "bad", text: r.error });
    load();
  }
  async function saveMemo() {
    if (!memoOf) return;
    const r = await api(`${base}/${memoOf.id}`, { method: "PATCH", body: { ...body(draft[memoOf.id]), memo: memoOf.text } });
    setNote(r.ok ? { tone: "info", text: "메모를 저장했어요." } : { tone: "bad", text: r.error });
    if (r.ok) setMemoOf(null);
    load();
  }
  async function setVisible(v: boolean) {
    const prev = shown;
    setShown(v);
    const r = await api(`/api/admin/events/${eventId}`, { method: "PATCH", body: { [flag]: v } });
    if (!r.ok) {
      setShown(prev);
      return setNote({ tone: "bad", text: r.error });
    }
    setNote({ tone: "info", text: v ? `${TITLE[kind]} 회원 공개(읽기만)` : `${TITLE[kind]} 회원 비공개` });
  }
  async function remove(id: string) {
    if (!window.confirm("지울까요?")) return;
    const r = await api(`${base}/${id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  // 제안 금액을 "모두 전체"인 회비 줄(모든 회원의 기본 회비)로 정한다. 다른 조건 줄은 그대로 둔다.
  async function applyFee(v: number) {
    const cur = await api<{ event: { fee: string; feeRules: { days: string; kind: string; position: string; amount: string }[] } }>(`/api/admin/events/${eventId}`);
    if (!cur.ok) return setNote({ tone: "bad", text: cur.error });
    const rules = cur.data.event.feeRules ?? [];
    const isAll = (x: { days: string; kind: string; position: string }) => !x.days && !x.kind && !x.position;
    const next = rules.some(isAll)
      ? rules.map((x) => (isAll(x) ? { ...x, amount: String(v) } : x))
      : [...rules, { days: "", kind: "", position: "", amount: String(v) }];
    const r = await api(`/api/admin/events/${eventId}`, { method: "PATCH", body: { feeRules: next, fee: "" } });
    setNote(r.ok ? { tone: "info", text: `모든 회원의 기본 회비(“전체” 줄)를 ${won(v)}으로 정했어요. 조건별 줄이 있으면 그 금액이 먼저 적용돼요.` } : { tone: "bad", text: r.error });
    load();
  }

  if (!items) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const totalBudget = kind === "costs" ? items.reduce((n, i) => n + Number(i.budget), 0) : 0;
  const totalSpent = kind === "costs" ? items.reduce((n, i) => n + Number(i.spent), 0) : 0;
  // 1인 회비 제안: (예산 합계 - 지원금)을 참석 인원으로 나누고 천 원 단위로 올린다.
  const need = Math.max(0, totalBudget - support);
  const suggest = attend > 0 ? Math.ceil(need / attend / 1000) * 1000 : 0;

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {kind === "schedule" && <span className="small">여기에 적은 일정은 회원의 일정 화면에도 보여요.</span>}
      {kind !== "schedule" && shown !== null && (
        // 한 줄로 작게: "회원 공개 [스위치] 켜짐/꺼짐"
        <div className="row" style={{ gap: 8, justifyContent: "flex-end", fontSize: fs(13) }}>
          <span id={`vis-${kind}-l`} className="small" style={{ fontSize: fs(13) }}>회원 공개</span>
          <button type="button" role="switch" className="switch" aria-checked={shown} aria-labelledby={`vis-${kind}-l`} title={shown ? "회원 일정 화면에 보여요(읽기만)" : "관리자만 봐요"}
            disabled={!canEdit} onClick={() => setVisible(!shown)} style={{ transform: "scale(0.8)", transformOrigin: "right center" }} />
          <span className="small" style={{ fontSize: fs(12), minWidth: 28, color: shown ? "var(--blue-t)" : "var(--sub)" }}>{shown ? "켜짐" : "꺼짐"}</span>
        </div>
      )}
      {kind === "prep" && <span className="small">끝낸 것은 체크해 주세요.</span>}

      {kind === "costs" && (
        // 요약: 한 카드에 작게(예산·집행·잔액·1인 회비 제안)
        <section className="card" aria-label="비용 요약" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
          {/* 늘 2줄: 예산 합계 · 집행 합계 / 잔액 · 1인 회비 제안 */}
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 12px", fontSize: fs(13) }}>
            {[
              ["예산 합계", won(totalBudget), undefined],
              ["집행 합계", won(totalSpent), undefined],
              ["잔액", won(totalBudget - totalSpent), totalBudget - totalSpent < 0 ? "var(--red-t)" : "var(--green-t)"],
              ["1인 회비 제안", suggest ? won(suggest) : "-", "var(--blue-t)"],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
                <dt className="small" style={{ margin: 0 }}>{k}</dt>
                <dd className="num" style={{ margin: 0, fontWeight: 700, color: c }}>{v}</dd>
              </div>
            ))}
          </dl>
          {canEdit && suggest > 0 && <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => applyFee(suggest)}>{won(suggest)}을 기본 회비로 정하기</button>}
        </section>
      )}

      {items.length === 0 && <div className="msg info">아직 {TITLE[kind]} 항목이 없어요. “+ {TITLE[kind]} 추가”로 넣어 주세요.</div>}
      <div className="tblw">
        <table className="tbl" style={{ minWidth: kind === "costs" ? 760 : 560 }}>
          <thead>
            <tr>
              {kind === "schedule" && <><th>일시</th><th>내용</th></>}
              {kind === "prep" && <><th>완료</th><th>준비물</th><th>담당</th></>}
              {kind === "costs" && <><th>항목</th><th>예산(원)</th><th>집행(원)</th><th>상태</th><th>담당</th><th>메모</th></>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const d = draft[i.id] ?? i;
              return (
                <tr key={i.id}>
                  {kind === "schedule" && (
                    <>
                      <td><DateField mode="datetime" ariaLabel="일시" style={{ minWidth: 230 }} inputStyle={{ minHeight: 44 }} value={String(d.at)} disabled={!canEdit} onChange={(v) => set(i.id, "at", v)} /></td>
                      <td><input aria-label="내용" className="field" style={{ minHeight: 42 }} value={String(d.title)} disabled={!canEdit} onChange={(e) => set(i.id, "title", e.target.value)} /></td>
                    </>
                  )}
                  {kind === "prep" && (
                    <>
                      <td><input aria-label="완료" type="checkbox" style={{ width: 24, height: 24 }} checked={Boolean(i.done)} disabled={!canEdit} onChange={(e) => toggle(i.id, e.target.checked)} /></td>
                      <td><input aria-label="준비물" className="field" style={{ minHeight: 42, textDecoration: i.done ? "line-through" : undefined }} value={String(d.item)} disabled={!canEdit} onChange={(e) => set(i.id, "item", e.target.value)} /></td>
                      <td><input aria-label="담당" className="field" style={{ minHeight: 42 }} value={String(d.owner)} disabled={!canEdit} onChange={(e) => set(i.id, "owner", e.target.value)} /></td>
                    </>
                  )}
                  {kind === "costs" && (
                    <>
                      <td><input aria-label="항목" className="field" style={{ minHeight: 42, minWidth: 140 }} value={String(d.item)} disabled={!canEdit} onChange={(e) => set(i.id, "item", e.target.value)} /></td>
                      <td><input aria-label="예산" className="field num" inputMode="numeric" style={{ minHeight: 42, width: 120 }} value={String(d.budget)} disabled={!canEdit} onChange={(e) => set(i.id, "budget", Number(e.target.value.replace(/\D/g, "")))} /></td>
                      <td><input aria-label="집행" className="field num" inputMode="numeric" style={{ minHeight: 42, width: 120 }} value={String(d.spent)} disabled={!canEdit} onChange={(e) => set(i.id, "spent", Number(e.target.value.replace(/\D/g, "")))} /></td>
                      <td>
                        <select aria-label="상태" className="field" style={{ minHeight: 42, width: 110 }} value={String(d.status)} disabled={!canEdit} onChange={(e) => set(i.id, "status", e.target.value)}>
                          {STATUS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td><input aria-label="담당" className="field" style={{ minHeight: 42, width: 110 }} value={String(d.owner)} disabled={!canEdit} onChange={(e) => set(i.id, "owner", e.target.value)} /></td>
                      <td className="center">
                        {/* 메모는 아이콘만: 누르면 창에서 보고 고친다(메모가 있으면 진하게) */}
                        <button type="button" className="mini" title={i.memo ? "메모 보기" : "메모 쓰기"} aria-label={`${String(i.item)} 메모${i.memo ? " 보기" : " 쓰기"}`}
                          style={{ minHeight: 40, width: 44, padding: 0, justifyContent: "center", color: i.memo ? "var(--blue-t)" : "var(--sub)", opacity: i.memo || canEdit ? 1 : 0.4 }}
                          disabled={!i.memo && !canEdit}
                          onClick={() => setMemoOf({ id: i.id, item: String(i.item), text: String(i.memo ?? "") })}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill={i.memo ? "currentColor" : "none"} fillOpacity={i.memo ? 0.15 : 0} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" />
                          </svg>
                        </button>
                      </td>
                    </>
                  )}
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canEdit && <><button className="mini" type="button" onClick={() => save(i.id)}>저장</button>{" "}<button className="mini danger" type="button" onClick={() => remove(i.id)}>삭제</button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <>
        <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={() => { setErr(""); setOpen(true); }}>+ {TITLE[kind]} 추가</button>
        <Popup id={`item-new-${kind}`} title={`${TITLE[kind]} 추가`} open={open} onClose={() => setOpen(false)} dirty={JSON.stringify(add) !== JSON.stringify(BLANK[kind])}>
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {err && <div className="msg bad" role="alert">{err}</div>}
          <div className="grid2">
            {kind === "schedule" && (
              <>
                <div><label className="l" htmlFor="n-at">일시</label><DateField id="n-at" mode="datetime" value={String(add.at)} onChange={(v) => setAdd({ ...add, at: v })} /></div>
                <div><label className="l" htmlFor="n-title">내용</label><input id="n-title" className="field" value={String(add.title)} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></div>
              </>
            )}
            {kind === "prep" && (
              <>
                <div><label className="l" htmlFor="n-item">준비물</label><input id="n-item" className="field" value={String(add.item)} onChange={(e) => setAdd({ ...add, item: e.target.value })} /></div>
                <div><label className="l" htmlFor="n-owner">담당</label><input id="n-owner" className="field" value={String(add.owner)} onChange={(e) => setAdd({ ...add, owner: e.target.value })} /></div>
              </>
            )}
            {kind === "costs" && (
              <>
                <div><label className="l" htmlFor="n-item">항목</label><input id="n-item" className="field" value={String(add.item)} onChange={(e) => setAdd({ ...add, item: e.target.value })} /></div>
                <div><label className="l" htmlFor="n-bud">예산(원)</label><input id="n-bud" className="field" inputMode="numeric" value={String(add.budget)} onChange={(e) => setAdd({ ...add, budget: Number(e.target.value.replace(/\D/g, "")) })} /></div>
                <div><label className="l" htmlFor="n-sp">집행(원)</label><input id="n-sp" className="field" inputMode="numeric" value={String(add.spent)} onChange={(e) => setAdd({ ...add, spent: Number(e.target.value.replace(/\D/g, "")) })} /></div>
                <div><label className="l" htmlFor="n-own">담당</label><input id="n-own" className="field" value={String(add.owner)} onChange={(e) => setAdd({ ...add, owner: e.target.value })} /></div>
              </>
            )}
          </div>
          {kind === "costs" && (
            <div>
              <label className="l" htmlFor="n-memo">메모 (선택)</label>
              <textarea id="n-memo" className="field" rows={3} maxLength={1000} style={{ padding: 10, lineHeight: 1.5, resize: "vertical" }}
                placeholder="예) 영수증은 총무에게, 계약금 30% 선입금" value={String(add.memo ?? "")} onChange={(e) => setAdd({ ...add, memo: e.target.value })} />
            </div>
          )}
          <button className="btn" type="submit" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }}>추가</button>
        </form>
        </Popup>
        </>
      )}
      {kind === "prep" && <PrepFiles eventId={eventId} canEdit={canEdit} />}
      {kind === "costs" && (
        <Popup id="cost-memo" width={460} title={memoOf ? `메모 · ${memoOf.item}` : "메모"} open={!!memoOf} onClose={() => setMemoOf(null)}
          dirty={!!memoOf && memoOf.text !== String(items.find((x) => x.id === memoOf.id)?.memo ?? "")}
          footer={canEdit ? (
            <div className="row" style={{ gap: 8, width: "100%" }}>
              <button className="btn" type="button" style={{ flex: 1 }} onClick={saveMemo}>저장</button>
              <button className="btn white" type="button" style={{ flex: 1 }} onClick={() => setMemoOf(null)}>닫기</button>
            </div>
          ) : undefined}>
          {memoOf && (canEdit ? (
            <textarea className="field" aria-label="메모" rows={6} maxLength={1000} style={{ padding: 10, lineHeight: 1.6, resize: "vertical", width: "100%" }}
              value={memoOf.text} onChange={(e) => setMemoOf({ ...memoOf, text: e.target.value })} />
          ) : (
            <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6 }}>{memoOf.text}</p>
          ))}
        </Popup>
      )}
    </>
  );
}
