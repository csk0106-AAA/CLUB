"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api, fmtDate, fmtDateTime, won } from "@/lib/client";
import { Popup } from "@/components/Popup";
import { downloadXlsx } from "@/lib/xlsx";
import { fs } from "@/lib/fs";

type Row = {
  memberId: string; name: string; kind: string; position: string; amount: string;
  paid: boolean; paidAt: string; notice: string; memo: string; checkedBy: string; target: boolean;
};
type Data = {
  period: string; periodLabel: string; current: string; periods: { value: string; label: string }[];
  duesPeriod: "annual" | "monthly"; account: string; holder: string; rows: Row[];
};

type Total = {
  year: string; years: string[]; current: string; duesPeriod: "annual" | "monthly";
  rows: { period: string; label: string; paid: number; targets: number; amount: number }[]; total: number;
};

// 누적: 그 해의 회차(월회비는 달마다)별 입금 인원·입금액을 더해 보여 준다. 회차를 누르면 그 회차의 기간별로 간다.
function TotalView({ year, onYear, onPick, onType, thisYear }: { year: string; onYear: (y: string) => void; onPick: (period: string) => void; onType: (t: "annual" | "monthly") => void; thisYear: string }) {
  const [t, setT] = useState<Total | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Total>(`/api/admin/dues/payments?view=total${year ? `&year=${year}` : ""}`).then((r) => {
      if (r.ok) { setT(r.data); onType(r.data.duesPeriod); } else setErr(r.error);
    });
  }, [year, onType]);
  if (!t) return err ? <div className="msg bad" role="alert">{err}</div> : <p className="small">불러오는 중이에요…</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {thisYear && t.year < thisYear && (
        <div className="msg info row" role="status" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="grow"><b>{t.year}년 과거 내역</b>이에요.</span>
          <button className="mini" type="button" onClick={() => onYear(thisYear)}>올해({thisYear}년)로</button>
        </div>
      )}
      <section className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }} aria-label="합계">
        <b style={{ fontSize: fs(14) }}>{t.year}년 회비 입금 합계</b>
        <b className="num" style={{ fontSize: fs(18), color: "var(--accent-ink)" }}>{won(t.total)}</b>
      </section>
      <div className="tblw">
        <table className="tbl compact" style={{ minWidth: 0 }}>
          <thead><tr><th>회차</th><th style={{ textAlign: "center" }}>입금 인원</th><th style={{ textAlign: "right" }}>입금액</th></tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.period} style={{ cursor: "pointer" }} onClick={() => onPick(r.period)}>
                <td><button type="button" className="mini" style={{ minHeight: 30, fontWeight: r.period === t.current ? 800 : 500 }} onClick={(e) => { e.stopPropagation(); onPick(r.period); }} aria-label={`${r.label} 기간별로 보기`}>{r.label}{r.period === t.current ? " (지금)" : ""} ›</button></td>
                <td className="num" style={{ textAlign: "center" }}>{r.paid} / {r.targets}명</td>
                <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{won(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="small" style={{ fontSize: fs(12) }}>회차를 누르면 그 회차의 기간별(회원마다 입금 확인)로 가요.</span>
    </div>
  );
}

type History = { thisYear: string; pastYears: { year: string; total: number; paid: number }[]; logs: { year: string; byName: string; at: string; kind?: string }[] };
type HistoryYear = {
  year: string; total: number;
  summary: { period: string; label: string; paid: number; amount: number }[];
  rows: { period: string; name: string; kind: string; position: string; amount: string; status: string; paidAt: string; checkedBy: string; memo: string }[];
};

