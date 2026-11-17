"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api, fmtDate, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Row = {
  memberId: string; name: string; kind: string; position: string; amount: string;
  paid: boolean; paidAt: string; notice: string; memo: string; checkedBy: string; target: boolean;
};
type Data = {
  period: string; periodLabel: string; current: string; periods: { value: string; label: string }[];
  duesPeriod: "annual" | "monthly"; account: string; holder: string; rows: Row[];
};

type Grid = {
  periods: { value: string; label: string }[]; current: string; duesPeriod: "annual" | "monthly";
  rows: { memberId: string; name: string; kind: string; amount: string; target: boolean; cells: { period: string; status: "paid" | "notice" | "none"; amount: string; at: string }[] }[];
};

// 누적 현황: 회원 × 기간 표. 칸을 누르면 그 기간 입금 확인·취소. 연회비는 해마다, 월회비는 달마다 한 칸.
function GridView({ onPick }: { onPick: (period: string) => void }) {
  const [g, setG] = useState<Grid | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    const r = await api<Grid>("/api/admin/dues/payments?view=grid");
    if (r.ok) setG(r.data);
    else setErr(r.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function toggle(row: Grid["rows"][number], c: Grid["rows"][number]["cells"][number], label: string) {
    const paid = c.status !== "paid";
    if (!window.confirm(paid ? `${row.name} 님의 ${label} 입금을 확인할까요?` : `${row.name} 님의 ${label} 입금 확인을 취소할까요?`)) return;
    setBusy(true);
    const r = await api("/api/admin/dues/payments", { body: { period: c.period, memberId: row.memberId, paid } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    load();
  }
  if (!g) return err ? <div className="msg bad" role="alert">{err}</div> : <p className="small">불러오는 중이에요…</p>;
  const short = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${p.slice(2, 4)}.${p.slice(5)}` : p);
  const rows = g.rows.filter((r) => !q.trim() || r.name.includes(q.trim()));
  // 기간마다 입금 인원
  const paidCount = g.periods.map((_, i) => g.rows.filter((r) => r.cells[i]?.status === "paid").length);
  const targetCount = g.rows.filter((r) => r.target).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="small" style={{ fontSize: fs(12) }}>
        {g.duesPeriod === "monthly" ? "월회비는 달마다(최근 12개월)" : "연회비는 해마다"} 한 칸이에요. <b style={{ color: "var(--green-t)" }}>✓</b> 입금 · <b style={{ color: "var(--blue-t)" }}>₩</b> 입금 알림(확인 전) · <b style={{ color: "var(--sub)" }}>–</b> 미입금. 칸을 누르면 입금 확인·취소, 기간 이름을 누르면 그 기간을 자세히 봐요.
      </span>
      {err && <div className="msg bad" role="alert">{err}</div>}
      <input className="field" type="search" placeholder="이름으로 찾기" aria-label="이름으로 찾기" style={{ minHeight: 34, fontSize: fs(13) }} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tblw" style={{ overflowX: "auto" }}>
        <table className="tbl compact" style={{ minWidth: 120 + g.periods.length * 52 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--soft)", zIndex: 1 }}>이름</th>
              {g.periods.map((p, i) => (
                <th key={p.value} style={{ textAlign: "center", padding: "4px 2px" }}>
                  <button type="button" className="mini" style={{ minHeight: 26, padding: "0 4px", fontSize: fs(11), fontWeight: p.value === g.current ? 800 : 600 }} title={`${p.label} 자세히 보기`} onClick={() => onPick(p.value)}>{short(p.value)}</button>
                  <span style={{ display: "block", fontSize: fs(10), fontWeight: 400 }}>{paidCount[i]}/{targetCount}</span>
                </th>
              ))}
              <th style={{ textAlign: "center" }}>미납</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const unpaid = r.target ? r.cells.filter((c) => c.status !== "paid").length : 0;
              return (
                <tr key={r.memberId}>
                  <td style={{ position: "sticky", left: 0, background: "var(--card, #fff)", zIndex: 1, whiteSpace: "nowrap" }}>
                    <b>{r.name}</b>{r.amount && <span className="small" style={{ display: "block", fontSize: fs(10) }}>{won(r.amount)}</span>}
                  </td>
                  {r.cells.map((c, i) => {
                    const label = g.periods[i].label;
                    const mark = c.status === "paid" ? "✓" : c.status === "notice" ? "₩" : "–";
                    const color = c.status === "paid" ? "var(--green-t)" : c.status === "notice" ? "var(--blue-t)" : "var(--sub)";
                    return (
                      <td key={c.period} style={{ textAlign: "center", padding: 2 }}>
                        <button type="button" disabled={busy} onClick={() => toggle(r, c, label)}
                          title={`${label}: ${c.status === "paid" ? `입금 ${c.amount ? won(c.amount) : ""} (${fmtDate(c.at)})` : c.status === "notice" ? `입금 알림 ${fmtDate(c.at)}` : "미입금"}`}
                          aria-label={`${r.name} ${label} ${c.status === "paid" ? "입금" : c.status === "notice" ? "입금 알림" : "미입금"}`}
                          style={{ width: 40, height: 30, border: "1px solid var(--line)", borderRadius: 6, background: c.status === "paid" ? "var(--green-bg, #e9f7ef)" : c.status === "notice" ? "var(--blue-bg)" : "transparent", color, fontWeight: 800, cursor: "pointer" }}>
                          {mark}
                        </button>
                      </td>
                    );
                  })}
                  <td className="num" style={{ textAlign: "center", fontWeight: 700, color: unpaid ? "var(--red-t)" : "var(--green-t)" }}>{r.target ? unpaid : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 관리자 › 모임설정 › 회비입금: 누적 현황(회원 × 기간)과 기간별(한 기간을 자세히) 두 가지로 본다.
function PaymentsPage({ initial }: { initial: string }) {
  const [view, setView] = useState<"grid" | "period">(initial ? "period" : "grid");
  const [pick, setPick] = useState(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="seg" role="group" aria-label="보기 방식" style={{ width: 220, flex: "none" }}>
        <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} style={{ minHeight: 36, fontSize: fs(13) }}>누적 현황</button>
        <button type="button" aria-pressed={view === "period"} onClick={() => setView("period")} style={{ minHeight: 36, fontSize: fs(13) }}>기간별</button>
      </div>
      {view === "grid" ? <GridView onPick={(p) => { setPick(p); setView("period"); }} /> : <Payments key={pick} initial={pick} />}
    </div>
  );
}

// 기간별: 한 기간(연회비 연도·월회비 월)의 회원마다 낼 금액·입금 확인·입금 알림
function Payments({ initial }: { initial: string }) {
  const [period, setPeriod] = useState(initial);
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [only, setOnly] = useState<"all" | "unpaid" | "notice">("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/dues/payments${period ? `?period=${encodeURIComponent(period)}` : ""}`);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setD(r.data);
  }, [period]);
  useEffect(() => {
    load();
  }, [load]);

  async function mark(r: Row, paid: boolean) {
    if (!d) return;
    if (!paid && !window.confirm(`${r.name} 님의 입금 확인을 취소할까요?`)) return;
    setBusy(r.memberId);
    const res = await api("/api/admin/dues/payments", { body: { period: d.period, memberId: r.memberId, paid } });
    setBusy("");
    if (!res.ok) return setMsg({ tone: "bad", text: res.error });
    setMsg({ tone: "info", text: paid ? `${r.name} 님 입금을 확인했어요.` : `${r.name} 님 입금 확인을 취소했어요.` });
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
    .filter((r) => (only === "unpaid" ? !r.paid : only === "notice" ? !r.paid && !!r.notice : true))
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
          {d.periods.map((p) => <option key={p.value} value={p.value}>{p.label}{p.value === d.current ? " (지금)" : ""}</option>)}
          {d.duesPeriod === "monthly" && !d.periods.some((p) => p.value === d.period) && <option value={d.period}>{d.periodLabel}</option>}
        </select>
        {d.duesPeriod === "monthly" && (
          <input type="month" className="field" aria-label="다른 달 고르기" style={{ width: "auto", minHeight: 36, fontSize: fs(13) }} value={/^\d{4}-\d{2}$/.test(d.period) ? d.period : ""}
            onChange={(e) => e.target.value && setPeriod(e.target.value)} />
        )}
        {d.account && <span className="small grow" style={{ fontSize: fs(12), textAlign: "right" }}>입금계좌 {d.account}{d.holder ? ` (${d.holder})` : ""}</span>}
      </div>

      <section className="card" style={{ padding: 12 }} aria-label="입금 요약">
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 12px", fontSize: fs(13) }}>
          {stat("입금 완료", `${paid.length} / ${targets.length}명`, "var(--green-t)")}
          {stat("입금 알림(확인 전)", `${notices.length}건`, notices.length ? "var(--blue-t)" : undefined)}
          {stat("입금액", won(got), "var(--green-t)")}
          {stat("남은 회비", won(Math.max(0, total - paid.reduce((n, r) => n + (Number(r.amount) || 0), 0))), "var(--red-t)")}
        </dl>
      </section>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="보기" style={{ width: "auto", flex: "none" }}>
          {([["all", `전체 ${d.rows.length}`], ["unpaid", `미입금 ${d.rows.filter((r) => !r.paid).length}`], ["notice", `입금 알림 ${notices.length}`]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} style={{ minHeight: 34, fontSize: fs(12), padding: "0 10px" }}>{l}</button>
          ))}
        </div>
        <input className="field" type="search" placeholder="이름으로 찾기" aria-label="이름으로 찾기" style={{ flex: "1 1 120px", width: "auto", minHeight: 34, fontSize: fs(13) }} value={q} onChange={(e) => setQ(e.target.value)} />
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

export default function DuesPaymentsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = use(searchParams);
  return <AdminGate mode="group" need={["group"]} active="/admin/dues/payments"><PaymentsPage initial={period ?? ""} /></AdminGate>;
}
