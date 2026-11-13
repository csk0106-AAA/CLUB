"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { CarpoolPanel } from "@/components/CarpoolPanel";
import { EventActivities } from "@/components/EventActivities";
import { EventItems } from "@/components/EventItems";
import { GroupsPanel } from "@/components/GroupsPanel";
import { RoomsPanel } from "@/components/RoomsPanel";
import { api, fmtWhen, won } from "@/lib/client";
import type { FeeRule } from "@/lib/fee";

type Ev = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string; booking: string;
  status: string; published: string; fee: string; feeDeadline: string; account: string; accountHolder?: string;
  feeRules?: FeeRule[];
};
type Row = {
  memberId: string; name: string; kind: string; position: string; answer: string; days: string; paid: boolean; paidAt: string; memo: string; payNotice: string;
  fee: string; feePending: boolean; // 이 회원이 낼 회비(조건 반영), 날짜를 골라야 정해지면 feePending
};

const TABS = [
  { key: "over", label: "개요" },
  { key: "apply", label: "참석 신청" },
  { key: "fee", label: "회비" },
  { key: "act", label: "활동" },
  { key: "sched", label: "일정" },
  { key: "prep", label: "준비 목록" },
  { key: "cost", label: "비용" },
  { key: "group", label: "조편성" },
  { key: "car", label: "카풀" },
  { key: "room", label: "숙박·방배정" },
];
const dayText = (days: string) =>
  days ? days.split(",").map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join(", ") : "";

