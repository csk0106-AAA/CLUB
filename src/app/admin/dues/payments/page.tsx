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

// 관리자 › 모임설정 › 회비입금: 기간(연회비 연도·월회비 월)별로 회원마다 낼 금액·입금 확인·입금 알림을 관리한다.
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
  return <AdminGate mode="group" need={["group"]} active="/admin/dues/payments"><Payments initial={period ?? ""} /></AdminGate>;
}
