"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RowDelete } from "./RowDelete";
import { api, fmtDate, won } from "@/lib/client";
import { DateField } from "./DateField";
import { Popup } from "./Popup";
import { ScheduleBoard } from "./ScheduleBoard";
import { DragHandle, useDragSort } from "./DragSort";
import { fs } from "@/lib/fs";

type Kind = "schedule" | "prep" | "costs";
type Item = Record<string, string | number | boolean> & { id: string };
type Note = { tone: "bad" | "info"; text: string } | null;

const BLANK: Record<Kind, Record<string, string | number | boolean>> = {
  schedule: { at: "", title: "" },
  prep: { item: "", owner: "", done: false, category: "", price: 0 },
  costs: { item: "", budget: 0, spent: 0, status: "예정", owner: "", memo: "" },
};
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
      <span className="small">사진·문서(pdf, 오피스, hwp, zip, txt)를 하나에 4MB까지, 일정 하나에 20개까지 올려요. 준비목록 “공개”를 켜면 회원도 내려받을 수 있어요.</span>
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
  const [income, setIncome] = useState(0); // 총회비 = 참석자 회비 합계 + 지원금
  // 비용 메모 보기·고치기 창(목록에는 메모 아이콘만)
  const [memoOf, setMemoOf] = useState<{ id: string; item: string; text: string } | null>(null);
  // 비용 목록 순서: ⠿ 손잡이를 끌어서(또는 방향키로) 바꾸고 바로 저장
  const ds = useDragSort(items ?? [], (next) => {
    setItems(next);
    api(base, { method: "PUT", body: { ids: next.map((x) => x.id) } }).then((r) => {
      if (!r.ok) { setNote({ tone: "bad", text: `순서를 저장하지 못했어요. ${r.error}` }); load(); }
    });
  });
  const dragCosts = kind === "costs" && canEdit && (items?.length ?? 0) > 1;
  const [fee, setFee] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  // 준비목록·비용을 회원의 일정 화면에도 보일지(일정의 showPrep / showCosts)
  const flag = kind === "prep" ? "showPrep" : "showCosts";
  const [shown, setShown] = useState<boolean | null>(null);
  // 준비목록의 "비용 항목" 고르기용: 이 일정의 비용 항목 이름
  const [costNames, setCostNames] = useState<string[]>([]);
  // 바로 저장용: 줄별 마지막 저장 값, 다시 불러올 때 새로 맞출 줄
  const savedRef = useRef<Record<string, string>>({});
  const onlyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ items: Item[] }>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setItems(r.data.items);
    // 비용의 집행 칸은 "직접 적은 집행"(base)을 고친다(준비목록 연동분은 서버가 더한다)
    const fresh = Object.fromEntries(r.data.items.map((i) => [i.id, kind === "costs" && i.base !== undefined ? { ...i, spent: i.base } : { ...i }]));
    savedRef.current = Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, JSON.stringify(body(v))]));
    // 바로 저장한 뒤 다시 불러올 때는 저장한 줄만 새 값으로(다른 칸에 적던 내용은 그대로)
    const only = onlyRef.current;
    onlyRef.current = null;
    setDraft((cur) => (only && Object.keys(cur).length ? { ...Object.fromEntries(Object.keys(fresh).map((k) => [k, k === only ? fresh[k] : cur[k] ?? fresh[k]])) } : fresh));
    if (kind !== "schedule") {
      const ev = await api<{ event: Record<string, unknown> }>(`/api/admin/events/${eventId}`);
      if (ev.ok) setShown(ev.data.event[kind === "prep" ? "showPrep" : "showCosts"] === "true");
    }
    if (kind === "prep") {
      const c = await api<{ items: { item: string }[] }>(`/api/admin/events/${eventId}/items/costs`);
      if (c.ok) setCostNames([...new Set(c.data.items.map((x) => x.item.trim()).filter(Boolean))]);
    }
    if (kind === "costs") {
      const e = await api<{ event: { fee: string; feeRules?: { days: string; kind: string; position: string; amount: string }[]; supports?: { amount: string }[] }; rows: { answer: string; fee: string }[] }>(`/api/admin/events/${eventId}`);
      if (e.ok) {
        const going = e.data.rows.filter((x) => x.answer === "참석");
        setAttend(going.length);
        const sup = (e.data.event.supports ?? []).reduce((n, x) => n + (Number(x.amount) || 0), 0);
        setSupport(sup);
        // 총회비 = 참석자 회비 합계 + 지원금(회비 탭의 총 예산과 같다)
        setIncome(going.reduce((n, x) => n + (Number(x.fee) || 0), 0) + sup);
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
  // 바로 저장: 칸에서 나가거나(입력) 고르면(선택) 바뀐 줄만 저장한다("저장" 버튼 없음)
  async function save(id: string, patch?: Record<string, string | number | boolean>) {
    const next = { ...draft[id], ...patch };
    if (patch) setDraft((d) => ({ ...d, [id]: next as Item }));
    if (JSON.stringify(body(next)) === savedRef.current[id]) return;
    if (!String(next.item ?? "x").trim()) return setNote({ tone: "bad", text: `${kind === "prep" ? "준비물" : "항목"} 이름을 적어 주세요.` });
    const r = await api(`${base}/${id}`, { method: "PATCH", body: body(next) });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    savedRef.current[id] = JSON.stringify(body(next));
    onlyRef.current = id;
    load();
  }
  async function toggle(id: string, done: boolean) {
    const r = await api(`${base}/${id}`, { method: "PATCH", body: { ...body(draft[id]), done } });
    if (!r.ok) setNote({ tone: "bad", text: r.error });
    onlyRef.current = id;
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
  // 비용 목록 칸: 위 요약과 어울리게 작은 글씨
  const cs = { minHeight: 36, fontSize: fs(13), padding: "0 8px" } as const;
  // 회원 공개 스위치(준비목록·비용 공통): "공개 [스위치]"
  const visSwitch = kind !== "schedule" && shown !== null ? (
    <>
      <span id={`vis-${kind}-l`} className="small" style={{ fontSize: fs(12), whiteSpace: "nowrap" }}>공개</span>
      <button type="button" role="switch" className="switch" aria-checked={shown} aria-labelledby={`vis-${kind}-l`} aria-label={`${TITLE[kind]} 회원 공개`}
        title={shown ? "회원 일정 화면에 보여요(읽기만)" : "관리자만 봐요"}
        disabled={!canEdit} onClick={() => setVisible(!shown)} style={{ transform: "scale(0.75)", flex: "none", margin: "0 -6px" }} />
    </>
  ) : null;

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {kind === "schedule" && <span className="small">여기에 적은 일정은 회원의 일정 화면에도 보여요.</span>}
      {kind === "costs" && (
        // 비용: 요약 카드 위 한 줄 "1인 회비 제안 ○원 [기본 회비로 정하기]"
        <span className="row" style={{ gap: 4, flexWrap: "wrap", minWidth: 0, whiteSpace: "nowrap" }} title={support ? `(예산 합계 - 지원금) ÷ 참석 ${attend}명` : `예산 합계 ÷ 참석 ${attend}명`}>
          <span className="small" style={{ fontSize: fs(12) }}>1인 회비 제안</span>
          <b className="num" style={{ color: "var(--blue-t)", fontSize: fs(13) }}>{suggest ? won(suggest) : "-"}</b>
          {canEdit && suggest > 0 && <button className="mini" type="button" style={{ minHeight: 28, padding: "0 6px", fontSize: fs(11), whiteSpace: "nowrap" }} onClick={() => applyFee(suggest)}>기본 회비로 정하기</button>}
        </span>
      )}
      {kind === "prep" && <span className="small" style={{ fontSize: fs(12) }}>끝낸 것은 체크해 주세요. “비용 항목”을 고르면 완료 체크된 준비물의 가격이 같은 이름의 비용 항목 집행 금액에 더해져요.</span>}

      {kind === "costs" && (
        // 요약: 한 카드에 작게. 1줄 예산 합계 · 집행 합계 / 2줄 총회비-예산합계 · 총회비-집행합계
        // (총회비 = 참석자 회비 합계 + 지원금, 회비 탭의 "총 예산")
        <section className="card" aria-label="비용 요약" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 12px", fontSize: fs(13) }}>
            {([
              ["예산 합계", totalBudget, false],
              ["집행 합계", totalSpent, false],
              ["총회비-예산합계", income - totalBudget, true],
              ["총회비-집행합계", income - totalSpent, true],
            ] as const).map(([k, v, signed]) => (
              <div key={k} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "0 6px", borderBottom: "1px solid var(--line)", paddingBottom: 4 }}
                title={signed ? `총회비 ${won(income)}(참석자 회비 + 지원금) - ${k.includes("예산") ? "예산" : "집행"} 합계` : undefined}>
                <dt className="small" style={{ margin: 0, whiteSpace: "nowrap", fontSize: fs(12) }}>{k}</dt>
                <dd className="num" style={{ margin: "0 0 0 auto", fontWeight: 700, whiteSpace: "nowrap", color: signed ? (v < 0 ? "var(--red-t)" : "var(--green-t)") : undefined }}>{won(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {/* 비용 목록 바로 위 한 줄: 왼쪽 "공개 [스위치]" · 오른쪽 + 비용 추가(준비목록과 같은 배치) */}
      {kind === "costs" && (
        <div className="row" style={{ gap: 6, justifyContent: "space-between" }}>
          <span className="row" style={{ gap: 6 }}>{visSwitch}</span>
          {canEdit && <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", flex: "none", minHeight: 36, padding: "0 12px", fontSize: fs(13) }} onClick={() => { setErr(""); setOpen(true); }}>+ 비용 추가</button>}
        </div>
      )}

      {/* 준비목록: 목록 바로 위 오른쪽에 작은 빨간 "+ 준비 목록 추가"(비용과 같은 모양) */}
      {/* 준비목록: 한 줄에 왼쪽 "공개 [스위치]" · 오른쪽 "+ 준비 목록 추가" */}
      {kind === "prep" && (visSwitch || canEdit) && (
        <div className="row" style={{ gap: 6, justifyContent: "space-between" }}>
          <span className="row" style={{ gap: 6 }}>{visSwitch}</span>
          {canEdit && <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", minHeight: 36, padding: "0 12px", fontSize: fs(13) }} onClick={() => { setErr(""); setOpen(true); }}>+ 준비 목록 추가</button>}
        </div>
      )}
      {items.length === 0 && <div className="msg info">아직 {TITLE[kind]} 항목이 없어요. “+ {TITLE[kind]} 추가”로 넣어 주세요.</div>}
      <div className="tblw">
        <table className="tbl compact stack" style={{ minWidth: kind === "costs" ? 680 : kind === "prep" ? 560 : 520 }}>
          <thead>
            <tr>
              {kind === "schedule" && <><th>일시</th><th>내용</th></>}
              {kind === "prep" && <><th>완료</th><th>비용 항목</th><th>준비물</th><th>가격(원)</th><th>담당</th></>}
              {kind === "costs" && <>{dragCosts && <th style={{ width: 44 }}><span className="sr-only">순서</span></th>}<th>항목</th><th>예산(원)</th><th>집행(원)</th><th>담당</th><th>메모</th></>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => {
              const d = draft[i.id] ?? i;
              const row = kind === "costs" ? ds.item(idx) : null;
              return (
                <tr key={i.id} ref={row?.ref} style={row?.style}>
                  {dragCosts && <td data-label="" style={{ padding: "0 2px" }}><DragHandle plain {...ds.handle(idx, String(i.item))} /></td>}
                  {kind === "schedule" && (
                    <>
                      <td><DateField mode="datetime" ariaLabel="일시" style={{ minWidth: 230 }} inputStyle={{ minHeight: 44 }} value={String(d.at)} disabled={!canEdit} onChange={(v) => set(i.id, "at", v)} /></td>
                      <td><input aria-label="내용" className="field" style={{ minHeight: 42 }} value={String(d.title)} disabled={!canEdit} onChange={(e) => set(i.id, "title", e.target.value)} /></td>
                    </>
                  )}
                  {kind === "prep" && (
                    <>
                      <td className="center" data-label="완료"><input aria-label="완료" type="checkbox" style={{ width: 20, height: 20 }} checked={Boolean(i.done)} disabled={!canEdit} onChange={(e) => toggle(i.id, e.target.checked)} /></td>
                      <td data-label="비용 항목">
                        <select aria-label="비용 항목" className="field" style={{ ...cs, width: 110 }} value={String(d.category ?? "")} disabled={!canEdit} onChange={(e) => save(i.id, { category: e.target.value })}>
                          <option value="">(없음)</option>
                          {[...new Set([...costNames, ...(d.category ? [String(d.category)] : [])])].map((n) => <option key={n} value={n}>{n}{costNames.includes(n) ? "" : " (비용에 없음)"}</option>)}
                        </select>
                      </td>
                      <td className="wide" data-label="준비물"><input aria-label="준비물" className="field" style={{ ...cs, minWidth: 120, textDecoration: i.done ? "line-through" : undefined }} value={String(d.item)} disabled={!canEdit} onChange={(e) => set(i.id, "item", e.target.value)} onBlur={() => save(i.id)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></td>
                      <td data-label="가격(원)"><input aria-label="가격" className="field num" inputMode="numeric" style={{ ...cs, width: 100 }} value={String(d.price ?? 0)} disabled={!canEdit} onChange={(e) => set(i.id, "price", Number(e.target.value.replace(/\D/g, "")))} onBlur={() => save(i.id)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></td>
                      <td data-label="담당"><input aria-label="담당" className="field" style={{ ...cs, width: 80 }} value={String(d.owner)} disabled={!canEdit} onChange={(e) => set(i.id, "owner", e.target.value)} onBlur={() => save(i.id)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></td>
                    </>
                  )}
                  {kind === "costs" && (
                    <>
                      <td className={dragCosts ? "main" : "wide"} data-label="항목"><input aria-label="항목" className="field" style={{ ...cs, minWidth: 130 }} value={String(d.item)} disabled={!canEdit} onChange={(e) => set(i.id, "item", e.target.value)} onBlur={() => save(i.id)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></td>
                      <td data-label="예산(원)"><input aria-label="예산" className="field num" inputMode="numeric" style={{ ...cs, width: 110 }} value={String(d.budget)} disabled={!canEdit} onChange={(e) => set(i.id, "budget", Number(e.target.value.replace(/\D/g, "")))} onBlur={() => save(i.id)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></td>
                      <td data-label="집행(원)">
                        {/* 집행 칸에는 합계(직접 적은 집행 + 준비목록에서 완료된 같은 항목 가격)를 보여 준다.
                            고치면 준비목록 합계를 뺀 나머지를 "직접 적은 집행"으로 저장한다. */}
                        {(() => {
                          const ps = Number(i.prepSum) || 0;
                          return (
                            <input aria-label="집행" className="field num" inputMode="numeric" style={{ ...cs, width: 110 }} value={String((Number(d.spent) || 0) + ps)} disabled={!canEdit}
                              title={ps ? `준비목록에서 넘어온 ${won(ps)} 포함` : undefined}
                              onChange={(e) => set(i.id, "spent", Math.max(0, Number(e.target.value.replace(/\D/g, "")) - ps))} onBlur={() => save(i.id)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
                          );
                        })()}
                      </td>
                      <td data-label="담당"><input aria-label="담당" className="field" style={{ ...cs, width: 90 }} value={String(d.owner)} disabled={!canEdit} onChange={(e) => set(i.id, "owner", e.target.value)} onBlur={() => save(i.id)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></td>
                      <td className="center" data-label="메모">
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
                  <td className="act" data-label="" style={{ whiteSpace: "nowrap" }}>
                    {canEdit && <RowDelete label={`${String(i.item ?? i.title ?? "")} 삭제`.trim()} onClick={() => remove(i.id)} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <>
        {/* "+ 비용 추가"·"+ 준비 목록 추가"는 목록 바로 위 오른쪽에 있다 */}
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
                <div>
                  <label className="l" htmlFor="n-cat">비용 항목 (선택)</label>
                  <select id="n-cat" className="field" value={String(add.category ?? "")} onChange={(e) => setAdd({ ...add, category: e.target.value })}>
                    <option value="">(없음)</option>
                    {costNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div><label className="l" htmlFor="n-item">준비물</label><input id="n-item" className="field" value={String(add.item)} onChange={(e) => setAdd({ ...add, item: e.target.value })} /></div>
                <div><label className="l" htmlFor="n-price">가격(원)</label><input id="n-price" className="field" inputMode="numeric" value={String(add.price ?? 0)} onChange={(e) => setAdd({ ...add, price: Number(e.target.value.replace(/\D/g, "")) })} /></div>
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
