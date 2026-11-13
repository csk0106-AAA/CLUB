"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { CarpoolPanel } from "@/components/CarpoolPanel";
import { EventActivities } from "@/components/EventActivities";
import { EventItems } from "@/components/EventItems";
import { GroupsPanel } from "@/components/GroupsPanel";
import { RoomsPanel } from "@/components/RoomsPanel";
import { DateField } from "@/components/DateField";
import { api, fmtDate, fmtDays, fmtRange, won } from "@/lib/client";
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
// 회비 줄이 "모두 전체" 한 줄뿐이면 모든 회원이 같은 금액(그 금액), 아니면 null
const oneFee = (rules?: FeeRule[]): string | null =>
  rules && rules.length === 1 && !rules[0].days && !rules[0].kind && !rules[0].position && Number(rules[0].amount) > 0 ? rules[0].amount : null;
// 행사 정보 줄(한 줄에 하나씩, 아이콘 포함). "회원에게 보이는 모습"과 대화방 안내 문구가 같이 쓴다.
// 회비가 "전체·전체·전체" 한 줄뿐(모두 같은 금액)일 때만 금액과 계좌를 보여 주고,
// 여러 줄이면 회원마다 금액이 다르므로 "앱 접속 후 내 회비 확인"만 쓴다(계좌는 앱의 회비 안내에서).
type InfoLine = { icon: string; label: string; value: string; multiline?: boolean };
function infoLines(ev: Ev, rules: FeeRule[], actNames: string[]): InfoLine[] {
  const out: InfoLine[] = [];
  out.push({ icon: "📅", label: "일시", value: fmtRange(ev.startsAt, ev.endsAt) });
  if (ev.place) out.push({ icon: "📍", label: "장소", value: ev.place });
  if (actNames.length) out.push({ icon: "🎯", label: "주요 활동", value: actNames.join(" · ") });
  const one = oneFee(rules);
  if (one) out.push({ icon: "💰", label: "참가비", value: won(one) });
  else if (rules.length) out.push({ icon: "💰", label: "참가비", value: "앱 접속 후 내 회비 확인" });
  if (rules.length && ev.feeDeadline) out.push({ icon: "⏰", label: "입금 기한", value: fmtDate(ev.feeDeadline) });
  if (one && ev.account) out.push({ icon: "🏦", label: "계좌", value: `${ev.account}${ev.accountHolder ? ` (예금주 ${ev.accountHolder})` : ""}` });
  if (ev.booking?.trim()) out.push({ icon: "📢", label: "안내", value: ev.booking.trim(), multiline: true });
  return out;
}