// 과거 내역: 지난 연도별 입금 합계. "보기"는 그 해 누적으로, "엑셀"은 그 해 회차별 합계 + 회원별 내역을 내려받는다(내려받기 기록이 남는다).
function PastHistory({ hist, onView, onDownloaded }: { hist: History; onView: (year: string) => void; onDownloaded: () => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function excel(year: string) {
    setBusy(year);
    setErr("");
    const r = await api<HistoryYear>(`/api/admin/dues/history?year=${year}`);
    if (!r.ok) { setBusy(""); return setErr(r.error); }
    const d = r.data;
    downloadXlsx(`모임회비_${year}년_입금내역.xlsx`, [
      { name: "누적", boldFirst: true, widths: [22, 12, 16], rows: [["회차", "입금 인원", "입금액"], ...d.summary.map((x) => [x.label, `${x.paid}명`, String(x.amount)]), ["합계", "", String(d.total)]] },
      { name: "회원별 내역", boldFirst: true, widths: [20, 12, 10, 12, 12, 18, 12, 10, 24], rows: [["회차", "이름", "구분", "직책", "금액", "상태", "확인일", "확인자", "메모"], ...d.rows.map((x) => [x.period, x.name, x.kind, x.position, x.amount, x.status, x.paidAt, x.checkedBy, x.memo])] },
    ]);
    await api("/api/admin/dues/history", { body: { year } });
    setBusy("");
    onDownloaded();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="small">지난 연도의 회비 입금 내역이에요. “보기”는 그 해 누적(회차별 합산)으로 가고, 회차를 누르면 회원별 내역을 볼 수 있어요. 엑셀로 내려받으면 회차별 합계와 회원별 내역이 함께 들어 있어요.</span>
      {err && <div className="msg bad" role="alert">{err}</div>}
      <ul className="rows" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {hist.pastYears.map((y) => (
          <li key={y.year} className="row" style={{ gap: 8, padding: "10px 4px", borderBottom: "1px solid var(--line2)", flexWrap: "wrap" }}>
            <b className="grow">{y.year}년</b>
            <span className="num small">{y.paid}건 · <b style={{ color: "var(--accent-ink)" }}>{won(y.total)}</b></span>
            <button className="mini" type="button" onClick={() => onView(y.year)}>보기</button>
            <button className="mini" type="button" disabled={busy === y.year} onClick={() => excel(y.year)}>{busy === y.year ? "만드는 중…" : "엑셀"}</button>
          </li>
        ))}
      </ul>
      <section style={{ display: "flex", flexDirection: "column", gap: 4 }} aria-label="내려받기 기록">
        <b style={{ fontSize: fs(13) }}>내려받기 기록</b>
        {hist.logs.length === 0 ? <span className="small">아직 내려받은 기록이 없어요.</span> : (
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2, fontSize: fs(12) }}>
            {hist.logs.map((l, i) => <li key={i}>{fmtDateTime(l.at)} · {l.byName} · {l.year}년 {l.kind === "ledger" ? "회비내역" : "입금 내역"}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

// 관리자 › 모임설정 › 회비입금: 기간별(한 회차를 자세히, 처음 보기)과 누적(그 해 회차별 합산).
//  "누적" 칸은 월회비(달마다 내는 회비)일 때만 보인다. 연회비면 칸은 숨기지만, 회비내역에서 누르면 주소(?view=total)로 그대로 열린다.
function PaymentsPage({ initial, initView, initYear }: { initial: string; initView: string; initYear: string }) {
  const [view, setView] = useState<"total" | "period">(initView === "total" ? "total" : "period");
  const [pick, setPick] = useState(initial);
  const [year, setYear] = useState(initYear);
  const [type, setType] = useState<"annual" | "monthly" | "">("");
  const onType = useCallback((t: "annual" | "monthly") => setType(t), []);
  const showTabs = type === "monthly" || view === "total";
  const [hist, setHist] = useState<History | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const loadHist = useCallback(async () => {
    const r = await api<History>("/api/admin/dues/history");
    if (r.ok) setHist(r.data);
  }, []);
  useEffect(() => {
    loadHist();
  }, [loadHist]);
  const [acct, setAcct] = useState("");
  // 과거내역(늘 보인다. 지난 연도 기록이 없으면 누를 때 알림)
  const pastBtn = (
    <button className="mini" type="button" aria-haspopup="dialog" style={{ minHeight: 36 }} onClick={() => { if (!hist || hist.pastYears.length === 0) return window.alert("과거 내역이 없습니다."); loadHist(); setHistOpen(true); }}>과거내역</button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {showTabs && (
          <div className="seg" role="group" aria-label="보기 방식" style={{ width: 200, flex: "none" }}>
            <button type="button" aria-pressed={view === "period"} onClick={() => setView("period")} style={{ minHeight: 36, fontSize: fs(13) }}>기간별</button>
            <button type="button" aria-pressed={view === "total"} onClick={() => setView("total")} style={{ minHeight: 36, fontSize: fs(13) }}>누적</button>
          </div>
        )}
        <span className="grow" />
        {/* 입금계좌(회비설정) */}
        {acct && <span className="small" style={{ fontSize: fs(12), textAlign: "right" }}>입금계좌 {acct}</span>}
        {/* 누적 화면에는 기간 고르기가 없어서 과거내역을 여기에 */}
        {view === "total" && pastBtn}
      </div>
      {view === "total"
        ? <TotalView year={year} onYear={setYear} onPick={(p) => { setPick(p); setView("period"); }} onType={onType} thisYear={hist?.thisYear ?? ""} />
        : <Payments key={pick} initial={pick} onType={onType} thisYear={hist?.thisYear} pastBtn={pastBtn} onAccount={setAcct} />}
      <Popup id="dues-history" width={560} title="과거내역" open={histOpen} onClose={() => setHistOpen(false)}>
        {hist && <PastHistory hist={hist} onView={(y) => { setHistOpen(false); setYear(y); setView("total"); }} onDownloaded={loadHist} />}
      </Popup>
    </div>
  );
}

// 기간별: 한 기간(연회비 연도·월회비 월)의 회원마다 낼 금액·입금 확인·입금 알림
function Payments({ initial, onType, thisYear, pastBtn, onAccount }: { initial: string; onType?: (t: "annual" | "monthly") => void; thisYear?: string; pastBtn?: React.ReactNode; onAccount?: (a: string) => void }) {
  const [period, setPeriod] = useState(initial);
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [only, setOnly] = useState<"all" | "paid" | "unpaid" | "notice">("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/dues/payments${period ? `?period=${encodeURIComponent(period)}` : ""}`);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setD(r.data);
    onType?.(r.data.duesPeriod);
    onAccount?.(r.data.account ? `${r.data.account}${r.data.holder ? ` (${r.data.holder})` : ""}` : "");
  }, [period, onType, onAccount]);
  useEffect(() => {
    load();
  }, [load]);

  // 회원이 보낸 입금 알림을 돌려보낸다(통장에 입금이 없을 때). 회원에게 사유와 함께 알림이 가고, 회원은 다시 알릴 수 있다.
  async function rejectNotice(r: Row) {
    if (!d) return;
    const v = window.prompt(`${r.name} 님의 입금 알림을 “입금 안 됨”으로 돌려보낼까요?\n회원에게 알림이 가요. 사유를 적어 주세요(비워도 돼요).`, "입금 내역이 확인되지 않아요");
    if (v === null) return;
    setBusy(r.memberId);
    const res = await api("/api/admin/dues/payments", { body: { period: d.period, memberId: r.memberId, reject: true, reason: v.trim() } });
    setBusy("");
    if (!res.ok) return setMsg({ tone: "bad", text: res.error });
    setMsg({ tone: "info", text: `${r.name} 님 입금 알림을 돌려보내고 회원에게 알렸어요.` });
    load();
  }

  async function mark(r: Row, paid: boolean) {
    if (!d) return;
    // 취소할 때는 회원에게 보일 사유를 받는다(비워도 됨). 회원에게 바로 알림이 간다.
    let reason: string | undefined;
    if (!paid) {
      const v = window.prompt(`${r.name} 님의 입금 확인을 취소할까요?\n회원에게 알림이 가요. 사유를 적어 주세요(비워도 돼요).`, "입금 내역이 확인되지 않아요");
      if (v === null) return;
      reason = v.trim();
    }
    setBusy(r.memberId);
    const res = await api("/api/admin/dues/payments", { body: { period: d.period, memberId: r.memberId, paid, ...(reason !== undefined ? { reason } : {}) } });
    setBusy("");
    if (!res.ok) return setMsg({ tone: "bad", text: res.error });
    setMsg({ tone: "info", text: paid ? `${r.name} 님 입금을 확인했어요. 회원에게 알림을 보냈어요.` : `${r.name} 님 입금 확인을 취소하고 회원에게 알렸어요.` });
    load();
  }

  if (!d) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const targets = d.rows.filter((r) => r.target);
  const paid = targets.filter((r) => r.paid);
  const notices = d.rows.filter((r) => !r.paid && r.notice);
  const total = targets.reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const got = d.rows.filter((r) => r.paid).reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const word = q.trim();
  const shown = d.rows
    .filter((r) => (only === "paid" ? r.paid : only === "unpaid" ? !r.paid : only === "notice" ? !r.paid && !!r.notice : true))
    .filter((r) => !word || r.name.includes(word))
    // 입금 알림 먼저, 그다음 미입금, 입금 순
    .sort((a, b) => Number(!!b.notice && !b.paid) - Number(!!a.notice && !a.paid) || Number(a.paid) - Number(b.paid) || a.name.localeCompare(b.name, "ko"));

  const stat = (k: string, v: string, c?: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
      <dt className="small" style={{ margin: 0, fontSize: fs(12) }}>{k}</dt>
      <dd className="num" style={{ margin: 0, fontWeight: 700, color: c, whiteSpace: "nowrap" }}>{v}</dd>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="small" style={{ margin: 0, fontSize: fs(12) }}>
        회원마다 낼 모임 회비(회비설정 기준)와 입금 여부를 관리해요. 회원이 게시판의 모임회비 공지에서 “입금했어요”를 누르면 <b>입금 알림</b>이 오고, 여기서 <b>입금 확인</b>을 누르면 끝나요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="small" htmlFor="dp-period" style={{ fontSize: fs(12) }}>기간</label>
        <select id="dp-period" className="field" style={{ width: "auto", minHeight: 36, fontSize: fs(13) }} value={d.period} onChange={(e) => setPeriod(e.target.value)}>
          {d.periods.filter((p) => !thisYear || p.value.slice(0, 4) >= thisYear || p.value === d.period).map((p) => <option key={p.value} value={p.value}>{p.label}{p.value === d.current ? " (지금)" : ""}{thisYear && p.value.slice(0, 4) < thisYear ? " · 과거 내역" : ""}</option>)}
          {d.duesPeriod === "monthly" && !d.periods.some((p) => p.value === d.period) && <option value={d.period}>{d.periodLabel}</option>}
        </select>
        {d.duesPeriod === "monthly" && (
          <input type="month" className="field" aria-label="다른 달 고르기" style={{ width: "auto", minHeight: 36, fontSize: fs(13) }} value={/^\d{4}-\d{2}$/.test(d.period) ? d.period : ""}
            onChange={(e) => e.target.value && setPeriod(e.target.value)} />
        )}
        {pastBtn}
      </div>

      <section className="card" style={{ padding: 12 }} aria-label="입금 요약">
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 12px", fontSize: fs(13) }}>
          {stat("입금액", won(got), "var(--green-t)")}
          {/* 미입금 총액: 입금이 확인되지 않은 대상 회원의 회비를 더한 것 */}
          {stat("미입금 총액", won(targets.filter((r) => !r.paid).reduce((n, r) => n + (Number(r.amount) || 0), 0)), "var(--red-t)")}
        </dl>
      </section>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="보기" style={{ width: "auto", flex: "none" }}>
          {([["all", `전체 ${d.rows.length}`], ["paid", `입금 ${d.rows.filter((r) => r.paid).length}`], ["unpaid", `미입금 ${d.rows.filter((r) => !r.paid).length}`], ["notice", `입금 알림 ${notices.length}`]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} style={{ minHeight: 34, fontSize: fs(12), padding: "0 10px" }}>{l}</button>
          ))}
        </div>
        <input className="field" type="search" placeholder="이름으로 찾기" aria-label="이름으로 찾기" style={{ flex: "0 1 130px", width: "auto", minWidth: 90, minHeight: 34, fontSize: fs(13) }} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {targets.length === 0 && <div className="msg info">회비를 낼 회원이 없어요. 회비설정에서 금액을 정해 주세요.</div>}
      {shown.length > 0 && (
        <div className="tblw">
          <table className="tbl compact stack" style={{ minWidth: 560 }}>
            <thead><tr><th>이름</th><th>구분</th><th>금액</th><th>상태</th><th>확인</th><th><span className="sr-only">버튼</span></th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.memberId}>
                  <td data-label=""><b>{r.name}</b>{r.position && r.position !== "-" ? <span className="small"> · {r.position}</span> : null}</td>
                  <td data-label="" className="small">{r.kind}{!r.target && " (대상 아님)"}</td>
                  <td data-label="금액" className="num">{won(r.amount)}</td>
                  <td data-label="">
                    {r.paid ? <span className="pill ok">입금</span> : r.notice ? <span className="pill blue">입금 알림 {fmtDate(r.notice)}</span> : <span className="pill warn">미입금</span>}
                  </td>
                  <td data-label="확인" className="small">{r.paid ? `${fmtDate(r.paidAt)}${r.checkedBy ? ` · ${r.checkedBy}` : ""}` : "-"}</td>
                  <td className="act" data-label="">
                    <button className={r.paid ? "mini" : "btn"} type="button" disabled={busy === r.memberId}
                      style={r.paid ? { minHeight: 32, fontSize: fs(12) } : { width: "auto", minHeight: 32, padding: "0 10px", fontSize: fs(12) }}
                      onClick={() => mark(r, !r.paid)}>{r.paid ? "확인 취소" : "입금 확인"}</button>
                    {!r.paid && r.notice && <button className="mini danger" type="button" disabled={busy === r.memberId} style={{ minHeight: 32, fontSize: fs(12), marginLeft: 4 }} onClick={() => rejectNotice(r)}>입금 안 됨</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.rows.length > 0 && shown.length === 0 && <div className="msg info">해당하는 회원이 없어요.</div>}
    </div>
  );
}

// 주소: ?period=2026-11(그 회차의 기간별) · ?view=total&year=2025(그 해 누적, 회비내역에서 누름)
export default function DuesPaymentsPage({ searchParams }: { searchParams: Promise<{ period?: string; view?: string; year?: string }> }) {
  const { period, view, year } = use(searchParams);
  return <AdminGate mode="group" need={["group"]} active="/admin/dues/payments"><PaymentsPage initial={period ?? ""} initView={view ?? ""} initYear={/^\d{4}$/.test(year ?? "") ? year! : ""} /></AdminGate>;
}
