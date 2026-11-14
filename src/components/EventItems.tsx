"use client";

import { useCallback, useEffect, useState } from "react";
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
  costs: { item: "", budget: 0, spent: 0, status: "예정", owner: "" },
};
const STATUS = ["예정", "집행 완료", "보류"];
const TITLE: Record<Kind, string> = { schedule: "일정", prep: "준비 목록", costs: "비용" };

// 행사 일정 / 준비 목록 / 비용(예산과 집행). 같은 화면 틀로 세 가지를 다룬다.
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
  const [fee, setFee] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ items: Item[] }>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setItems(r.data.items);
    setDraft(Object.fromEntries(r.data.items.map((i) => [i.id, { ...i }])));
    if (kind === "costs") {
      const e = await api<{ event: { fee: string; feeRules?: { days: string; kind: string; position: string; amount: string }[] }; rows: { answer: string }[] }>(`/api/admin/events/${eventId}`);
      if (e.ok) {
        setAttend(e.data.rows.filter((x) => x.answer === "참석").length);
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
  // 1인 회비 제안: 예산 합계를 참석 인원으로 나누고 천 원 단위로 올린다.
  const suggest = attend > 0 ? Math.ceil(totalBudget / attend / 1000) * 1000 : 0;

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {kind === "schedule" && <span className="small">여기에 적은 일정은 회원의 행사 화면에도 보여요.</span>}
      {kind === "prep" && <span className="small">준비 목록은 관리자만 볼 수 있어요. 끝낸 것은 체크해 주세요.</span>}
      {kind === "costs" && <span className="small">비용은 “회비·비용” 권한이 있는 관리자만 볼 수 있어요.</span>}

      {kind === "costs" && (
        <div className="cards">
          <div className="card"><span className="small">예산 합계</span><div className="big">{won(totalBudget)}</div></div>
          <div className="card"><span className="small">집행 합계</span><div className="big">{won(totalSpent)}</div></div>
          <div className="card"><span className="small">잔액</span><div className="big" style={{ color: totalBudget - totalSpent < 0 ? "var(--red-t)" : "var(--green-t)" }}>{won(totalBudget - totalSpent)}</div></div>
          <div className="card">
            <span className="small">1인 회비 제안 (예산 ÷ 참석 {attend}명)</span>
            <div className="big">{suggest ? won(suggest) : "-"}</div>
            <span className="small">현재 기본 회비(“전체” 줄) {fee ? won(fee) : "없음"}</span>
            {canEdit && suggest > 0 && <button className="mini" type="button" style={{ marginTop: 6 }} onClick={() => applyFee(suggest)}>이 금액으로 정하기</button>}
          </div>
        </div>
      )}

      {items.length === 0 && <div className="msg info">아직 {TITLE[kind]} 항목이 없어요. “+ {TITLE[kind]} 추가”로 넣어 주세요.</div>}
      <div className="tblw">
        <table className="tbl" style={{ minWidth: kind === "costs" ? 760 : 560 }}>
          <thead>
            <tr>
              {kind === "schedule" && <><th>일시</th><th>내용</th></>}
              {kind === "prep" && <><th>완료</th><th>준비물</th><th>담당</th></>}
              {kind === "costs" && <><th>항목</th><th>예산(원)</th><th>집행(원)</th><th>상태</th><th>담당</th></>}
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
                      <td><input aria-label="항목" className="field" style={{ minHeight: 42 }} value={String(d.item)} disabled={!canEdit} onChange={(e) => set(i.id, "item", e.target.value)} /></td>
                      <td><input aria-label="예산" className="field num" inputMode="numeric" style={{ minHeight: 42, width: 120 }} value={String(d.budget)} disabled={!canEdit} onChange={(e) => set(i.id, "budget", Number(e.target.value.replace(/\D/g, "")))} /></td>
                      <td><input aria-label="집행" className="field num" inputMode="numeric" style={{ minHeight: 42, width: 120 }} value={String(d.spent)} disabled={!canEdit} onChange={(e) => set(i.id, "spent", Number(e.target.value.replace(/\D/g, "")))} /></td>
                      <td>
                        <select aria-label="상태" className="field" style={{ minHeight: 42, width: 110 }} value={String(d.status)} disabled={!canEdit} onChange={(e) => set(i.id, "status", e.target.value)}>
                          {STATUS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td><input aria-label="담당" className="field" style={{ minHeight: 42, width: 110 }} value={String(d.owner)} disabled={!canEdit} onChange={(e) => set(i.id, "owner", e.target.value)} /></td>
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
          <button className="btn" type="submit" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }}>추가</button>
        </form>
        </Popup>
        </>
      )}
    </>
  );
}
