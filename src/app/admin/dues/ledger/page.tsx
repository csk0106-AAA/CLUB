"use client";

import Link from "next/link";
import { RowDelete } from "@/components/RowDelete";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { DateField } from "@/components/DateField";
import { api, fmtDate, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Row = { id: string; date: string; kind: "in" | "out"; item: string; amount: number; memo: string; by: string; auto: boolean; eventId: string };
type Data = {
  year: string; years: string[];
  summary: { paid: number; income: number; spend: number; balanceYear: number; balanceAll: number };
  rows: Row[];
  events: { id: string; name: string; date: string; club: string }[]; // "일정 지원"으로 고를 일정
};
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const BLANK = { date: today(), kind: "out" as "in" | "out" | "event", item: "", amount: "", memo: "", eventId: "" };

// 관리자 › 모임설정 › 회비내역: 연도별 모임 회비 장부. 회비 입금(회비입금에서 확인한 금액) + 기타 수입 - 지출 = 잔액.
// 일정에서 "모임회비 지원"으로 쓴 돈은 지출로 자동으로 들어온다(일정 회비 탭에서 고친다).
function Ledger() {
  const [year, setYear] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [add, setAdd] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/dues/ledger${year ? `?year=${year}` : ""}`);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setD(r.data);
  }, [year]);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // 일정 지원: 그 일정 회비 탭의 지원금(모임회비 지원)으로 들어간다
    const body = add.kind === "event"
      ? { eventId: add.eventId, item: add.item, amount: Number(add.amount) || 0, memo: add.memo }
      : { date: add.date, kind: add.kind, item: add.item, amount: Number(add.amount) || 0, memo: add.memo };
    const r = await api<{ event?: string }>("/api/admin/dues/ledger", { body });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: add.kind === "event" ? `“${r.data.event}” 일정 회비 탭의 지원금(모임회비 지원)에 넣었어요.` : `${add.kind === "out" ? "지출" : "수입"}을 적었어요.` });
    setAdd({ ...BLANK, date: add.date, kind: add.kind });
    load();
  }
  async function remove(r: Row) {
    if (!window.confirm(r.auto ? `“${r.item}” ${won(r.amount)}을 지울까요?\n그 일정 회비 탭의 지원금(모임회비 지원)에서도 빠져요.` : `“${r.item}” ${won(r.amount)} 줄을 지울까요?`)) return;
    const res = await api(`/api/admin/dues/ledger?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    if (!res.ok) return setMsg({ tone: "bad", text: res.error });
    load();
  }

  if (!d) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const s = d.summary;
  const stat = (k: string, v: number, c?: string, sub?: string) => (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0 8px", borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
      <dt className="small" style={{ margin: 0, fontSize: fs(12) }}>{k}</dt>
      <dd className="num" style={{ margin: "0 0 0 auto", fontWeight: 700, color: c, whiteSpace: "nowrap" }}>{won(v)}</dd>
      {sub && <span className="small" style={{ flexBasis: "100%", fontSize: fs(11) }}>{sub}</span>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="small" style={{ margin: 0, fontSize: fs(12) }}>
        모임 회비의 수입과 지출을 적고 잔액을 확인해요. <b>회비 입금</b>은 <Link href="/admin/dues/payments">회비입금</Link>에서 확인한 금액이 자동으로 들어오고, 일정의 <b>모임회비 지원</b>은 지출로 자동으로 들어와요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ gap: 8 }}>
        <label className="small" htmlFor="dl-year" style={{ fontSize: fs(12) }}>연도</label>
        <select id="dl-year" className="field" style={{ width: "auto", minHeight: 36, fontSize: fs(13) }} value={d.year} onChange={(e) => setYear(e.target.value)}>
          {d.years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>

      <section className="card" style={{ padding: 12 }} aria-label="잔액 요약">
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 12px", fontSize: fs(13) }}>
          {stat(`${d.year}년 회비 입금`, s.paid, "var(--green-t)")}
          {stat(`${d.year}년 기타 수입`, s.income, "var(--green-t)")}
          {stat(`${d.year}년 지출`, s.spend, "var(--red-t)")}
          {stat(`${d.year}년 잔액`, s.balanceYear, s.balanceYear < 0 ? "var(--red-t)" : "var(--blue-t)", "입금 + 수입 - 지출")}
          {stat("전체 잔액", s.balanceAll, s.balanceAll < 0 ? "var(--red-t)" : "var(--blue-t)", "지금까지 모든 연도")}
        </dl>
      </section>

      <form onSubmit={create} className="card compact-form" aria-label="장부 적기" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
        <div className="row" style={{ gap: 6 }}>
          <b className="grow" style={{ font: `700 ${fs(15)} var(--display)` }}>장부 적기</b>
          <div className="seg" role="group" aria-label="수입·지출" style={{ width: 210, flex: "none" }}>
            {([["out", "지출"], ["event", "일정 지원"], ["in", "수입"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={add.kind === k} onClick={() => setAdd({ ...add, kind: k })} style={{ minHeight: 32, fontSize: fs(12) }}>{l}</button>
            ))}
          </div>
        </div>
        {add.kind === "event" && (
          <div>
            <label className="l" htmlFor="dl-ev">지원할 일정 (일정 회비 탭의 지원금으로 들어가요)</label>
            <select id="dl-ev" className="field" value={add.eventId} onChange={(e) => setAdd({ ...add, eventId: e.target.value })}>
              <option value="">일정 고르기</option>
              {d.events.map((e) => <option key={e.id} value={e.id}>{e.date ? `${fmtDate(e.date)} ` : ""}{e.name}{e.club ? ` (${e.club})` : ""}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: add.kind === "event" ? "minmax(0, 1.6fr) minmax(0, 1fr)" : "minmax(0, 1.2fr) minmax(0, 1.6fr) minmax(0, 1fr)", gap: 6 }}>
          {add.kind !== "event" && <div><label className="l" htmlFor="dl-date">날짜</label><DateField id="dl-date" mode="date" value={add.date} onChange={(v) => setAdd({ ...add, date: v })} /></div>}
          <div><label className="l" htmlFor="dl-item">내용</label><input id="dl-item" className="field" maxLength={100} placeholder={add.kind === "event" ? "예) 2026 연회비 (선택)" : add.kind === "out" ? "예) 송년회 식비" : "예) 작년 이월금"} value={add.item} onChange={(e) => setAdd({ ...add, item: e.target.value })} /></div>
          <div><label className="l" htmlFor="dl-amt">금액(원)</label><input id="dl-amt" className="field num" inputMode="numeric" value={add.amount} onChange={(e) => setAdd({ ...add, amount: e.target.value.replace(/\D/g, "") })} /></div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input className="field grow" aria-label="메모" maxLength={300} placeholder="메모 (선택)" value={add.memo} onChange={(e) => setAdd({ ...add, memo: e.target.value })} />
          <button className="btn" type="submit" disabled={busy || !Number(add.amount) || (add.kind === "event" ? !add.eventId : !add.item.trim() || !add.date)} style={{ width: "auto", minHeight: 34, padding: "0 12px", fontSize: fs(13) }}>+ 적기</button>
        </div>
      </form>

      {d.rows.length === 0 ? <div className="msg info">{d.year}년에 적은 수입·지출이 없어요.</div> : (
        <div className="tblw">
          <table className="tbl compact stack" style={{ minWidth: 560 }}>
            <thead><tr><th>날짜</th><th>구분</th><th>내용</th><th style={{ textAlign: "right" }}>금액</th><th>메모</th><th><span className="sr-only">버튼</span></th></tr></thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="" className="num small">{fmtDate(r.date) || "날짜 미정"}</td>
                  <td data-label=""><span className={`pill ${r.kind === "in" ? "ok" : "warn"}`}>{r.kind === "in" ? "수입" : "지출"}</span></td>
                  <td data-label="" style={{ overflowWrap: "anywhere" }}>{r.item}{r.auto && <span className="small" style={{ display: "block", fontSize: fs(11) }}>일정 회비 탭의 지원금(모임회비 지원)과 같은 기록</span>}</td>
                  <td data-label="" className="num" style={{ textAlign: "right", fontWeight: 700, color: r.kind === "in" ? "var(--green-t)" : "var(--red-t)" }}>{r.kind === "in" ? "+" : "-"}{won(r.amount)}</td>
                  <td data-label={r.memo ? "메모" : ""} className="small" style={{ overflowWrap: "anywhere" }}>{r.memo}{r.by ? <span style={{ display: "block", fontSize: fs(11) }}>{r.by}</span> : null}</td>
                  <td className="act" data-label="">
                    {r.auto && <Link className="mini" href={`/admin/events/${r.eventId}?tab=fee`} style={{ textDecoration: "none", fontSize: fs(12) }}>일정 ›</Link>}
                    <RowDelete label="이 줄 삭제" onClick={() => remove(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DuesLedgerPage() {
  return <AdminGate mode="group" need={["group"]} active="/admin/dues/ledger"><Ledger /></AdminGate>;
}
