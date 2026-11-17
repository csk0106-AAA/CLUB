"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { CarpoolPanel } from "@/components/CarpoolPanel";
import { EventActivities } from "@/components/EventActivities";
import { EventItems } from "@/components/EventItems";
import { EventMinutes } from "@/components/EventMinutes";
import { GroupsPanel } from "@/components/GroupsPanel";
import { RoomsPanel } from "@/components/RoomsPanel";
import { DateField } from "@/components/DateField";
import { ObserversCard } from "@/app/events/[id]/ObserversCard";
import { EventPreview, eventInfoLines } from "@/components/EventInfoCard";
import type { SchedItem } from "@/components/ScheduleBoard";
import { readDayPlaces } from "@/lib/day-places";
import { EditorsBox } from "@/components/EditorsBox";
import { EventAudience } from "./EventAudience";
import { api, fmtDate, fmtDateDow, fmtDateTime, fmtDays, TYPE_TONE, won } from "@/lib/client";
import { isLight } from "@/lib/event-types";
import type { FeeRule } from "@/lib/fee";
import { SUPPORT_LABEL, supportTotal, type Support } from "@/lib/supports";
import { clubLabel } from "@/lib/club-label";
import { fs } from "@/lib/fs";

type Ev = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string; booking: string;
  status: string; published: string; pinned?: string; fee: string; feeDeadline: string; account: string; accountHolder?: string;
  feeRules?: FeeRule[];
  supports?: Support[]; // 지원금(연·월회비 지원, 회원 지원) — 총 예산에 더한다
  club?: string; // 소모임 일정의 소모임
  audience?: string; // 공개 대상 JSON(소모임이 아닌 일정)
  dayPlaces?: string; // 세부일정 날짜별 기본 위치 JSON
};
type Row = {
  memberId: string; name: string; kind: string; position: string; answer: string; days: string; paid: boolean; paidAt: string; memo: string; payNotice: string;
  fee: string; feePending: boolean; // 이 회원이 낼 회비(조건 반영), 날짜를 골라야 정해지면 feePending
  clubRole?: string; observer?: boolean; // 소모임 일정: 소모임 직책, 참관자
  checkedBy?: string; checkedAt?: string; // 관리자가 대신 체크한 경우 체크한 사람 이름·시각
};
type ClubOpt = { name: string; account: string; holder: string; leaders: { name: string; role: string }[] };
type Opts = { kinds: string[]; positions: string[]; clubs: ClubOpt[]; dues: { account: string; holder: string } };

const TABS = [
  { key: "over", label: "개요" },
  { key: "minutes", label: "회의록" }, // 회의 일정만
  { key: "apply", label: "신청현황" },
  { key: "fee", label: "회비" },
  { key: "act", label: "활동" },
  { key: "sched", label: "세부일정" },
  { key: "prep", label: "준비목록" },
  { key: "cost", label: "비용" },
  { key: "group", label: "조편성" },
  { key: "car", label: "카풀" },
  { key: "room", label: "숙박·방배정" },
];
// 회의·미팅은 회비·활동·비용·조편성·카풀·숙박이 필요 없다. 회의록 탭은 회의 일정에만.
const LIGHT_TABS = ["over", "minutes", "apply", "sched", "prep"];
const tabsFor = (type: string) => TABS.filter((t) => (t.key === "minutes" ? type === "회의" : !isLight(type) || LIGHT_TABS.includes(t.key)));
// 일정 정보 줄과 "회원에게 보이는 모습" 카드는 회원 화면(일정 개요·일정 홈)과 같은 코드(EventInfoCard)를 쓴다.
// 회비가 "전체·전체·전체" 한 줄뿐(모두 같은 금액)일 때만 금액과 계좌를 보여 주고, 여러 줄이면 "앱 접속 후 내 회비 확인"(회원은 본인 회비만 봐요).

const dayText = (days: string) => (days ? fmtDays(days) : "");
// 소모임 일정 참석 현황의 이름 옆 표시: 회장(소모임 직책) / 참관자
const tags = (r: Row) => (
  <>
    {r.clubRole && <span className="pill ok" style={{ marginLeft: 6 }}>{r.clubRole}</span>}
    {r.observer && <span className="pill blue" style={{ marginLeft: 6 }}>참관자</span>}
  </>
);

