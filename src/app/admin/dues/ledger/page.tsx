"use client";

import { ActionNote } from "@/components/ActionNote";
import Link from "next/link";
import { RowDelete } from "@/components/RowDelete";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { DateField } from "@/components/DateField";
import { api, fmtDate, fmtDateTime, won } from "@/lib/client";
import { Popup } from "@/components/Popup";
import { downloadXlsx } from "@/lib/xlsx";
import { fs } from "@/lib/fs";

type Row = { id: string; date: string; kind: "in" | "out"; item: string; amount: number; memo: string; by: string; auto: boolean; eventId: string };
type Data = {
  year: string; years: string[];
  summary: { prevYear: string; prev: number; paid: number; income: number; totalIn: number; spend: number; support: number; balance: number };
  rows: Row[];
  events: { id: string; name: string; date: string; club: string }[]; // "일정 지원"으로 고를 일정
};
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const BLANK = { date: today(), kind: "out" as "in" | "out" | "event", item: "", amount: "", memo: "", eventId: "" };

// 관리자 › 모임설정 › 회비현황: 연도별 모임 회비 장부. 회비 입금(회비입금에서 확인한 금액) + 기타 수입 - 지출 = 잔액.
// 일정에서 "모임회비 지원"으로 쓴 돈은 지출로 자동으로 들어온다(일정 회비 탭에서 고친다).
function Ledger() {
  const [year, setYear] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [add, setAdd] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [logs, setLogs] = useState<{ year: string; byName: string; at: string; kind?: string }[]>([]);
  const [dl, setDl] = useState("");
  const thisYear = String(new Date(Date.now() + 9 * 3600_000).getUTCFullYear());
  const loadLogs = useCallback(async () => {
    const r = await api<{ logs: { year: string; byName: string; at: string; kind?: string }[] }>("/api/admin/dues/history");
    if (r.ok) setLogs(r.data.logs);
  }, []);
  // 지난 연도 회비현황을 엑셀로: 요약 + 수입·지출 줄(내려받기 기록이 남는다)
  async function excel(y: string) {
    setDl(y);
    const r = await api<Data>(`/api/admin/dues/ledger?year=${y}`);
    if (!r.ok) { setDl(""); return setMsg({ tone: "bad", text: r.error }); }
    const x = r.data;
    const s = x.summary;
    downloadXlsx(`모임회비_${y}년_회비현황.xlsx`, [
      { name: "요약", boldFirst: true, widths: [22, 16], rows: [["항목", "금액"],
        [`${s.prevYear}년 잔액`, String(s.prev)], [`${y} 회비 입금`, String(s.paid)], [`${y}년 기타 수입`, String(s.income)],
        ["전체 입금 총액", String(s.totalIn)], [`${y}년 지출`, String(s.spend)], [`${y}년 지원`, String(s.support)], [`${y}년 잔액`, String(s.balance)]] },
      { name: "수입·지출", boldFirst: true, widths: [12, 8, 34, 14, 28, 10], rows: [["날짜", "구분", "내용", "금액", "메모", "적은 사람"],
        ...x.rows.map((row) => [row.date, row.kind === "in" ? "수입" : row.auto ? "지원" : "지출", row.item, String(row.kind === "in" ? row.amount : -row.amount), row.memo, row.by])] },
    ]);
    await api("/api/admin/dues/history", { body: { year: y, kind: "ledger" } });
    setDl("");
    loadLogs();
  }

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
  // 요약 한 줄. href 를 주면 누를 수 있다(회비입금 › 그 해 "누적"으로)
  const YELLOW = "var(--accent-ink)";
  const APRICOT = "var(--apricot-t)";
  const stat = (k: string, v: number, c: string, href?: string) => {
    const inner = (
      <>
        <dt className="small" style={{ margin: 0, fontSize: fs(12), color: c }}>{k}{href ? " ›" : ""}</dt>
        <dd className="num" style={{ margin: "0 0 0 auto", fontWeight: 700, color: c, whiteSpace: "nowrap" }}>{won(v)}</dd>
      </>
    );
    const style = { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0 8px", borderBottom: "1px solid var(--line)", paddingBottom: 4 } as const;
    return href ? <Link href={href} style={{ ...style, textDecoration: "none" }} aria-label={`${k} ${won(v)}, 누적 보기`}>{inner}</Link> : <div style={style}>{inner}</div>;
  };
  const totalHref = (y: string) => `/admin/dues/payments?view=total&year=${y}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="small" style={{ margin: 0, fontSize: fs(12) }}>
        모임 회비의 수입과 지출을 적고 잔액을 확인해요. <b>회비 입금</b>은 <Link href="/admin/dues/payments">회비입금</Link>에서 확인한 금액이 자동으로 들어오고, 일정의 <b>모임회비 지원</b>은 지출로 자동으로 들어와요.
      </p>
      <ActionNote msg={msg} />
      {/* 올해 회비현황이 기본. 지난 연도는 "과거내역"에서(보기·엑셀) */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: fs(15) }}>{d.year}년</b>
        {d.year < thisYear && <><span className="pill gray">과거 내역</span><button className="mini" type="button" onClick={() => setYear(thisYear)}>올해({thisYear}년)로</button></>}
        <span className="grow" />
        <button className="mini" type="button" aria-haspopup="dialog" style={{ minHeight: 36 }} onClick={() => { if (!d.years.some((y) => y < thisYear)) return window.alert("과거 내역이 없습니다."); loadLogs(); setHistOpen(true); }}>과거내역</button>
      </div>
      <Popup id="ledger-history" width={520} title="과거내역" open={histOpen} onClose={() => setHistOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="small">지난 연도의 회비현황이에요. “보기”는 그 해 회비현황으로 가고, “엑셀”은 요약과 수입·지출 줄을 내려받아요.</span>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {d.years.filter((y) => y < thisYear).map((y) => (
              <li key={y} className="row" style={{ gap: 8, padding: "10px 4px", borderBottom: "1px solid var(--line2)" }}>
                <b className="grow">{y}년</b>
                <button className="mini" type="button" onClick={() => { setHistOpen(false); setYear(y); }}>보기</button>
                <button className="mini" type="button" disabled={dl === y} onClick={() => excel(y)}>{dl === y ? "만드는 중…" : "엑셀"}</button>
              </li>
            ))}
          </ul>
          <section style={{ display: "flex", flexDirection: "column", gap: 4 }} aria-label="내려받기 기록">
            <b style={{ fontSize: fs(13) }}>내려받기 기록</b>
            {logs.length === 0 ? <span className="small">아직 내려받은 기록이 없어요.</span> : (
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2, fontSize: fs(12) }}>
                {logs.map((l, i) => <li key={i}>{fmtDateTime(l.at)} · {l.byName} · {l.year}년 {l.kind === "ledger" ? "회비현황" : "입금 내역"}</li>)}
              </ul>
            )}
          </section>
        </div>
      </Popup>

      <section className="card" style={{ padding: 12 }} aria-label="잔액 요약">
        {/* 왼쪽(들어온 돈): +잔액(전년도) · +회비 · +기타 · +총액 / 오른쪽(나간 돈): -지출 · -지원 · -총액 · 잔액.
            한 줄에 왼쪽·오른쪽을 짝지어 놓아 줄이 어긋나지 않게 한다 */}
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 14px", fontSize: fs(13) }}>
          {stat(`${s.prevYear} +잔액`, s.prev, YELLOW, totalHref(s.prevYear))}
          {stat(`${d.year} -지출`, s.spend, APRICOT)}
          {stat(`${d.year} +회비`, s.paid, YELLOW, totalHref(d.year))}
          {stat(`${d.year} -지원`, s.support, APRICOT)}
          {stat(`${d.year} +기타`, s.income, YELLOW)}
          {stat(`${d.year} -총액`, s.spend + s.support, APRICOT)}
          {stat(`${d.year} +총액`, s.totalIn, YELLOW)}
          {stat(`${d.year} 잔액`, s.balance, s.balance < 0 ? APRICOT : YELLOW)}
        </dl>
        <span className="small" style={{ display: "block", marginTop: 8, fontSize: fs(11) }}>+잔액은 전년도 잔액이에요. 해마다 12월 31일 24:00에 마감하고, 그 해 잔액이 다음 해의 +잔액으로 넘어가요. 잔액 = +총액 - -총액(지출 + 일정의 모임회비 지원)</span>
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