function Detail({ id }: { id: string }) {
  const [ev, setEv] = useState<Ev | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState("over");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [canEditActs, setCanEditActs] = useState(false);
  const [editRow, setEditRow] = useState<{ memberId: string; answer: string; memo: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [announced, setAnnounced] = useState(false);
  const [actNames, setActNames] = useState<string[]>([]);
  const [opts, setOpts] = useState<{ kinds: string[]; positions: string[] }>({ kinds: [], positions: [] });

  useEffect(() => {
    api<{ perms: string[] }>("/api/me").then((r) => {
      if (r.ok) setCanEditActs(r.data.perms.includes("all") || r.data.perms.includes("activities"));
    });
  }, []);

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([
      api<{ event: Ev; rows: Row[]; options: { kinds: string[]; positions: string[] } }>(`/api/admin/events/${id}`),
      api<{ activities: { config: { name: string } }[] }>(`/api/admin/events/${id}/activities`),
    ]);
    if (r.ok) {
      setEv(r.data.event);
      setRows(r.data.rows);
      setOpts(r.data.options);
    } else setMsg({ tone: "bad", text: r.error });
    if (a.ok) setActNames(a.data.activities.map((x) => x.config.name));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!ev) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const set = (k: keyof Ev, v: string) => setEv({ ...ev, [k]: v });

  async function save(published?: boolean) {
    if (!ev) return;
    setBusy(true);
    setMsg(null);
    const { id: _id, type: _t, published: _p, ...fields } = ev;
    void _id; void _t; void _p;
    const r = await api(`/api/admin/events/${id}`, {
      method: "PATCH",
      body: { ...fields, ...(published === undefined ? {} : { published }) },
    });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: published === true ? "회원에게 전달했어요. 이제 회원 화면에 보여요." : published === false ? "공개를 취소했어요." : "저장했어요." });
    load();
  }

  async function pay(memberId: string, paid: boolean) {
    const r = await api(`/api/admin/events/${id}/pay`, { body: { memberId, paid } });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: paid ? "입금을 확인했어요. 회원 화면의 회비 알림이 사라져요." : "입금 확인을 취소했어요." });
    load();
  }

  async function saveRow() {
    if (!editRow) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${id}/apply`, { body: editRow });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "참석 신청을 고쳤어요." });
    setEditRow(null);
    load();
  }

  // 행사 공지 문구(단체 대화방용). 계좌는 참석 신청자에게만 앱에서 보여 주므로 넣지 않는다.
  async function copyAnnounce() {
    if (!ev) return;
    const lines = [
      `[${ev.type}] ${ev.name}`,
      `· 일시: ${ev.startsAt ? fmtWhen(ev.startsAt, ev.endsAt, "").replace(/ · $/, "") : "추후 안내"}`,
      ev.place ? `· 장소: ${ev.place}` : "",
      actNames.length ? `· 주요 활동: ${actNames.join(", ")}` : "",
      ev.feeRules?.length
        ? `· 참가비: 참석일·회원구분에 따라 달라요(앱에서 내 회비 확인)${ev.feeDeadline ? ` · 입금 기한 ${ev.feeDeadline}` : ""}`
        : ev.fee ? `· 참가비: 1인 ${won(ev.fee)}${ev.feeDeadline ? ` (입금 기한 ${ev.feeDeadline})` : ""}` : "",
      "",
      `원우회 앱에서 참석 여부를 알려 주세요 👉 ${window.location.origin}`,
      "로그인: 내 이름 선택 + 연락처 뒷자리 4자리",
    ].filter((x, i) => x !== "" || i === 5);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setAnnounced(true);
      setTimeout(() => setAnnounced(false), 1800);
    } catch {
      setMsg({ tone: "bad", text: "복사하지 못했어요. 브라우저에서 클립보드 사용을 허용해 주세요." });
    }
  }

  // 미응답 회원에게 보낼 안내 문구를 복사한다(단체 대화방 등에 붙여 넣기).
  async function copyReminder(names: string[]) {
    if (!ev) return;
    const when = ev.startsAt ? ` (${ev.startsAt.slice(5, 10).replace("-", "/")})` : "";
    const text = `[${ev.name}${when}] 참석 여부를 알려 주세요.\n${names.join(", ")} 님, 원우회 앱에서 “참석 신청하기” 또는 “참석 안함”을 눌러 주세요. 고맙습니다.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setMsg({ tone: "bad", text: "복사하지 못했어요. 브라우저에서 클립보드 사용을 허용해 주세요." });
    }
  }

  const attend = rows.filter((r) => r.answer === "참석");
  const absent = rows.filter((r) => r.answer === "불참");
  const noAns = rows.filter((r) => r.answer === "");
  const paid = attend.filter((r) => r.paid);
  const feeNum = Number(ev.fee) || 0;
  const rules = ev.feeRules ?? [];
  const setRules = (next: FeeRule[]) => setEv({ ...ev, feeRules: next });
  // 참석일 선택지: 행사 기간(최대 7일)
  const dayCount = (() => {
    const a = ev.startsAt?.slice(0, 10);
    const b = (ev.endsAt || ev.startsAt)?.slice(0, 10);
    return a && b ? Math.min(7, Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1)) : 2;
  })();
  const owed = (r: Row) => Number(r.fee) || 0;
  const totalOwed = attend.reduce((n, r) => n + owed(r), 0);
  const totalPaid = paid.reduce((n, r) => n + owed(r), 0);
  // 참석자 회비 분포 (예: 150,000원 8명 · 70,000원 3명)
  const dist = [...attend.reduce((m, r) => m.set(r.feePending ? "날짜 선택 전" : r.fee ? won(r.fee) : "회비 없음", (m.get(r.feePending ? "날짜 선택 전" : r.fee ? won(r.fee) : "회비 없음") ?? 0) + 1), new Map<string, number>())];

  return (
    <>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <Link href="/admin/events" className="mini" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>‹ 행사 목록</Link>
        <span className="pill blue">{ev.type}</span>
        <h1 className="title grow" style={{ fontSize: 24 }}>{ev.name}</h1>
        <span className={`pill ${ev.published === "true" ? "ok" : "gray"}`}>{ev.published === "true" ? "회원에게 공개 중" : "초안"}</span>
      </div>

      <div className="tabsx" role="tablist" aria-label="행사 관리 메뉴">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      {tab === "over" && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="grid2">
            <div><label className="l" htmlFor="o-name">행사 이름</label><input id="o-name" className="field" value={ev.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-place">장소</label><input id="o-place" className="field" value={ev.place} onChange={(e) => set("place", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-start">시작 일시</label><input id="o-start" className="field" type="datetime-local" value={ev.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-end">끝나는 일시</label><input id="o-end" className="field" type="datetime-local" value={ev.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-book">예약 정보</label><input id="o-book" className="field" value={ev.booking} onChange={(e) => set("booking", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-status">진행 상태</label><input id="o-status" className="field" value={ev.status} onChange={(e) => set("status", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-fee">기본 회비 (숫자만, 없으면 비워 두기)</label><input id="o-fee" className="field" inputMode="numeric" value={ev.fee} onChange={(e) => set("fee", e.target.value.replace(/\D/g, ""))} /></div>
            <div><label className="l" htmlFor="o-dl">입금 기한</label><input id="o-dl" className="field" type="date" value={ev.feeDeadline} onChange={(e) => set("feeDeadline", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-acc">입금 계좌</label><input id="o-acc" className="field" value={ev.account} onChange={(e) => set("account", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-holder">예금주</label><input id="o-holder" className="field" value={ev.accountHolder ?? ""} onChange={(e) => set("accountHolder", e.target.value)} /></div>
          </div>

          {/* 조건별 회비: 참석일 / 회원구분 / 직책 */}
          <section className="card" aria-label="조건별 회비" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: "400 19px var(--display)" }}>조건별 회비 (선택)</b>
            <span className="small">
              참석일, 회원구분, 직책에 따라 회비가 다르면 줄을 추가하세요. “전체”는 조건 없음이에요. 회원에게 맞는 줄 중 <b>조건이 가장 많이 맞는 줄</b>의 금액을 쓰고,
              맞는 줄이 없으면 기본 회비를 써요. 0원은 회비 없음이에요. 회원에게는 <b>본인 회비만</b> 보여요.
            </span>
            {rules.map((r, i) => {
              const upd = (patch: Partial<FeeRule>) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ flex: "1 1 120px" }}>
                    <label className="l" htmlFor={`fr-d-${i}`}>참석일</label>
                    <select id={`fr-d-${i}`} className="field" value={r.days} onChange={(e) => upd({ days: e.target.value })}>
                      <option value="">전체</option>
                      {Array.from({ length: dayCount }, (_, d) => d + 1).map((d) => (
                        <option key={d} value={String(d)}>{d === 1 ? "1일" : `${d}일 (${d - 1}박${d}일)`}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 130px" }}>
                    <label className="l" htmlFor={`fr-k-${i}`}>회원구분</label>
                    <select id={`fr-k-${i}`} className="field" value={r.kind} onChange={(e) => upd({ kind: e.target.value })}>
                      <option value="">전체</option>
                      {[...new Set([...opts.kinds, ...(r.kind ? [r.kind] : [])])].map((k) => <option key={k}>{k}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 130px" }}>
                    <label className="l" htmlFor={`fr-p-${i}`}>직책</label>
                    <select id={`fr-p-${i}`} className="field" value={r.position} onChange={(e) => upd({ position: e.target.value })}>
                      <option value="">전체</option>
                      {[...new Set([...opts.positions, ...(r.position ? [r.position] : [])])].map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 130px" }}>
                    <label className="l" htmlFor={`fr-a-${i}`}>금액(원)</label>
                    <input id={`fr-a-${i}`} className="field" inputMode="numeric" value={r.amount} onChange={(e) => upd({ amount: e.target.value.replace(/\D/g, "") })} />
                  </div>
                  <button className="mini danger" type="button" style={{ minHeight: 54 }} onClick={() => setRules(rules.filter((_, j) => j !== i))}>삭제</button>
                </div>
              );
            })}
            <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: 17 }}
              onClick={() => setRules([...rules, { days: "", kind: "", position: "", amount: "" }])}>
              + 조건 추가
            </button>
            {rules.some((r) => !r.amount) && <span className="small" style={{ color: "var(--red-t)" }}>금액이 빈 줄이 있어요. 금액을 넣거나 줄을 삭제해 주세요.</span>}
            {dist.length > 0 && <span className="small">현재 참석자 회비(저장 기준): {dist.map(([k, n]) => `${k} ${n}명`).join(" · ")}</span>}
          </section>
          <div>
            <span className="l">주요 활동 (활동 탭에서 고른 것이 자동으로 들어가요)</span>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              {actNames.length ? actNames.map((n) => <span key={n} className="pill blue" style={{ fontSize: 15 }}>{n}</span>) : <span className="small">아직 넣은 활동이 없어요.</span>}
            </div>
          </div>
          <div className="card" style={{ background: "var(--soft)", display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="pill gray" style={{ alignSelf: "flex-start" }}>회원에게 보이는 모습</span>
            <b style={{ font: "400 22px var(--display)" }}>{ev.name}</b>
            <div className="small">{ev.startsAt ? fmtWhen(ev.startsAt, ev.endsAt, ev.place) : "날짜가 정해지면 알려 드려요"}</div>
            {actNames.length > 0 && <div className="small">주요 활동: {actNames.join(" · ")}</div>}
            {rules.length > 0
              ? <div className="small">참가비: 회원마다 본인 회비만 보여요(참석일·회원구분·직책 기준){ev.feeDeadline ? ` · 입금 기한 ${ev.feeDeadline}` : ""}</div>
              : ev.fee && <div className="small">참가비 1인 {won(ev.fee)}{ev.feeDeadline ? ` · 입금 기한 ${ev.feeDeadline}` : ""}</div>}
            {ev.account && <div className="small">계좌 {ev.account}{ev.accountHolder ? ` (예금주 ${ev.accountHolder})` : ""} · 참석 신청한 회원에게만 보여요</div>}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn white" type="submit" disabled={busy} style={{ width: "auto", minWidth: 160 }}>임시 저장</button>
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 200 }} onClick={() => save(true)}>
              {ev.published === "true" ? "저장하고 계속 공개" : "회원에게 전달"}
            </button>
            {ev.published === "true" && <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minWidth: 160 }} onClick={() => save(false)}>공개 취소</button>}
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 200 }} onClick={copyAnnounce}>{announced ? "복사했어요 ✓" : "대화방 안내 문구 복사"}</button>
          </div>
          <span className="small">계좌번호는 참석을 신청한 회원에게만 보여요. “대화방 안내 문구 복사”는 단체 대화방에 붙여 넣을 공지를 만들어 줘요(계좌는 넣지 않아요).</span>
        </form>
      )}

      {tab === "act" && <EventActivities eventId={id} canEdit={canEditActs} />}
      {tab === "sched" && <EventItems eventId={id} kind="schedule" canEdit />}
      {tab === "prep" && <EventItems eventId={id} kind="prep" canEdit />}
      {tab === "cost" && <EventItems eventId={id} kind="costs" canEdit />}
      {tab === "group" && <GroupsPanel eventId={id} canEdit />}
      {tab === "car" && <CarpoolPanel eventId={id} canEdit />}
      {tab === "room" && <RoomsPanel eventId={id} canEdit />}

      {tab === "apply" && (
        <>
          <div className="cards">
            <div className="card"><span className="small">참석</span><div className="big" style={{ color: "var(--green-t)" }}>{attend.length}명</div></div>
            <div className="card"><span className="small">불참</span><div className="big">{absent.length}명</div></div>
            <div className="card"><span className="small">미응답</span><div className="big" style={{ color: "var(--orange-t)" }}>{noAns.length}명</div></div>
          </div>
          {noAns.length > 0 && (
            <div className="card row" style={{ flexWrap: "wrap" }}>
              <span className="grow small">미응답 {noAns.length}명: {noAns.map((r) => r.name).join(", ")}</span>
              <button className="mini" type="button" onClick={() => copyReminder(noAns.map((r) => r.name))}>{copied ? "복사했어요 ✓" : "알림 문구 복사"}</button>
            </div>
          )}
          <div className="tblw">
            <table className="tbl" style={{ minWidth: 640 }}>
              <thead><tr><th>이름</th><th>신청</th><th>참석 날짜</th><th>메모</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) =>
                  editRow?.memberId === r.memberId ? (
                    <tr key={r.memberId}>
                      <td><b>{r.name}</b></td>
                      <td>
                        <select className="field" style={{ minHeight: 44, minWidth: 110 }} aria-label={`${r.name} 신청`} value={editRow.answer}
                          onChange={(e) => setEditRow({ ...editRow, answer: e.target.value })}>
                          <option value="참석">참석</option><option value="불참">불참</option><option value="">미응답</option>
                        </select>
                      </td>
                      <td className="num">{editRow.answer === "참석" ? dayText(r.days) : ""}</td>
                      <td><input className="field" style={{ minHeight: 44 }} aria-label={`${r.name} 메모`} maxLength={200} value={editRow.memo} onChange={(e) => setEditRow({ ...editRow, memo: e.target.value })} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="mini" type="button" disabled={busy} onClick={saveRow}>저장</button>{" "}
                        <button className="mini" type="button" onClick={() => setEditRow(null)}>취소</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.memberId}>
                      <td><b>{r.name}</b></td>
                      <td><span className={`pill ${r.answer === "참석" ? "ok" : r.answer === "불참" ? "gray" : "warn"}`}>{r.answer || "미응답"}</span></td>
                      <td className="num">{dayText(r.days)}</td>
                      <td>{r.memo || <span className="small">-</span>}</td>
                      <td><button className="mini" type="button" onClick={() => setEditRow({ memberId: r.memberId, answer: r.answer, memo: r.memo })}>수정</button></td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <span className="small">전화나 메시지로 들은 답은 “수정”으로 대신 입력할 수 있어요. 참석이 아니게 바꾸면 참석 날짜와 입금 확인이 지워져요.</span>
        </>
      )}

      {tab === "fee" && (
        <>
          <div className="cards">
            <div className="card">
              <span className="small">{rules.length ? "회비 (조건별)" : "1인 회비"}</span>
              <div className="big">{rules.length ? `${rules.length}개 조건` : feeNum ? won(feeNum) : "미정"}</div>
              {rules.length > 0 && <span className="small">기본 {feeNum ? won(feeNum) : "없음"} · 개요에서 고쳐요</span>}
            </div>
            <div className="card"><span className="small">입금 완료</span><div className="big" style={{ color: "var(--green-t)" }}>{paid.length}명</div><span className="small">{won(totalPaid)} / {won(totalOwed)}</span></div>
            <div className="card"><span className="small">미입금</span><div className="big" style={{ color: "var(--red-t)" }}>{attend.length - paid.length}명</div></div>
          </div>
          <span className="small">“입금 확인”을 누르면 그 회원 화면의 회비 알림이 바로 사라져요. 미입금 회원에게는 알림이 계속 보여요.</span>
          {attend.length === 0 && <div className="msg info">아직 참석을 신청한 회원이 없어요.</div>}
          {attend.length > 0 && (
            <div className="tblw">
              <table className="tbl" style={{ minWidth: 520 }}>
                <thead><tr><th>이름</th><th>금액</th><th>입금 상태</th><th>확인일</th><th></th></tr></thead>
                <tbody>
                  {attend.map((r) => (
                    <tr key={r.memberId}>
                      <td><b>{r.name}</b></td>
                      <td className="num">{r.feePending ? <span className="small">날짜 선택 전</span> : owed(r) ? owed(r).toLocaleString("ko-KR") : "-"}</td>
                      <td>
                        <span className={`pill ${r.paid ? "ok" : "warn"}`}>{r.paid ? "입금" : "미입금"}</span>
                        {!r.paid && r.payNotice && <span className="pill blue" style={{ marginLeft: 4 }}>입금 알림 받음 {Number(r.payNotice.slice(5, 7))}/{Number(r.payNotice.slice(8, 10))}</span>}
                      </td>
                      <td className="num">{r.paidAt}</td>
                      <td><button className="mini" type="button" onClick={() => pay(r.memberId, !r.paid)}>{r.paid ? "취소" : "입금 확인"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function EventDetailAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminGate mode="events" need={["events", "fees"]} active="/admin/events"><Detail id={id} /></AdminGate>;
}