function Detail({ id }: { id: string }) {
  const [ev, setEv] = useState<Ev | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState("over");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [canEditActs, setCanEditActs] = useState(false);
  const [editRow, setEditRow] = useState<{ memberId: string; answer: string; memo: string; days: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [announced, setAnnounced] = useState(false);
  const [actNames, setActNames] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<SchedItem[]>([]); // 세부 일정(미리보기용)
  const [opts, setOpts] = useState<Opts>({ kinds: [], positions: [], clubs: [], dues: { account: "", holder: "" } });
  const [prefilled, setPrefilled] = useState("");
  const [canDelete, setCanDelete] = useState(false); // 일정관리 권한자·만든 사람만 삭제
  const router = useRouter();

  useEffect(() => {
    api<{ perms: string[] }>("/api/me").then((r) => {
      if (r.ok) setCanEditActs(r.data.perms.includes("all") || r.data.perms.includes("templates") || r.data.perms.includes("events"));
    });
  }, []);

  const load = useCallback(async () => {
    const [r, a, sc] = await Promise.all([
      api<{ event: Ev; rows: Row[]; options: Opts; canDelete?: boolean }>(`/api/admin/events/${id}`),
      api<{ activities: { config: { name: string } }[] }>(`/api/admin/events/${id}/activities`),
      api<{ items: SchedItem[] }>(`/api/admin/events/${id}/items/schedule`),
    ]);
    if (sc.ok) setSchedule(sc.data.items.map((i) => ({ at: String(i.at ?? ""), title: String(i.title ?? ""), place: i.place ?? "", memo: i.memo ?? "" })));
    if (r.ok) {
      // 예전 "기본 회비"가 남아 있으면 모두 "전체"인 회비 줄로 옮겨 보여 준다(저장하면 그대로 바뀐다).
      const e = r.data.event;
      const rs = e.feeRules ?? [];
      if (e.fee && !rs.some((x) => !x.days && !x.kind && !x.position)) e.feeRules = [...rs, { days: "", kind: "", position: "", amount: e.fee }];
      // 입금계좌가 비어 있으면 소모임 계좌(소모임 일정) 또는 모임회비관리 계좌를 미리 넣는다(저장해야 반영).
      setPrefilled("");
      if (!e.account && !e.accountHolder) {
        const c = e.club ? r.data.options.clubs.find((x) => x.name === e.club) : undefined;
        const src = e.club ? (c ? { account: c.account, holder: c.holder } : null) : r.data.options.dues;
        if (src && (src.account || src.holder)) {
          e.account = src.account;
          e.accountHolder = src.holder;
          setPrefilled(e.club ? `${e.club} 소모임 계좌를 미리 넣었어요. 저장하면 반영돼요.` : "모임회비관리의 입금계좌를 미리 넣었어요. 저장하면 반영돼요.");
        }
      }
      setEv(e);
      setCanDelete(!!r.data.canDelete);
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
  const light = isLight(ev.type); // 회의·미팅: 회비·활동 칸 없음
  const curClub = ev.club ? opts.clubs.find((c) => c.name === ev.club) : undefined;
  // 소모임을 고르면 그 소모임의 입금계좌·예금주를 넣는다(소모임 계좌가 없으면 지금 값을 둔다).
  function pickClub(name: string) {
    if (!ev) return;
    const c = opts.clubs.find((x) => x.name === name);
    if (c && (c.account || c.holder)) {
      setEv({ ...ev, club: name, account: c.account, accountHolder: c.holder });
      setPrefilled(`${name} 소모임 계좌를 넣었어요. 저장하면 반영돼요.`);
    } else {
      setEv({ ...ev, club: name });
      setPrefilled("");
    }
  }
  // 일정 기간의 날짜 목록(참석 날짜 고르기용, 최대 7일)
  const evDays = (() => {
    const a = ev.startsAt?.slice(0, 10);
    const b = (ev.endsAt || ev.startsAt)?.slice(0, 10);
    const out: string[] = [];
    if (!a || !b) return out;
    for (let t = Date.parse(`${a}T00:00:00Z`); t <= Date.parse(`${b}T00:00:00Z`) && out.length < 7; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
    return out;
  })();

  async function save(published?: boolean) {
    if (!ev) return;
    setBusy(true);
    setMsg(null);
    // 참관자는 신청현황 탭에서 따로 저장하고, 공개 대상(audience)은 이 화면에서 바꾸지 않는다.
    // 맨 위 고정(pinned)은 스위치를 누를 때 바로 저장한다.
    // 준비목록·비용 "회원에게 보이기"는 각 탭에서 따로 저장한다(여기서는 보내지 않는다)
    const { id: _id, type: _t, published: _p, observers: _o, audience: _a, pinned: _pin, showPrep: _sp, showCosts: _sc, ...fields } = ev as Ev & { observers?: unknown; audience?: unknown; showPrep?: unknown; showCosts?: unknown };
    void _id; void _t; void _p; void _o; void _a; void _pin; void _sp; void _sc;
    const r = await api(`/api/admin/events/${id}`, {
      method: "PATCH",
      // 기본 회비 칸은 없앴다: 회비는 모두 회비 줄(feeRules)로 저장하고 예전 fee 값은 비운다.
      body: { ...fields, fee: "", ...(published === undefined ? {} : { published }) },
    });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: published === true ? (ev?.published === "true" ? "저장했어요. 공개 상태 그대로 회원 화면에 반영돼요." : "공개하고 회원에게 전달했어요. 이제 회원 화면에 보여요.") : published === false ? "공개를 취소했어요. 다시 초안이에요." : "저장했어요." });
    load();
  }

  // 회원 일정 목록 맨 위 고정: 누르면 바로 저장(회원 알림은 보내지 않는다)
  async function removeEvent() {
    if (!ev) return;
    if (!window.confirm(`“${ev.name}” 일정을 지울까요?\n참석 신청·회비·세부일정·활동 기록도 함께 지워지고 되돌릴 수 없어요.`)) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    router.replace(ev.club ? `/admin/clubs/${encodeURIComponent(ev.club)}?tab=events` : "/admin/events");
  }

  async function togglePin(next: boolean) {
    if (!ev) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${id}`, { method: "PATCH", body: { pinned: next } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setEv({ ...ev, pinned: String(next) });
    setMsg({ tone: "info", text: next ? "회원 일정 목록 맨 위에 고정했어요." : "맨 위 고정을 풀었어요." });
  }

  async function pay(memberId: string, paid: boolean) {
    const r = await api(`/api/admin/events/${id}/pay`, { body: { memberId, paid } });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: paid ? "입금을 확인했어요. 회원 화면의 회비 알림이 사라져요." : "입금 확인을 취소했어요." });
    load();
  }

  // 신청현황의 "참석" 체크: 누르면 그 줄이 고치기 모양으로 열린다(참석이면 참석일을 고르고 "저장").
  // 하루 일정은 그날이 미리 골라져 있다. 체크를 풀면 미응답으로 고쳐 두고 "저장"을 누르면 반영된다.
  function quickAttend(r: Row, on: boolean) {
    const cur = r.days ? r.days.split(",").filter(Boolean) : [];
    setEditRow({
      memberId: r.memberId,
      answer: on ? "참석" : "",
      memo: r.memo,
      days: on ? (cur.length ? cur : evDays.length === 1 ? evDays : []) : [],
    });
    setMsg(null);
  }

  async function saveRow() {
    if (!editRow) return;
    if (editRow.answer === "참석" && evDays.length > 1 && editRow.days.length === 0) {
      return window.alert("참석 날짜를 하나 이상 골라 주세요.");
    }
    setBusy(true);
    const r = await api(`/api/admin/events/${id}/apply`, { body: editRow });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "참석 신청을 고쳤어요." });
    setEditRow(null);
    load();
  }

  // 일정 공지 문구(단체 대화방용). "회원에게 보이는 모습"과 같은 순서·아이콘을 쓴다.
  // 계좌는 모든 회원 회비가 같을 때만 넣는다(infoLines 참고).
  async function copyAnnounce() {
    if (!ev) return;
    const body = eventInfoLines(infoEv, { kind: "rules", rules }, actNames).flatMap((x) =>
      x.multiline ? [`${x.icon} ${x.label}`,...x.value.split("\n").map((l) => `   ${l}`)] : [`${x.icon} ${x.label}: ${x.value}`],
    );
    const lines = [
      `[${ev.type}] ${ev.name}`,
      "",
      ...body,
      "",
      "모임 앱에서 참석 여부를 알려 주세요.",
      "로그인: 내 이름 선택 + 연락처 뒷자리 4자리",
      "",
      // 맨 마지막: 이 일정 바로가기(로그인하면 바로 이 일정 화면이 열려요)
      `👉 일정 바로가기: ${window.location.origin}/events/${id}`,
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
    const text = `[${ev.name}${when}] 참석 여부를 알려 주세요.\n${names.join(", ")} 님, 모임 앱에서 “참석 신청하기” 또는 “참석 안함”을 눌러 주세요. 고맙습니다.`;
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
  // 회원 화면과 같은 정보 카드용(소모임 일정이면 회장 등 직책자도 함께)
  const infoEv = { ...ev, clubLeaders: curClub?.leaders };
  const setRules = (next: FeeRule[]) => setEv({ ...ev, feeRules: next });
  const supports = ev.supports ?? [];
  const setSupports = (next: Support[]) => setEv({ ...ev, supports: next });
  // 참석일 선택지: 일정 기간(최대 7일)
  const dayCount = (() => {
    const a = ev.startsAt?.slice(0, 10);
    const b = (ev.endsAt || ev.startsAt)?.slice(0, 10);
    return a && b ? Math.min(7, Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1)) : 2;
  })();
  const owed = (r: Row) => Number(r.fee) || 0;
  const totalOwed = attend.reduce((n, r) => n + owed(r), 0);
  const totalPaid = paid.reduce((n, r) => n + owed(r), 0);
  // 총 예산 = 참석자 회비 합계 + 지원금(연·월회비 지원 + 회원 지원)
  const supDues = supportTotal(supports.filter((x) => x.kind === "dues"));
  const supMember = supportTotal(supports.filter((x) => x.kind === "member"));
  const totalBudget = totalOwed + supDues + supMember;
  // 참석자 회비 분포 (예: 150,000원 8명 · 70,000원 3명)
  const dist = [...attend.reduce((m, r) => m.set(r.feePending ? "날짜 선택 전" : r.fee ? won(r.fee) : "회비 없음", (m.get(r.feePending ? "날짜 선택 전" : r.fee ? won(r.fee) : "회비 없음") ?? 0) + 1), new Map<string, number>())];

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className={`chip ${TYPE_TONE[ev.type] === "gray" || !TYPE_TONE[ev.type] ? "line" : TYPE_TONE[ev.type]}`}>{ev.type}</span>
          <span className={`chip ${ev.published === "true" ? "violet" : "gray"}`}>{ev.published === "true" ? "공개" : "초안"}</span>
          {/* 소모임 일정은 소모임관리 › 그 소모임 › 소모임일정관리로 돌아간다 */}
          <Link href={ev.club ? `/admin/clubs/${encodeURIComponent(ev.club)}?tab=events` : "/admin/events"} style={{ marginLeft: "auto", fontSize: fs(13), textDecoration: "none", minHeight: 32, display: "inline-flex", alignItems: "center" }}>
            {ev.club ? `‹ ${ev.club} 일정 목록` : "‹ 일정 목록"}
          </Link>
          {ev.published === "true" && (
            <Link href={`/events/${id}`} style={{ fontSize: fs(13), textDecoration: "none", minHeight: 32, display: "inline-flex", alignItems: "center" }}>
              회원 화면에서 보기 ›
            </Link>
          )}
        </div>
        <h1 className="title" style={{ overflowWrap: "anywhere" }}>{ev.name}</h1>
      </div>

      <div className="tabsx" role="tablist" aria-label="일정 관리 메뉴">
        {tabsFor(ev.type).map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      {tab === "over" && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {ev.type === "소모임" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="l" htmlFor="o-club" style={{ margin: 0 }}>소모임</label>
              <select id="o-club" className="field" value={ev.club ?? ""} onChange={(e) => pickClub(e.target.value)}>
                <option value="">소모임을 고르지 않음 (전체 회원에게 보임)</option>
                {[...new Set([...opts.clubs.map((c) => c.name), ...(ev.club ? [ev.club] : [])])].map((c) => <option key={c}>{c}</option>)}
              </select>
              {curClub && (
                <span className="small">
                  {curClub.leaders.length ? curClub.leaders.map((l) => `${l.role}: ${l.name}`).join(" · ") : "회장을 아직 정하지 않았어요"}
                  {" · "}참석 신청 대상은 {curClub.name} 회원이고, 회장이 참관자를 더할 수 있어요.
                </span>
              )}
              {ev.club && !curClub && <span className="small" style={{ color: "var(--red-t)" }}>“{ev.club}” 소모임이 목록에 없어요. 다른 소모임을 골라 주세요.</span>}
            </div>
          )}
          <div className="card switchrow">
            <span className="grow">
              <b id="o-pin-l">회원 일정 목록 맨 위에 고정</b>
              <span className="small" style={{ display: "block" }} id="o-pin-d">켜면 회원의 일정 목록에서 가장 먼저 보여요. 누르면 바로 저장돼요.</span>
            </span>
            <button type="button" role="switch" className="switch" aria-checked={ev.pinned === "true"} aria-labelledby="o-pin-l" aria-describedby="o-pin-d"
              disabled={busy} onClick={() => togglePin(ev.pinned !== "true")} />
          </div>
          {!ev.club && <EventAudience key={ev.id} eventId={id} audience={ev.audience} onSaved={load} />}
          {prefilled && <div className="msg info" role="status">{prefilled}</div>}
          <div className="grid2">
            <div><label className="l" htmlFor="o-name">일정 이름</label><input id="o-name" className="field" value={ev.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-place">장소</label><input id="o-place" className="field" value={ev.place} onChange={(e) => set("place", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-start">시작 일시</label><DateField id="o-start" mode="datetime" value={ev.startsAt} onChange={(v) => set("startsAt", v)} /></div>
            <div><label className="l" htmlFor="o-end">끝나는 일시</label><DateField id="o-end" mode="datetime" value={ev.endsAt} onChange={(v) => set("endsAt", v)} /></div>
          </div>

          <div>
            <label className="l" htmlFor="o-book">안내 (줄을 바꿔 여러 줄로 쓸 수 있어요)</label>
            <textarea id="o-book" className="field" rows={6} maxLength={2000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
              placeholder={"예)\n숙소: 대명 홍천 소노펠리체, 객실 10실 (예약번호 0000)\n체크인 15:00 / 체크아웃 11:00\n저녁: 18:30 ○○식당 (20명)"}
              value={ev.booking} onChange={(e) => set("booking", e.target.value)} />
            <span className="hint">{ev.booking.length}/2000자 · 회원 화면에도 줄바꿈 그대로 보여요.</span>
          </div>

          {/* 편집자: 만든 사람(또는 일정관리)이 이 일정 종류를 만들 권한이 있는 회원 중에서 추가 */}
          <EditorsBox endpoint={`/api/admin/events/${id}/editors`} what="일정" need={`${ev.type} 일정을 만들 권한`} />
          <EventPreview ev={infoEv} rules={rules} actNames={actNames} schedule={schedule} dayPlaces={readDayPlaces(ev.dayPlaces)} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn white" type="submit" disabled={busy} style={{ width: "auto", minWidth: 160 }}>임시 저장</button>
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 200 }} onClick={() => save(true)}>
              {ev.published === "true" ? "저장 (공개 유지)" : "공개 및 회원전달"}
            </button>
            {ev.published === "true" && <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minWidth: 160 }} onClick={() => save(false)}>공개 취소</button>}
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 200 }} onClick={copyAnnounce}>{announced ? "복사했어요 ✓" : "대화방 안내 문구 복사"}</button>
          </div>
          <span className="small">“대화방 안내 문구 복사”는 위 “회원에게 보이는 모습”과 같은 내용으로 단체 대화방에 붙여 넣을 공지를 만들어 줘요. 회원마다 회비가 다르면 금액과 계좌 대신 “앱 접속 후 내 회비 확인”으로 나가요.</span>
          {canDelete && (
            <div className="row" style={{ flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
              <span className="small grow" style={{ minWidth: 200 }}>일정을 지우면 참석 신청·회비·세부일정·활동 기록도 함께 지워지고 되돌릴 수 없어요. 회원에게만 감추려면 “공개 취소”를 쓰세요.</span>
              <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minWidth: 160 }} onClick={removeEvent}>일정 삭제</button>
            </div>
          )}
        </form>
      )}

      {tab === "minutes" && ev.type === "회의" && <EventMinutes eventId={id} admin />}
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
              <thead><tr><th>참석</th><th>이름</th><th>신청</th><th>참석 날짜</th><th>메모</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) =>
                  editRow?.memberId === r.memberId ? (
                    <tr key={r.memberId} style={{ background: "var(--soft)" }}>
                      <td className="center">
                        <input type="checkbox" checked={editRow.answer === "참석"} style={{ width: 22, height: 22, cursor: "pointer" }} aria-label={`${r.name} 참석 체크`}
                          onChange={(e) => setEditRow({ ...editRow, answer: e.target.checked ? "참석" : "", days: e.target.checked ? (evDays.length === 1 ? evDays : editRow.days) : [] })} />
                      </td>
                      <td><b>{r.name}</b>{tags(r)}</td>
                      <td>
                        <select className="field" style={{ minHeight: 44, minWidth: 110 }} aria-label={`${r.name} 신청`} value={editRow.answer}
                          onChange={(e) => setEditRow({ ...editRow, answer: e.target.value })}>
                          <option value="참석">참석</option><option value="불참">불참</option><option value="">미응답</option>
                        </select>
                      </td>
                      <td>
                        {editRow.answer === "참석" ? (
                          <div className="checks" role="group" aria-label={`${r.name} 참석 날짜`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                            {evDays.map((d) => (
                              <label key={d} style={{ minHeight: 40 }}>
                                <input type="checkbox" checked={editRow.days.includes(d)}
                                  onChange={(e) => setEditRow({ ...editRow, days: e.target.checked ? [...editRow.days, d].sort() : editRow.days.filter((x) => x !== d) })} />
                                {fmtDateDow(d)}
                              </label>
                            ))}
                            {evDays.length > 1 && editRow.days.length === 0 && <span className="small" style={{ color: "var(--red-t)" }}>참석일을 골라 주세요</span>}
                          </div>
                        ) : <span className="small">-</span>}
                      </td>
                      <td><input className="field" style={{ minHeight: 44 }} aria-label={`${r.name} 메모`} maxLength={200} value={editRow.memo} onChange={(e) => setEditRow({ ...editRow, memo: e.target.value })} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="mini" type="button" disabled={busy} onClick={saveRow}>저장</button>{" "}
                        <button className="mini" type="button" onClick={() => setEditRow(null)}>취소</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.memberId}>
                      <td className="center">
                        <input type="checkbox" checked={r.answer === "참석"} disabled={busy || !!editRow} onChange={(e) => quickAttend(r, e.target.checked)}
                          style={{ width: 22, height: 22, cursor: "pointer" }} aria-label={`${r.name} 참석 체크`} />
                      </td>
                      <td><b>{r.name}</b>{tags(r)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={`pill ${r.answer === "참석" ? "ok" : r.answer === "불참" ? "gray" : "warn"}`}>{r.answer || "미응답"}</span>
                        {r.checkedBy && r.answer && (
                          <span className="pill blue" style={{ marginLeft: 4 }} title={`${r.checkedBy} 님이 ${fmtDateTime(r.checkedAt ?? "")}에 체크했어요`}>✓ 관리자 체크</span>
                        )}
                        {r.checkedBy && r.answer && <span className="small" style={{ display: "block", marginTop: 2 }}>{r.checkedBy} · {fmtDate(r.checkedAt ?? "")}</span>}
                      </td>
                      <td className="num">{dayText(r.days)}</td>
                      <td>{r.memo || <span className="small">-</span>}</td>
                      <td><button className="mini" type="button" onClick={() => setEditRow({ memberId: r.memberId, answer: r.answer, memo: r.memo, days: r.days ? r.days.split(",").filter(Boolean) : [] })}>수정</button></td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <span className="small">맨 앞 “참석” 칸을 체크하면 그 줄이 열려요. 참석일을 고르고(하루 일정은 미리 골라져 있어요) “저장”을 누르면 반영돼요. 체크를 풀고 저장하면 미응답으로 돌아가요. 전화나 메시지로 들은 답은 “수정”으로 대신 입력할 수 있어요. 관리자가 바꾼 답에는 “✓ 관리자 체크”(체크한 사람·날짜)가 붙고, 회원이 직접 다시 답하면 사라져요. 참석이 아니게 바꾸면 참석 날짜와 입금 확인이 지워져요.</span>
          {ev.club && (
            <>
              <span className="small">소모임 일정이라 참석 신청 명단에는 {clubLabel(ev.club)} 회원과 참관자만 보여요(다른 회원은 일정을 읽기만 할 수 있어요). 일정 개요에서 소모임을 바꾸면 저장 후 반영돼요.</span>
              <ObserversCard key={ev.club} eventId={id} admin onChange={load} />
            </>
          )}
        </>
      )}

      {tab === "fee" && (
        <>
          {/* 회비 설정(개요에서 옮겨 옴): 입금 기한·계좌·예금주와 조건별 회비 줄. 아래 "회비 저장"으로 저장해요. */}
          <div className="grid2">
            {!light && <><div><label className="l" htmlFor="o-dl">입금 기한</label><DateField id="o-dl" mode="date" value={ev.feeDeadline} onChange={(v) => set("feeDeadline", v)} /></div>
            <div><label className="l" htmlFor="o-acc">입금 계좌</label><input id="o-acc" className="field" value={ev.account} onChange={(e) => set("account", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-holder">예금주</label><input id="o-holder" className="field" value={ev.accountHolder ?? ""} onChange={(e) => set("accountHolder", e.target.value)} /></div></>}
          </div>
          {/* 회비: 회원구분 / 직책 / 참석일 조건별 (회의·미팅은 없음) */}
          {!light && <section className="card" aria-label="회비" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: `700 ${fs(17)} var(--display)` }}>회비</b>
            <span className="small">
              회원구분, 직책, 참석일에 따라 금액을 정해요. 모두 “전체”인 줄은 모든 회원의 기본 회비예요. 직책의 “일반회원”은 직책이 없는 회원이에요.
              회원에게 맞는 줄 중 <b>조건이 가장 많이 맞는 줄</b>의 금액을 쓰고, 맞는 줄이 없으면 회비가 없어요. 0원도 회비 없음이에요. 회원에게는 <b>본인 회비만</b> 보여요.
            </span>
            {rules.length === 0 && <span className="small">아직 회비가 없어요. 회비를 받는 일정이라면 “+ 회비 줄 추가”를 눌러 주세요.</span>}
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
            <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: fs(15) }}
              onClick={() => setRules([...rules, { days: "", kind: "", position: "", amount: "" }])}>
              + 회비 줄 추가
            </button>
            {rules.some((r) => !r.amount) && <span className="small" style={{ color: "var(--red-t)" }}>금액이 빈 줄이 있어요. 금액을 넣거나 줄을 삭제해 주세요.</span>}
            {dist.length > 0 && <span className="small">현재 참석자 회비(저장 기준): {dist.map(([k, n]) => `${k} ${n}명`).join(" · ")}</span>}
          </section>}
          {/* 지원금: 연(월)회비에서 지원 / 회원이 지원금을 냄. 총 예산에 더한다. 아래 "회비 저장"으로 함께 저장. */}
          <section className="card" aria-label="지원금" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: `700 ${fs(17)} var(--display)` }}>지원금</b>
            <span className="small">
              <b>연(월)회비 지원</b>: 모임{ev.club ? `(${clubLabel(ev.club)})` : ""} 연·월회비에서 이 일정에 쓰는 돈. <b>회원 지원</b>: 회원이 따로 내는 지원금(지원한 회원 이름을 적어요). 지원금은 총 예산에 더해져요.
            </span>
            {supports.length > 0 && (
              <div className="tblw">
                <table className="tbl" style={{ minWidth: 620 }}>
                  <thead><tr><th>구분</th><th>지원한 분·내용</th><th>금액(원)</th><th>메모</th><th style={{ width: 70 }}><span className="sr-only">삭제</span></th></tr></thead>
                  <tbody>
                    {supports.map((x, i) => {
                      const upd = (patch: Partial<Support>) => setSupports(supports.map((y, j) => (j === i ? { ...y, ...patch } : y)));
                      const sel = { minHeight: 44, padding: "0 8px" } as const;
                      return (
                        <tr key={i}>
                          <td>
                            <select className="field" style={sel} aria-label={`${i + 1}번째 지원금 구분`} value={x.kind} onChange={(e) => upd({ kind: e.target.value as Support["kind"] })}>
                              <option value="dues">{SUPPORT_LABEL.dues}</option>
                              <option value="member">{SUPPORT_LABEL.member}</option>
                            </select>
                          </td>
                          <td>
                            <input className="field" style={sel} list={x.kind === "member" ? "sup-members" : undefined} maxLength={60} aria-label={`${i + 1}번째 지원한 분·내용`}
                              placeholder={x.kind === "member" ? "회원 이름" : `예) ${new Date().getFullYear()} 연회비`} value={x.name} onChange={(e) => upd({ name: e.target.value })} />
                          </td>
                          <td><input className="field" style={sel} inputMode="numeric" aria-label={`${i + 1}번째 지원금 금액`} value={x.amount} onChange={(e) => upd({ amount: e.target.value.replace(/\D/g, "") })} /></td>
                          <td><input className="field" style={sel} maxLength={200} aria-label={`${i + 1}번째 지원금 메모`} value={x.memo} onChange={(e) => upd({ memo: e.target.value })} /></td>
                          <td><button className="mini danger" type="button" aria-label={`${i + 1}번째 지원금 삭제`} onClick={() => setSupports(supports.filter((_, j) => j !== i))}>삭제</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="sup-members">{rows.map((r) => <option key={r.memberId} value={r.name} />)}</datalist>
              </div>
            )}
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <button className="btn white" type="button" style={{ width: "auto", minHeight: 46, fontSize: fs(15) }} onClick={() => setSupports([...supports, { kind: "dues", name: "", amount: "", memo: "" }])}>+ 연(월)회비 지원</button>
              <button className="btn white" type="button" style={{ width: "auto", minHeight: 46, fontSize: fs(15) }} onClick={() => setSupports([...supports, { kind: "member", name: "", amount: "", memo: "" }])}>+ 회원 지원</button>
            </div>
            {supports.some((x) => !x.amount) && <span className="small" style={{ color: "var(--red-t)" }}>금액이 빈 지원금이 있어요. 금액을 넣거나 삭제해 주세요.</span>}
          </section>
          {/* 총 예산 */}
          <div className="cards">
            <div className="card"><span className="small">참석자 회비 합계</span><div className="big">{won(totalOwed)}</div><span className="small">참석 {attend.length}명</span></div>
            <div className="card"><span className="small">지원금</span><div className="big">{won(supDues + supMember)}</div><span className="small">회비 지원 {won(supDues)} · 회원 지원 {won(supMember)}</span></div>
            <div className="card"><span className="small">총 예산</span><div className="big" style={{ color: "var(--blue-t)" }}>{won(totalBudget)}</div><span className="small">회비 + 지원금 (저장 기준)</span></div>
          </div>
          {!light && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn" type="button" disabled={busy || supports.some((x) => !x.amount)} style={{ width: "auto", minWidth: 160 }} onClick={() => save()}>회비 저장</button>
              <span className="small">회비 설정과 지원금을 저장해요. 공개 상태는 그대로예요.</span>
            </div>
          )}
          <div className="cards">
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

// 소모임관리에서 열면(?club=소모임) 위쪽 메뉴도 소모임관리로 둔다.
export default function EventDetailAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ club?: string }> }) {
  const { id } = use(params);
  const { club } = use(searchParams);
  return <AdminGate mode={club ? "clubs" : "events"} active={club ? "/admin/clubs" : undefined} need={["events", "evMain", "evClub", "clubs"]}><Detail id={id} /></AdminGate>;
}