const dayText = (days: string) => (days ? fmtDays(days) : "");

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
      // 예전 "기본 회비"가 남아 있으면 모두 "전체"인 회비 줄로 옮겨 보여 준다(저장하면 그대로 바뀐다).
      const e = r.data.event;
      const rs = e.feeRules ?? [];
      if (e.fee && !rs.some((x) => !x.days && !x.kind && !x.position)) e.feeRules = [...rs, { days: "", kind: "", position: "", amount: e.fee }];
      setEv(e);
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
      // 기본 회비 칸은 없앴다: 회비는 모두 회비 줄(feeRules)로 저장하고 예전 fee 값은 비운다.
      body: { ...fields, fee: "", ...(published === undefined ? {} : { published }) },
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

  // 행사 공지 문구(단체 대화방용). "회원에게 보이는 모습"과 같은 순서·아이콘을 쓴다.
  // 계좌는 모든 회원 회비가 같을 때만 넣는다(infoLines 참고).
  async function copyAnnounce() {
    if (!ev) return;
    const body = infoLines(ev, rules, actNames).flatMap((x) =>
      x.multiline ? [`${x.icon} ${x.label}`,...x.value.split("\n").map((l) => `   ${l}`)] : [`${x.icon} ${x.label}: ${x.value}`],
    );
    const lines = [
      `[${ev.type}] ${ev.name}`,
      "",
      ...body,
      "",
      `원우회 앱에서 참석 여부를 알려 주세요 👉 ${window.location.origin}`,
      "로그인: 내 이름 선택 + 연락처 뒷자리 4자리",
    ];
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
    const when = ev.startsAt ? ` (${fmtDate(ev.startsAt)})` : "";
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
            <div><label className="l" htmlFor="o-start">시작 일시</label><DateField id="o-start" mode="datetime" value={ev.startsAt} onChange={(v) => set("startsAt", v)} /></div>
            <div><label className="l" htmlFor="o-end">끝나는 일시</label><DateField id="o-end" mode="datetime" value={ev.endsAt} onChange={(v) => set("endsAt", v)} /></div>
            <div><label className="l" htmlFor="o-dl">입금 기한</label><DateField id="o-dl" mode="date" value={ev.feeDeadline} onChange={(v) => set("feeDeadline", v)} /></div>
            <div><label className="l" htmlFor="o-acc">입금 계좌</label><input id="o-acc" className="field" value={ev.account} onChange={(e) => set("account", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-holder">예금주</label><input id="o-holder" className="field" value={ev.accountHolder ?? ""} onChange={(e) => set("accountHolder", e.target.value)} /></div>
          </div>

          <div>
            <label className="l" htmlFor="o-book">안내 (줄을 바꿔 여러 줄로 쓸 수 있어요)</label>
            <textarea id="o-book" className="field" rows={6} maxLength={2000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
              placeholder={"예)\n숙소: 대명 홍천 소노펠리체, 객실 10실 (예약번호 0000)\n체크인 15:00 / 체크아웃 11:00\n저녁: 18:30 ○○식당 (20명)"}
              value={ev.booking} onChange={(e) => set("booking", e.target.value)} />
            <span className="hint">{ev.booking.length}/2000자 · 회원 화면에도 줄바꿈 그대로 보여요.</span>
          </div>

          {/* 회비: 회원구분 / 직책 / 참석일 조건별 */}
          <section className="card" aria-label="회비" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: "400 19px var(--display)" }}>회비</b>
            <span className="small">
              회원구분, 직책, 참석일에 따라 금액을 정해요. 모두 “전체”인 줄은 모든 회원의 기본 회비예요. 직책의 “일반회원”은 직책이 없는 회원이에요.
              회원에게 맞는 줄 중 <b>조건이 가장 많이 맞는 줄</b>의 금액을 쓰고, 맞는 줄이 없으면 회비가 없어요. 0원도 회비 없음이에요. 회원에게는 <b>본인 회비만</b> 보여요.
            </span>
            {rules.length === 0 && <span className="small">아직 회비가 없어요. 회비를 받는 행사라면 “+ 회비 줄 추가”를 눌러 주세요.</span>}
            {rules.length > 0 && (
              <div className="tblw">
                <table className="tbl" style={{ minWidth: 620 }}>
                  <thead>
                    <tr><th>회원구분</th><th>직책</th><th>참석일</th><th>금액(원)</th><th style={{ width: 70 }}><span className="sr-only">삭제</span></th></tr>
                  </thead>
                  <tbody>
                    {rules.map((r, i) => {
                      const upd = (patch: Partial<FeeRule>) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      const sel = { minHeight: 44, padding: "0 8px" } as const;
                      return (
                        <tr key={i}>
                          <td>
                            <select className="field" style={sel} aria-label={`${i + 1}번째 줄 회원구분`} value={r.kind} onChange={(e) => upd({ kind: e.target.value })}>
                              <option value="">전체</option>
                              {[...new Set([...opts.kinds, ...(r.kind ? [r.kind] : [])])].map((k) => <option key={k}>{k}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="field" style={sel} aria-label={`${i + 1}번째 줄 직책`} value={r.position} onChange={(e) => upd({ position: e.target.value })}>
                              <option value="">전체</option>
                              {[...new Set([...opts.positions, ...(r.position ? [r.position] : [])])].map((p) => <option key={p}>{p}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="field" style={sel} aria-label={`${i + 1}번째 줄 참석일`} value={r.days} onChange={(e) => upd({ days: e.target.value })}>
                              <option value="">전체</option>
                              {Array.from({ length: dayCount }, (_, d) => d + 1).map((d) => (
                                <option key={d} value={String(d)}>{d === 1 ? "1일" : `${d}일 (${d - 1}박${d}일)`}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="field" style={sel} inputMode="numeric" aria-label={`${i + 1}번째 줄 금액`} value={r.amount} onChange={(e) => upd({ amount: e.target.value.replace(/\D/g, "") })} />
                          </td>
                          <td>
                            <button className="mini danger" type="button" aria-label={`${i + 1}번째 줄 삭제`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>삭제</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: 17 }}
              onClick={() => setRules([...rules, { days: "", kind: "", position: "", amount: "" }])}>
              + 회비 줄 추가
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
            {/* 한 줄에 정보 하나씩(대화방 안내 문구와 같은 순서·아이콘) */}
            {infoLines(ev, rules, actNames).map((x) =>
              x.multiline ? (
                <div key={x.label} className="small">
                  <div><span aria-hidden="true">{x.icon}</span> {x.label}</div>
                  <div style={{ whiteSpace: "pre-wrap", paddingLeft: 26 }}>{x.value}</div>
                </div>
              ) : (
                <div key={x.label} className="small">
                  <span aria-hidden="true">{x.icon}</span> {x.label}: {x.value}
                </div>
              ),
            )}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn white" type="submit" disabled={busy} style={{ width: "auto", minWidth: 160 }}>임시 저장</button>
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 200 }} onClick={() => save(true)}>
              {ev.published === "true" ? "저장하고 계속 공개" : "회원에게 전달"}
            </button>
            {ev.published === "true" && <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minWidth: 160 }} onClick={() => save(false)}>공개 취소</button>}
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 200 }} onClick={copyAnnounce}>{announced ? "복사했어요 ✓" : "대화방 안내 문구 복사"}</button>
          </div>
          <span className="small">“대화방 안내 문구 복사”는 위 “회원에게 보이는 모습”과 같은 내용으로 단체 대화방에 붙여 넣을 공지를 만들어 줘요. 회원마다 회비가 다르면 금액과 계좌 대신 “앱 접속 후 내 회비 확인”으로 나가요.</span>
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
              <span className="small">회비</span>
              <div className="big">{oneFee(rules) ? won(oneFee(rules) as string) : rules.length ? `${rules.length}개 줄` : "없음"}</div>
              <span className="small">{oneFee(rules) ? "모든 회원 같은 금액" : rules.length ? "회원구분·직책·참석일별" : ""} · 개요에서 고쳐요</span>
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
                        {!r.paid && r.payNotice && <span className="pill blue" style={{ marginLeft: 4 }}>입금 알림 받음 {fmtDate(r.payNotice)}</span>}
                      </td>
                      <td className="num">{fmtDate(r.paidAt)}</td>
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
