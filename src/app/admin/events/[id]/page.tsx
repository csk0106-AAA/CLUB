"use client";

import { VisSwitch } from "@/components/VisSwitch";
import { CalcText } from "@/components/CalcField";
import { ActionNote } from "@/components/ActionNote";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState, useRef } from "react";
import { AdminGate } from "@/components/AdminGate";
import { CarpoolPanel } from "@/components/CarpoolPanel";
import { EventActivities } from "@/components/EventActivities";
import { EventItems } from "@/components/EventItems";
import { EventMinutes } from "@/components/EventMinutes";
import { EventPhotos } from "@/components/EventPhotos";
import { GroupsPanel } from "@/components/GroupsPanel";
import { RoomsPanel } from "@/components/RoomsPanel";
import { CoverPicker } from "@/components/CoverPicker";
import { useTabOrder } from "@/components/useTabOrder";
import { DateField } from "@/components/DateField";
import { ObserversCard } from "@/app/events/[id]/ObserversCard";
import { EventPreview, eventInfoLines } from "@/components/EventInfoCard";
import type { SchedItem } from "@/components/ScheduleBoard";
import { readDayPlaces } from "@/lib/day-places";
import { EditorsBox } from "@/components/EditorsBox";
import { EventDuplicate } from "@/components/EventDuplicate";
import { EventTemplateSave } from "@/components/EventTemplateSave";
import { EventAudience } from "./EventAudience";
import { EventJoiners } from "./EventJoiners";
import { matches as nameMatches } from "@/components/NameSearch";
import { eventTitle } from "@/lib/event-title";
import { MapButton } from "@/components/MapButton";
import { api, fmtDate, fmtDateDow, fmtDateTime, fmtDays, TYPE_TONE, won } from "@/lib/client";
import { isLight } from "@/lib/event-types";
import { defaultPhotoLimit, eventDayCount } from "@/lib/photo-limit";
import type { FeeRule } from "@/lib/fee";
import { SUPPORT_LABEL, supportTotal, type Support } from "@/lib/supports";
import { clubLabel } from "@/lib/club-label";
import { fs } from "@/lib/fs";

type Ev = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string; booking: string;
  status: string; published: string; pinned?: string; approval?: string; fee: string; feeDeadline: string; account: string; accountHolder?: string;
  feeRules?: FeeRule[];
  supports?: Support[]; // 지원금(연·월회비 지원, 회원 지원) — 총 예산에 더한다
  club?: string; // 클럽 일정의 클럽
  audience?: string; // 공개 대상 JSON(클럽이 아닌 일정)
  dayPlaces?: string; // 세부일정 날짜별 기본 위치 JSON
  photoLimit?: string; // 사진첩 최대 장수("" = 참석 인원 × 10장 × 일수)
  photoReqs?: string; // 회원들의 장수 늘리기 요청 JSON(장수를 바꿔 저장하면 비워진다)
};
type Row = {
  memberId: string; name: string; kind: string; position: string; answer: string; days: string; paid: boolean; paidAt: string; memo: string; payNotice: string;
  fee: string; feePending: boolean; // 이 회원이 낼 회비(조건 반영), 날짜를 골라야 정해지면 feePending
  clubRole?: string; observer?: boolean; // 클럽 일정: 클럽 직책, 참관자
  checkedBy?: string; checkedAt?: string; // 관리자가 대신 체크한 경우 체크한 사람 이름·시각
  refund?: "" | "wait" | "done"; refundAmount?: string; refundSince?: string; refundDoneAt?: string; // 회비 돌려주기(송금대기·송금완료, lib/refund.ts)
  paidAmount?: string; feeDiff?: number; // 입금 확인 때 금액, 지금 회비와의 차액(+ 추가 입금, - 환불, lib/fee.ts feeDiff)
  req?: string; reqDays?: string; reqAt?: string; reqResult?: string; // 관리자 승인 후 참석: req "참석" 승인 대기, reqResult "declined" 반려
};
// 필수 승인(대기회원·참관회원의 참관 + 참석, 다른 클럽 회원의 가입·참관 + 참석) 처리 대기 신청
type Waiting = { id: string; memberId: string; name: string; kind: string; label: string; message: string; createdAt: string; guest: boolean };
type ClubOpt = { name: string; account: string; holder: string; leaders: { name: string; role: string }[] };
type Opts = { kinds: string[]; positions: string[]; clubs: ClubOpt[]; dues: { account: string; holder: string } };

const TABS = [
  { key: "over", label: "개요" },
  { key: "minutes", label: "회의록" }, // 회의 일정만
  { key: "apply", label: "신청현황" },
  { key: "fee", label: "회비" },
  { key: "act", label: "활동" },
  { key: "sched", label: "세부 일정" },
  { key: "prep", label: "준비목록" },
  { key: "cost", label: "비용" },
  { key: "group", label: "조편성" },
  { key: "car", label: "차량배정" },
  { key: "room", label: "숙소배정" },
  { key: "photo", label: "사진첩" },
];
// 회의·미팅은 회비·활동·비용·조편성·카풀·숙박이 필요 없다. 회의록 탭은 회의 일정에만.
const LIGHT_TABS = ["over", "minutes", "apply", "sched", "prep", "photo"];
const tabsFor = (type: string) => TABS.filter((t) => (t.key === "minutes" ? type === "회의" : !isLight(type) || LIGHT_TABS.includes(t.key)));
// 일정 정보 줄과 "회원에게 보이는 모습" 카드는 회원 화면(일정 개요·일정 홈)과 같은 코드(EventInfoCard)를 쓴다.
// 회비가 "전체·전체·전체" 한 줄뿐(모두 같은 금액)일 때만 금액과 계좌를 보여 주고, 여러 줄이면 "앱 접속 후 내 회비 확인"(회원은 본인 회비만 봐요).

const dayText = (days: string) => (days ? fmtDays(days) : "");
// 클럽 일정 참석 현황의 이름 옆 표시: 회장(클럽 직책) / 참관자
const tags = (r: Row) => (
  <>
    {r.clubRole && <span className="pill ok" style={{ marginLeft: 6 }}>{r.clubRole}</span>}
    {r.observer && <span className="pill blue" style={{ marginLeft: 6 }}>참관자</span>}
  </>
);

// 작은 통계 카드 하나: [이름, 값, (설명), (색)] 줄을 2칸씩(비용 탭 요약과 같은 크기)
function MiniStats({ items }: { items: [string, string, string?, string?][] }) {
  return (
    <section className="card" style={{ padding: 12 }}>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 12px", fontSize: fs(13) }}>
        {items.map(([k, v, sub, c]) => (
          <div key={k} title={sub} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "0 6px", borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
            <dt className="small" style={{ margin: 0, whiteSpace: "nowrap", fontSize: fs(12) }}>{k}</dt>
            <dd className="num" style={{ margin: "0 0 0 auto", fontWeight: 700, whiteSpace: "nowrap", color: c }}>{v}</dd>
            {sub && <span className="small" style={{ flexBasis: "100%", fontSize: fs(11) }}>{sub}</span>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function Detail({ id, initialTab }: { id: string; initialTab?: string }) {
  const [ev, setEv] = useState<Ev | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState(initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "over");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  // 누른 버튼 옆에 보여 줄 결과 문구(회비 탭): at = "feeSave" 회비 저장 / "supports" 지원금 / "pay:회원" 입금 확인 / "refund:회원" 송금완료
  const [near, setNear] = useState<{ at: string; tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [canEditActs, setCanEditActs] = useState(false);
  const tabOrder = useTabOrder("event", true); // 위쪽 메뉴: 끌어서 순서 바꾸기(모든 관리자 공통)
  // 신청현황: 거르기(전체·참석·불참·미응답) · 이름 찾기 · 되돌리기 안내 · 메모 쓰는 줄 · 관리자 체크 자세히 보는 줄
  const [filter, setFilter] = useState<"all" | "참석" | "불참" | "">("all");
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [q, setQ] = useState("");
  const [undo, setUndo] = useState<{ text: string; back?: () => void } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const [memoFor, setMemoFor] = useState<string | null>(null);
  const [memoText, setMemoText] = useState("");
  const [whoFor, setWhoFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [announced, setAnnounced] = useState(false);
  const [actNames, setActNames] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<SchedItem[]>([]); // 세부 일정(미리보기용)
  const [opts, setOpts] = useState<Opts>({ kinds: [], positions: [], clubs: [], dues: { account: "", holder: "" } });
  const [prefilled, setPrefilled] = useState("");
  const [canDelete, setCanDelete] = useState(false); // 일정관리 권한자·만든 사람만 삭제
  const [canTpl, setCanTpl] = useState(false); // 유형 템플릿 저장: 일정관리 권한자만
  const router = useRouter();

  useEffect(() => {
    api<{ perms: string[] }>("/api/me").then((r) => {
      if (r.ok) setCanEditActs(r.data.perms.includes("all") || r.data.perms.includes("templates") || r.data.perms.includes("events"));
      if (r.ok) setCanTpl(r.data.perms.includes("all") || r.data.perms.includes("events"));
    });
  }, []);

  const load = useCallback(async () => {
    const [r, a, sc] = await Promise.all([
      api<{ event: Ev; rows: Row[]; options: Opts; canDelete?: boolean; waiting?: Waiting[] }>(`/api/admin/events/${id}`),
      api<{ activities: { config: { name: string } }[] }>(`/api/admin/events/${id}/activities`),
      api<{ items: SchedItem[] }>(`/api/admin/events/${id}/items/schedule`),
    ]);
    if (sc.ok) setSchedule(sc.data.items.map((i) => ({ at: String(i.at ?? ""), title: String(i.title ?? ""), place: i.place ?? "", memo: i.memo ?? "" })));
    if (r.ok) {
      // 예전 "기본 회비"가 남아 있으면 모두 "전체"인 회비 줄로 옮겨 보여 준다(저장하면 그대로 바뀐다).
      const e = r.data.event;
      const rs = e.feeRules ?? [];
      if (e.fee && !rs.some((x) => !x.days && !x.kind && !x.position)) e.feeRules = [...rs, { days: "", kind: "", position: "", amount: e.fee }];
      // 입금계좌가 비어 있으면 클럽 계좌(클럽 일정) 또는 모임회비관리 계좌를 미리 넣는다(저장해야 반영).
      setPrefilled("");
      if (!e.account && !e.accountHolder) {
        const c = e.club ? r.data.options.clubs.find((x) => x.name === e.club) : undefined;
        const src = e.club ? (c ? { account: c.account, holder: c.holder } : null) : r.data.options.dues;
        if (src && (src.account || src.holder)) {
          e.account = src.account;
          e.accountHolder = src.holder;
          setPrefilled(e.club ? `${e.club} 클럽 계좌를 미리 넣었어요. 저장하면 반영돼요.` : "모임회비관리의 입금계좌를 미리 넣었어요. 저장하면 반영돼요.");
        }
      }
      setEv(e);
      setCanDelete(!!r.data.canDelete);
      setRows(r.data.rows);
      setWaiting(r.data.waiting ?? []);
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
  // 클럽을 고르면 그 클럽의 입금계좌·예금주를 넣는다(클럽 계좌가 없으면 지금 값을 둔다).
  function pickClub(name: string) {
    if (!ev) return;
    const c = opts.clubs.find((x) => x.name === name);
    if (c && (c.account || c.holder)) {
      setEv({ ...ev, club: name, account: c.account, accountHolder: c.holder });
      setPrefilled(`${name} 클럽 계좌를 넣었어요. 저장하면 반영돼요.`);
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

  // at: 결과 문구를 누른 버튼 옆에 보여 줄 자리(회비 탭의 "회비 저장"). 없으면 위쪽에.
  async function save(published?: boolean, at?: string) {
    if (!ev) return;
    setBusy(true);
    setMsg(null);
    setNear(null);
    // 참관자는 신청현황 탭에서 따로 저장하고, 공개 대상(audience)은 이 화면에서 바꾸지 않는다.
    // 맨 위 고정(pinned)은 스위치를 누를 때 바로 저장한다.
    // 준비목록·비용 "참석자에게 보이기"는 각 탭에서 따로 저장한다(여기서는 보내지 않는다)
    const { id: _id, type: _t, published: _p, observers: _o, audience: _a, pinned: _pin, showPrep: _sp, showCosts: _sc, visibility: _vis, ...fields } = ev as Ev & { observers?: unknown; audience?: unknown; showPrep?: unknown; showCosts?: unknown; visibility?: unknown };
    void _id; void _t; void _p; void _o; void _a; void _pin; void _sp; void _sc; void _vis;
    const r = await api(`/api/admin/events/${id}`, {
      method: "PATCH",
      // 기본 회비 칸은 없앴다: 회비는 모두 회비 줄(feeRules)로 저장하고 예전 fee 값은 비운다.
      body: { ...fields, fee: "", ...(published === undefined ? {} : { published }) },
    });
    setBusy(false);
    if (!r.ok) return at ? setNear({ at, tone: "bad", text: r.error }) : setMsg({ tone: "bad", text: r.error });
    if (at) {
      setNear({ at, tone: "info", text: "저장했어요." });
      return load();
    }
    // 공개·공개 취소는 다시 불러오기를 기다리지 않고 라벨을 바로 바꾼다
    if (published !== undefined) setEv((cur) => (cur ? { ...cur, published: String(published), status: published ? "공개" : "초안" } : cur));
    setMsg({ tone: "info", text: published === true ? (ev?.published === "true" ? "저장했어요. 공개 상태 그대로 회원 화면에 반영돼요." : "공개하고 회원에게 전달했어요. 이제 회원 화면에 보여요.") : published === false ? "공개를 취소했어요. 다시 공개전이에요." : "저장했어요." });
    load();
  }

  // 회원 일정 목록 맨 위 고정: 누르면 바로 저장(회원 알림은 보내지 않는다)
  async function removeEvent() {
    if (!ev) return;
    if (!window.confirm(`“${ev.name}” 일정을 지울까요?\n참석 신청·회비·세부 일정·활동 기록도 함께 지워지고 되돌릴 수 없어요.`)) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    router.replace(ev.club ? `/admin/clubs/${encodeURIComponent(ev.club)}?tab=events` : "/admin/events");
  }

  // 참석 확정 방식: 누르면 바로 저장
  async function setApproval(next: "" | "admin") {
    if (!ev || (ev.approval ?? "") === next) return;
    const pend = rows.filter((r) => r.req === "참석").length;
    if (next === "" && pend > 0 && !window.confirm(`승인 대기 중인 회원이 ${pend}명 있어요. 바로 확정으로 바꿔도 이 회원들은 그대로 승인 대기로 남아요(신청현황에서 승인해 주세요).\n바꿀까요?`)) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${id}`, { method: "PATCH", body: { approval: next } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setEv({ ...ev, approval: next });
    setMsg({ tone: "info", text: next ? "이제 회원이 참석을 신청하면 관리자가 승인해야 참석이 확정돼요." : "이제 회원이 참석을 신청하면 바로 참석으로 확정돼요." });
  }
  // 승인 대기: 이 일정 설정(관리자 승인 후 참석) 신청 / 필수 승인(참관·가입 + 참석) 신청
  async function decideOwn(r: Row, approve: boolean) {
    let reason = "";
    if (!approve) {
      const x = window.prompt(`${r.name} 님의 참석 신청을 반려해요. 회원에게 보일 사유를 적어 주세요(비워도 돼요).`, "");
      if (x === null) return;
      reason = x.trim();
    }
    setBusy(true);
    const res = await api(`/api/admin/events/${id}/approve`, { body: { memberId: r.memberId, decision: approve ? "approve" : "decline", reason } });
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "bad", text: res.error });
    setMsg({ tone: "info", text: approve ? `${r.name} 님 참석을 확정하고 알림을 보냈어요.` : `${r.name} 님 신청을 반려하고 알림을 보냈어요.` });
    load();
  }
  async function decideClub(w: Waiting, approve: boolean) {
    let reason = "";
    if (!approve) {
      const x = window.prompt(`${w.name} 님의 ${w.label}을 반려해요. 회원에게 보일 사유를 적어 주세요(비워도 돼요).`, "");
      if (x === null) return;
      reason = x.trim();
    }
    setBusy(true);
    const res = await api(`/api/club-requests/${w.id}`, { method: "PATCH", body: { decision: approve ? "approve" : "decline", reason } });
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "bad", text: res.error });
    setMsg({ tone: "info", text: approve ? `${w.name} 님 ${w.label}을 승인했어요. 참석으로 들어가요.` : `${w.name} 님 ${w.label}을 반려했어요.` });
    load();
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

  // 입금 확인·확인 취소·입금 알림 돌려보내기(입금 안 됨). 취소·돌려보낼 때는 회원에게 보일 사유를 받고, 회원에게 바로 알림이 간다.
  // 입금 확인된 회원이 다시 보낸 입금 알림: 입금 확인을 한 번 더(회원에게 확인 알림)
  async function dismissNotice(memberId: string) {
    setNear(null);
    const r = await api(`/api/admin/events/${id}/pay`, { body: { memberId, dismiss: true } });
    setNear({ at: `pay:${memberId}`, tone: r.ok ? "info" : "bad", text: r.ok ? "입금을 다시 확인했어요. 회원에게 알림을 보냈어요." : r.error });
    load();
  }
  async function pay(memberId: string, paid: boolean, reject?: boolean) {
    let reason: string | undefined;
    if (!paid || reject) {
      const who = rows.find((x) => x.memberId === memberId)?.name ?? "회원";
      const v = window.prompt(reject ? `${who} 님의 입금 알림을 “입금 안 됨”으로 돌려보낼까요?\n회원에게 알림이 가요. 사유를 적어 주세요(비워도 돼요).` : `${who} 님의 입금 확인을 취소할까요?\n회원에게 알림이 가요. 사유를 적어 주세요(비워도 돼요).`, "입금 내역이 확인되지 않아요");
      if (v === null) return;
      reason = v.trim();
    }
    setNear(null);
    const r = await api(`/api/admin/events/${id}/pay`, { body: reject ? { memberId, reject: true, reason } : { memberId, paid, ...(reason !== undefined ? { reason } : {}) } });
    if (!r.ok) return setNear({ at: `pay:${memberId}`, tone: "bad", text: r.error });
    setNear({ at: `pay:${memberId}`, tone: "info", text: reject ? "입금 알림을 돌려보내고 회원에게 알렸어요." : paid ? "입금을 확인했어요. 회원에게 알림을 보냈어요." : "입금 확인을 취소하고 회원에게 알렸어요." });
    load();
  }

  // 신청현황: 참석·불참·미응답을 누르면 바로 저장(잠깐 "되돌리기"가 보인다). 여러 날 일정에서 참석이면 모든 날로 저장되고 날짜를 눌러 뺀다.
  // 입금이 확인된 회원을 참석에서 빼면 송금대기가 되고 관리자·회원에게 알림이 가서 한 번 묻는다(lib/refund.ts).
  function showUndo(text: string, back?: () => void) {
    setUndo({ text, back });
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000);
  }
  async function sendApply(body: { memberId: string; answer: string; days?: string[]; memo?: string }): Promise<boolean> {
    setBusy(true);
    const r = await api(`/api/admin/events/${id}/apply`, { body });
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "bad", text: r.error }); load(); return false; }
    return true;
  }
  async function setAnswer(r: Row, answer: string) {
    if (answer === r.answer || busy) return;
    const refunding = r.answer === "참석" && answer !== "참석" && r.paid;
    if (refunding && !window.confirm(`${r.name} 님은 회비 입금이 확인됐어요.\n참석에서 빼면 “송금대기”가 되고, 관리자에게는 회비를 돌려주라는 알림, 회원에게는 송금해 드릴 예정이라는 알림이 가요.\n바꿀까요?`)) return;
    const prev = { answer: r.answer, days: r.days ? r.days.split(",").filter(Boolean) : undefined };
    setRows(rows.map((x) => (x.memberId === r.memberId ? { ...x, answer } : x))); // 바로 보이게
    setMsg(null);
    if (!(await sendApply({ memberId: r.memberId, answer }))) return;
    const label = answer || "미응답";
    // 송금대기가 생긴 변경은 알림이 이미 갔으니 되돌리기 대신 안내만
    showUndo(refunding ? `${r.name} 님을 ${label}(으)로 바꿨어요. 회비 탭에 송금대기로 올라갔어요.` : `${r.name} 님을 ${label}(으)로 바꿨어요.`,
      refunding ? undefined : async () => { setUndo(null); if (await sendApply({ memberId: r.memberId, answer: prev.answer, ...(prev.answer === "참석" && prev.days ? { days: prev.days } : {}) })) load(); });
    load();
  }
  async function toggleDay(r: Row, d: string) {
    const cur = r.days ? r.days.split(",").filter(Boolean) : [];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
    if (next.length === 0) return setMsg({ tone: "bad", text: "참석일은 하루 이상이어야 해요. 모두 빠지면 “불참”을 눌러 주세요." });
    setRows(rows.map((x) => (x.memberId === r.memberId ? { ...x, days: next.join(",") } : x)));
    if (await sendApply({ memberId: r.memberId, answer: "참석", days: next })) load();
  }
  async function saveMemo(r: Row) {
    const text = memoText.trim();
    setMemoFor(null);
    if (text === (r.memo ?? "")) return;
    setRows(rows.map((x) => (x.memberId === r.memberId ? { ...x, memo: text } : x)));
    if (await sendApply({ memberId: r.memberId, answer: r.answer, memo: text })) load();
  }
  // diff: 참석은 그대로인데 회비가 줄어 생긴 차액 환불(송금완료하면 입금 금액을 지금 회비로 맞춘다)
  async function refundDone(r: Row, diff = false) {
    const amount = diff ? won(String(-(r.feeDiff ?? 0))) : won(r.refundAmount ?? "0");
    if (!window.confirm(`${r.name} 님에게 회비${diff ? " 차액" : ""} ${amount}을 송금했나요?\n“송금완료”로 바꾸고 ${r.name} 님에게 바로 알림을 보내요.`)) return;
    setBusy(true);
    setNear(null);
    const res = await api(`/api/admin/events/${id}/refund`, { body: { memberId: r.memberId, ...(diff ? { diff: true } : {}) } });
    setBusy(false);
    if (!res.ok) return setNear({ at: `refund:${r.memberId}`, tone: "bad", text: res.error });
    setNear({ at: `refund:${r.memberId}`, tone: "info", text: `${r.name} 님 회비 송금완료로 바꾸고 알림을 보냈어요.` });
    load();
  }

  // 일정 공지 문구(단체 대화방용). "회원에게 보이는 모습"과 같은 순서·아이콘을 쓴다.
  // 계좌는 모든 회원 회비가 같을 때만 넣는다(infoLines 참고).
  async function copyAnnounce() {
    if (!ev) return;
    // 읽기 쉽게: 칸마다 구분선 + 아이콘 제목, 줄마다 아이콘. 회비 금액은 ▪️ 목록, 안내 글은 들여쓰기
    const LINE = "━━━━━━━━━━━━━━";
    const body = eventInfoLines(infoEv, { kind: "rules", rules }, actNames).flatMap((x) =>
      x.multiline ? [`${x.icon} ${x.label}`, ...x.value.split("\n").map((l) => (x.label === "회비" ? `  ▪️ ${l}` : `   ${l}`))] : [`${x.icon} ${x.label}: ${x.value}`],
    );
    // 배정 내용: 마감 일정 · 조편성 · 숙소 · 차량(차량은 최종 배정 전이면 지금 신청 기준). 못 불러오면 빼고 나머지만 복사한다.
    const a = await api<{ groups: { title: string; lines: string[] }[]; rooms: string[]; cars: string[]; carsFinal: boolean; deadlines: string[] }>(`/api/admin/events/${id}/announce`);
    const extra: string[] = [];
    const sec = (title: string, ls: string[]) => { if (ls.length) extra.push("", LINE, title, LINE, ...ls.map((l) => `  ${l}`)); };
    if (a.ok) {
      sec("📌 마감 일정", a.data.deadlines);
      for (const g of a.data.groups) sec(`👥 조편성 · ${g.title}`, g.lines);
      sec("🛏 숙소 배정", a.data.rooms);
      sec(a.data.carsFinal ? "🚗 차량 배정" : "🚗 차량 배정 (지금 신청 기준, 최종 배정 전)", a.data.cars);
    }
    const lines = [
      `📣 [${ev.type}] ${ev.name}`,
      LINE,
      ...body,
      ...extra,
      "",
      LINE,
      "📲 모임 앱에서 참석 여부를 알려 주세요.",
      "🔑 로그인: 내 이름 선택 + 휴대폰 번호 뒷자리 4자리",
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
  const noAns = rows.filter((r) => r.answer === "" && r.req !== "참석"); // 승인 대기는 미응답이 아니다
  const pendOwn = rows.filter((r) => r.req === "참석"); // 관리자 승인 후 참석: 승인 대기
  const paid = attend.filter((r) => r.paid);
  // 회비 돌려주기: 입금 확인된 뒤 참석에서 빠진 회원(송금대기 먼저)
  //  + 참석 중인데 입금 확인 뒤 회비가 줄어 돌려줄 차액(diff, lib/fee.ts feeDiff). amount: 돌려줄 금액
  type RefundItem = { r: Row; diff: boolean; amount: number };
  const refundOf = (r: Row, diff: boolean): RefundItem => ({ r, diff, amount: diff ? -(r.feeDiff ?? 0) : Number(r.refundAmount) || 0 });
  const refundWait = [
    ...rows.filter((r) => r.refund === "wait").map((r) => refundOf(r, false)),
    ...rows.filter((r) => r.answer === "참석" && r.paid && (r.feeDiff ?? 0) < 0).map((r) => refundOf(r, true)),
  ];
  const refunds = [...refundWait, ...rows.filter((r) => r.refund === "done").map((r) => refundOf(r, false))];
  const rules = ev.feeRules ?? [];
  // 회원 화면과 같은 정보 카드용(클럽 일정이면 회장 등 직책자도 함께)
  const infoEv = { ...ev, clubLeaders: curClub?.leaders };
  const setRules = (next: FeeRule[]) => setEv({ ...ev, feeRules: next });
  const supports = ev.supports ?? [];
  const setSupports = (next: Support[]) => setEv({ ...ev, supports: next });
  // 지원금은 고치거나 지우면 바로 저장한다(회비현황 장부와 같은 기록이라 저장 버튼을 기다리지 않는다). 금액이 빈 줄은 빼고 저장.
  async function saveSupports(next: Support[]) {
    const r = await api(`/api/admin/events/${id}`, { method: "PATCH", body: { supports: next.filter((x) => x.amount) } });
    if (!r.ok) setNear({ at: "supports", tone: "bad", text: `지원금을 저장하지 못했어요. ${r.error}` });
  }
  // 누른 버튼 옆 결과 문구(near.at 이 맞을 때만)
  const nearNote = (at: string) =>
    near?.at === at ? (
      <span className="small" role={near.tone === "bad" ? "alert" : "status"} style={{ fontWeight: 600, color: near.tone === "bad" ? "var(--red-t)" : "var(--green-t)", whiteSpace: "normal" }}>
        {near.tone === "info" ? "✓ " : ""}{near.text}
      </span>
    ) : null;
  const setAndSaveSupports = (next: Support[]) => { setSupports(next); saveSupports(next); };
  // 참석일 선택지: 일정 기간(최대 7일)
  const dayCount = (() => {
    const a = ev.startsAt?.slice(0, 10);
    const b = (ev.endsAt || ev.startsAt)?.slice(0, 10);
    return a && b ? Math.min(7, Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1)) : 2;
  })();
  const owed = (r: Row) => Number(r.fee) || 0;
  const totalOwed = attend.reduce((n, r) => n + owed(r), 0);
  // 입금 완료 합계: 실제로 확인한 금액(paidAmount, 예전 기록은 지금 회비)
  const totalPaid = paid.reduce((n, r) => n + (r.paidAmount ? Number(r.paidAmount) || 0 : owed(r)), 0);
  // 총 예산 = 참석자 회비 합계 + 지원금(연·월회비 지원 + 회원 지원)
  const supDues = supportTotal(supports.filter((x) => x.kind === "dues"));
  const supMember = supportTotal(supports.filter((x) => x.kind === "member"));
  const totalBudget = totalOwed + supDues + supMember;
  // 참석자 회비 분포 (예: 150,000원 8명 · 70,000원 3명)
  const dist = [...attend.reduce((m, r) => m.set(r.feePending ? "날짜 선택 전" : r.fee ? won(r.fee) : "회비 없음", (m.get(r.feePending ? "날짜 선택 전" : r.fee ? won(r.fee) : "회비 없음") ?? 0) + 1), new Map<string, number>())];

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* 맨 위: 일정 목록으로 돌아가기(클럽 일정은 클럽관리 › 그 클럽 › 일정관리로) */}
        {/* 한 줄: 왼쪽 일정 목록으로 · 오른쪽 회원 화면에서 보기 */}
        <div className="row" style={{ gap: 6 }}>
          <Link href={ev.club ? `/admin/clubs/${encodeURIComponent(ev.club)}?tab=events` : "/admin/events"} className="mini" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            {ev.club ? `‹ ${ev.club} 일정 목록으로` : "‹ 일정 목록으로"}
          </Link>
          {ev.published === "true" && (
            <Link href={`/events/${id}`} style={{ marginLeft: "auto", fontSize: fs(13), textDecoration: "none", minHeight: 32, display: "inline-flex", alignItems: "center" }}>
              회원 화면에서 보기 ›
            </Link>
          )}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className={`chip ${TYPE_TONE[ev.type] === "gray" || !TYPE_TONE[ev.type] ? "line" : TYPE_TONE[ev.type]}`}>{ev.type}</span>
          <span className={`chip ${ev.published === "true" ? "violet" : "gray"}`}>{ev.published === "true" ? "공개" : "공개전"}</span>
          {/* 공개 취소: 공개 라벨 바로 옆(일정은 지우지 않고 초안으로 돌린다) */}
          {ev.published === "true" && (
            <button className="mini danger" type="button" disabled={busy} style={{ minHeight: 30, padding: "0 10px", fontSize: fs(13) }} title="회원 화면에서 감추고 공개전으로 돌려요"
              onClick={() => save(false)}>공개 취소</button>
          )}
        </div>
        <h1 className="title" style={{ overflowWrap: "anywhere" }}>{eventTitle(ev.name, ev.club)}</h1>
      </div>

      <div className="tabsx" role="tablist" aria-label="일정 관리 메뉴">
        {(() => {
          const list = tabOrder.sort(tabsFor(ev.type));
          const keys = list.map((t) => t.key);
          return list.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => { setTab(t.key); setNear(null); }} {...tabOrder.drag(t.key, keys)}>{t.label}</button>
          ));
        })()}
      </div>

      <ActionNote msg={msg} />

      {tab === "over" && (
        // 개요는 세 묶음: 기본 정보(저장 버튼으로 저장) · 공개·참석 설정(누르면 바로 저장) · 더 보기(복제·템플릿·삭제, 접어 둠)
        <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <section className="otsec" aria-labelledby="o-sec-basic" style={{ gap: 14 }}>
          <h2 id="o-sec-basic">기본 정보</h2>
          <span className="small" style={{ marginTop: -8 }}>이 묶음은 고친 뒤 맨 아래 <b>임시 저장</b> 또는 <b>{ev.published === "true" ? "저장 (공개 유지)" : "공개 및 회원전달"}</b>을 눌러야 반영돼요.</span>
          {/* 클럽 고르기: 클럽이 아직 없는 클럽 일정만(클럽관리 › 그 클럽에서 들어오면 이미 정해져 있어 숨긴다) */}
          {ev.type === "클럽" && !ev.club && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="l" htmlFor="o-club" style={{ margin: 0 }}>클럽</label>
              <select id="o-club" className="field" value={ev.club ?? ""} onChange={(e) => pickClub(e.target.value)}>
                <option value="">클럽을 고르지 않음 (전체 회원에게 보임)</option>
                {[...new Set([...opts.clubs.map((c) => c.name), ...(ev.club ? [ev.club] : [])])].map((c) => <option key={c}>{c}</option>)}
              </select>
              {curClub && (
                <span className="small">
                  {curClub.leaders.length ? curClub.leaders.map((l) => `${l.role}: ${l.name}`).join(" · ") : "회장을 아직 정하지 않았어요"}
                  {" · "}참석 신청 대상은 {curClub.name} 회원이고, 회장이 참관자를 더할 수 있어요.
                </span>
              )}
              {ev.club && !curClub && <span className="small" style={{ color: "var(--red-t)" }}>“{ev.club}” 클럽이 목록에 없어요. 다른 클럽을 골라 주세요.</span>}
            </div>
          )}
          {prefilled && <div className="msg info" role="status">{prefilled}</div>}
          {/* 일정 이름 · 장소 한 줄, 시작 일시 · 끝나는 일시 · 사진 최대 장수 한 줄(globals.css .grid2.pair) */}
          <div className="grid2 pair">
            <div className="half">
              <label className="l" htmlFor="o-name">일정 이름</label><input id="o-name" className="field" maxLength={80} value={ev.name} onChange={(e) => set("name", e.target.value)} />
              {ev.club && <span className="small" style={{ display: "block", marginTop: 4 }}>회원에게는 “{eventTitle(ev.name, ev.club)}”으로 보여요.</span>}
            </div>
            <div className="half"><label className="l" htmlFor="o-place">장소</label><div style={{ display: "flex", gap: 6 }}><input id="o-place" className="field" style={{ flex: 1, minWidth: 0 }} value={ev.place} onChange={(e) => set("place", e.target.value)} />{ev.place.trim() && (
              <MapButton place={ev.place} style={{ flex: "none", width: 46, minHeight: 46, padding: 0, display: "grid", placeItems: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              </MapButton>
            )}</div></div>
            <div><label className="l" htmlFor="o-start">시작 일시</label><DateField id="o-start" mode="datetime" value={ev.startsAt} onChange={(v) => set("startsAt", v)} /></div>
            <div><label className="l" htmlFor="o-end">끝나는 일시</label><DateField id="o-end" mode="datetime" value={ev.endsAt} onChange={(v) => set("endsAt", v)} /></div>
            {(() => {
              // 사진 최대 장수: 비우면 참석 인원 × 10장 × 일정 일수(참석자 없으면 20장, lib/event-photos.ts 와 같은 계산).
              // 회원 요청이 있으면 강조하고, 장수를 바꿔 저장하면 요청이 처리된다.
              const going = rows.filter((r) => r.answer === "참석").length;
              const days = eventDayCount(ev.startsAt, ev.endsAt);
              const def = defaultPhotoLimit(going, days);
              const reqs = (() => { try { const v = JSON.parse(ev.photoReqs || "[]"); return Array.isArray(v) ? v.length : 0; } catch { return 0; } })();
              return (
                <div className="full">
                  <label className="l" htmlFor="o-photos">사진 최대 장수</label>
                  <input id="o-photos" className="field" inputMode="numeric" maxLength={4} placeholder={`비우면 기본값 (지금 ${def}장)`}
                    value={ev.photoLimit ?? ""} onChange={(e) => set("photoLimit", e.target.value.replace(/[^0-9]/g, ""))} aria-describedby="o-photos-h" />
                  <span id="o-photos-h" className="small" style={{ display: "block", marginTop: 4, color: reqs ? "var(--red-t)" : undefined, fontWeight: reqs ? 700 : undefined }}>
                    {reqs ? `회원 ${reqs}명이 장수를 늘려 달라고 요청했어요. 장수를 늘려 저장하면 요청이 처리돼요.` : going > 0 ? `기본: 참석 ${going}명 × 10장 × ${days}일 = ${def}장` : `기본: 참석자가 없어서 ${def}장`}
                  </span>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="l" htmlFor="o-book">안내 (줄을 바꿔 여러 줄로 쓸 수 있어요)</label>
            <textarea id="o-book" className="field" rows={6} maxLength={2000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
              placeholder={"예)\n숙소: 대명 홍천 소노펠리체, 객실 10실 (예약번호 0000)\n체크인 15:00 / 체크아웃 11:00\n저녁: 18:30 ○○식당 (20명)"}
              value={ev.booking} onChange={(e) => set("booking", e.target.value)} />
            <span className="hint">{ev.booking.length}/2000자 · 회원 화면에도 줄바꿈 그대로 보여요.</span>
          </div>

          <EventPreview ev={infoEv} rules={rules} actNames={actNames} schedule={schedule} dayPlaces={readDayPlaces(ev.dayPlaces)} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn white" type="submit" disabled={busy} style={{ width: "auto", minWidth: 160 }}>임시 저장</button>
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 200 }} onClick={() => save(true)}>
              {ev.published === "true" ? "저장 (공개 유지)" : "공개 및 회원전달"}
            </button>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 200 }} onClick={copyAnnounce}>{announced ? "복사했어요 ✓" : "대화방 안내 문구 복사"}</button>
          </div>
          <span className="small">“대화방 안내 문구 복사”는 위 “회원에게 보이는 모습”과 같은 내용으로 단체 대화방에 붙여 넣을 공지를 만들어 줘요. 회비는 참석 날짜·직책별 금액을 모두 적고 입금 기한·계좌도 함께 나가요. 조편성·숙소 배정·차량 배정은 회원에게 배포된 것만 명단으로 함께 나가요.</span>
          </section>

          {/* 공개·참석 설정: 모두 누르면 바로 저장(저장 버튼과 상관없음) */}
          <section className="otsec" aria-labelledby="o-sec-open" style={{ gap: 14, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
          <h2 id="o-sec-open">공개·참석 설정</h2>
          <span className="small" style={{ marginTop: -8 }}>이 묶음은 누르거나 고르면 <b>바로 저장</b>돼요. 저장 버튼은 필요 없어요.</span>
          <EventAudience key={`${ev.id}-${ev.club ?? ""}`} eventId={id} audience={ev.audience} club={ev.club || undefined} onSaved={load} />
          {!ev.club && <EventJoiners eventId={id} onChanged={load} />}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b>참석 확정 방식</b>
            <div className="seg" role="group" aria-label="참석 확정 방식" style={{ alignSelf: "flex-start" }}>
              <button type="button" aria-pressed={(ev.approval ?? "") === ""} disabled={busy} onClick={() => setApproval("")} style={{ minHeight: 38, padding: "0 14px" }}>바로 확정</button>
              <button type="button" aria-pressed={ev.approval === "admin"} disabled={busy} onClick={() => setApproval("admin")} style={{ minHeight: 38, padding: "0 14px" }}>관리자 승인 후 확정</button>
            </div>
            <span className="small">
              {ev.approval === "admin" ? "회원이 참석을 신청하면 “승인 대기”가 되고 관리자에게 알림이 가요. 신청현황에서 승인하면 참석이 확정되고, 반려하면 사유와 함께 회원에게 알려요." : "회원이 참석을 신청하면 바로 참석으로 확정돼요."}
              {" "}대기회원·참관회원, 다른 클럽 회원은 어느 쪽이든 참관·가입 신청 승인을 거쳐요.
            </span>
          </div>
          {/* 안내: 미응답·불참 회원에게도 보일지(components/VisSwitch.tsx) */}
          <div className="card row" style={{ gap: 6, flexWrap: "wrap" }}><VisSwitch eventId={id} k="notice" inline /></div>
          <div className="card switchrow">
            <span className="grow">
              <b id="o-pin-l">회원 일정 목록 맨 위에 고정</b>
              <span className="small" style={{ display: "block" }} id="o-pin-d">켜면 회원의 일정 목록에서 가장 먼저 보여요.</span>
            </span>
            <button type="button" role="switch" className="switch" aria-checked={ev.pinned === "true"} aria-labelledby="o-pin-l" aria-describedby="o-pin-d"
              disabled={busy} onClick={() => togglePin(ev.pinned !== "true")} />
          </div>
          {/* 일정 대표사진: 모임·클럽 대표사진처럼 고르면 바로 저장 */}
          <CoverPicker scope="event" club={id} title="일정 대표사진"
            help={`홈의 다가오는 일정·타임라인 카드와 일정 화면 맨 위에 이 사진이 보여요. 회원이 올린 사진보다 먼저예요. 없으면 회원 사진 → ${ev.club ? "클럽" : "모임"} 대표사진 순서로 보여요. 사진을 고르면 바로 저장돼요.`} />
          {/* 편집자: 만든 사람(또는 일정관리)이 이 일정 종류를 만들 권한이 있는 회원 중에서 추가 */}
          <EditorsBox endpoint={`/api/admin/events/${id}/editors`} what="일정" need={`${ev.type} 일정을 만들 권한`} />
          </section>

          {/* 더 보기: 복제 · 템플릿으로 저장 · 삭제(자주 쓰지 않아 접어 둔다) */}
          <details className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>더 보기 <span className="small" style={{ fontWeight: 500 }}>복제 · 템플릿 · 삭제</span></summary>
          {/* 일정 복제: 같은 설정·준비 내용으로 새 초안 일정 만들기 */}
          <div className="row" style={{ flexWrap: "wrap", paddingTop: 10 }}>
            <span className="small grow" style={{ minWidth: 200 }}>같은 설정으로 다음 일정을 만들려면 복제하세요. 세부 일정·준비목록·비용 항목·활동까지 새 초안으로 복사돼요.</span>
            <EventDuplicate variant="page" ev={{ id: ev.id, name: ev.name, startsAt: ev.startsAt, club: ev.club }} />
          </div>
          {/* 유형 템플릿: 일정 만들기에서 같은 유형을 고르면 이 일정 내용으로 채우기 */}
          {canTpl && ev.type !== "클럽" && <EventTemplateSave eventId={id} type={ev.type} />}
          {canDelete && (
            <div className="row" style={{ flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
              <span className="small grow" style={{ minWidth: 200 }}>일정을 지우면 참석 신청·회비·세부 일정·활동 기록도 함께 지워지고 되돌릴 수 없어요. 회원에게만 감추려면 “공개 취소”를 쓰세요.</span>
              <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minWidth: 160 }} onClick={removeEvent}>일정 삭제</button>
            </div>
          )}
          </details>
        </form>
      )}

      {tab === "minutes" && ev.type === "회의" && <><VisSwitch eventId={id} k="minutes" /><EventMinutes eventId={id} admin /></>}
      {tab === "act" && <><VisSwitch eventId={id} k="activities" canEdit={canEditActs} /><EventActivities eventId={id} canEdit={canEditActs} /></>}
      {tab === "sched" && <EventItems eventId={id} kind="schedule" canEdit />}
      {tab === "prep" && <EventItems eventId={id} kind="prep" canEdit />}
      {/* 비용: "기본 회비로 정하기"로 회비 줄이 바뀌면 이 화면도 다시 불러온다(회비 탭이 옛 값으로 덮어쓰지 않게) */}
      {tab === "cost" && <EventItems eventId={id} kind="costs" canEdit onSaved={load} />}
      {/* 조편성·차량·숙소·사진첩: 위쪽 오른쪽에 "미응답·불참에게 보이기" */}
      {tab === "group" && <><VisSwitch eventId={id} k="groups" /><GroupsPanel eventId={id} canEdit /></>}
      {tab === "car" && <><VisSwitch eventId={id} k="cars" note="끄면 미응답·불참 회원은 차량 목록·탑승 신청을 볼 수 없어요." /><CarpoolPanel eventId={id} canEdit /></>}
      {tab === "room" && <><VisSwitch eventId={id} k="rooms" /><RoomsPanel eventId={id} canEdit /></>}
      {tab === "photo" && <><VisSwitch eventId={id} k="photos" note="켜 두면 보기·좋아요·댓글·내려받기는 누구나, 사진 올리기는 참석자만 해요." /><EventPhotos eventId={id} admin /></>}

      {tab === "apply" && (() => {
        const FILTERS: { k: "all" | "참석" | "불참" | ""; l: string; n: number }[] = [
          { k: "all", l: "전체", n: rows.length }, { k: "참석", l: "참석", n: attend.length }, { k: "불참", l: "불참", n: absent.length }, { k: "", l: "미응답", n: noAns.length },
        ];
        const shown = rows.filter((r) => (filter === "all" || (r.answer === filter && !(filter === "" && r.req === "참석"))) && nameMatches(r.name, q));
        const waitN = pendOwn.length + waiting.length;
        return (
        <>
          {/* 승인 대기: 이 일정 설정(관리자 승인 후 확정)으로 들어온 신청 + 필수 승인(참관·가입 + 참석) */}
          {waitN > 0 && (
            <section className="card att-wait" aria-label="승인 대기">
              <b>승인 대기 {waitN}명</b>
              <ul>
                {pendOwn.map((r) => (
                  <li key={`own-${r.memberId}`}>
                    <span className="grow">
                      <b>{r.name}</b>{tags(r)} <span className="small">참석 신청{r.reqDays ? ` · ${dayText(r.reqDays)}` : ""}{r.reqAt ? ` · ${fmtDate(r.reqAt)}` : ""}</span>
                    </span>
                    <button className="mini" type="button" disabled={busy} onClick={() => decideOwn(r, false)}>반려</button>
                    <button className="mini on" type="button" disabled={busy} onClick={() => decideOwn(r, true)}>승인</button>
                  </li>
                ))}
                {waiting.map((w) => (
                  <li key={`club-${w.id}`}>
                    <span className="grow">
                      <b>{w.name}</b> <span className="pill blue">{w.guest ? "대기·참관회원" : "다른 클럽 회원"}</span>{" "}
                      <span className="small">{w.label}{w.createdAt ? ` · ${fmtDate(w.createdAt)}` : ""}</span>
                      {w.message && <span className="small" style={{ display: "block" }}>“{w.message}”</span>}
                    </span>
                    <button className="mini" type="button" disabled={busy} onClick={() => decideClub(w, false)}>반려</button>
                    <button className="mini on" type="button" disabled={busy} onClick={() => decideClub(w, true)}>승인</button>
                  </li>
                ))}
              </ul>
              <span className="small">승인하면 참석으로 들어가고, 반려하면 사유와 함께 회원에게 알림이 가요.{waiting.length > 0 ? " 대기·참관회원과 다른 클럽 회원은 일정 설정과 관계없이 늘 승인을 거쳐요(클럽 일정은 클럽 직책자나 모든권한 관리자가 처리해요)." : ""}</span>
            </section>
          )}
          {/* 위: 누르면 그 사람들만 보는 거르기 */}
          <div className="att-filter" role="group" aria-label="신청 상태로 거르기">
            {FILTERS.map((x) => (
              <button key={x.l} type="button" aria-pressed={filter === x.k} className={x.k === "" && x.n > 0 ? "warn" : ""} onClick={() => setFilter(x.k)}>
                {x.l} <b>{x.n}</b>
              </button>
            ))}
          </div>
          <input className="field" type="search" aria-label="이름으로 찾기" placeholder="이름으로 찾기 (초성도 돼요: ㅎㄱㄷ)" value={q} onChange={(e) => setQ(e.target.value)} />
          {filter === "" && noAns.length > 0 && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="small grow">미응답 {noAns.length}명에게 보낼 안내 문구를 복사해 단체 대화방에 붙여 넣을 수 있어요.</span>
              <button className="mini" type="button" onClick={() => copyReminder(noAns.map((r) => r.name))}>{copied ? "복사했어요 ✓" : "알림 문구 복사"}</button>
            </div>
          )}
          {undo && (
            <div className="msg info att-undo" role="status">
              <span className="grow">{undo.text}</span>
              {undo.back && <button className="mini" type="button" onClick={undo.back}>되돌리기</button>}
            </div>
          )}
          {shown.length === 0 && <div className="msg info">해당하는 회원이 없어요.</div>}
          <ul className="att-list">
            {shown.map((r) => {
              const days = r.days ? r.days.split(",").filter(Boolean) : [];
              return (
                <li key={r.memberId} className="att-row">
                  <div className="att-top">
                    <span className="att-name">
                      <b>{r.name}</b>{tags(r)}
                      {r.checkedBy && r.answer && (
                        <button type="button" className="att-by" aria-expanded={whoFor === r.memberId} onClick={() => setWhoFor(whoFor === r.memberId ? null : r.memberId)}>·관리자</button>
                      )}
                    </span>
                    <button type="button" className={`att-memo${r.memo ? " on" : ""}`} aria-label={`${r.name} 메모${r.memo ? ` (${r.memo})` : " 쓰기"}`} title={r.memo || "메모 쓰기"}
                      onClick={() => { setMemoFor(r.memberId); setMemoText(r.memo ?? ""); }}>📝</button>
                    <div className="seg att-seg" role="group" aria-label={`${r.name} 신청`}>
                      {(["참석", "불참", ""] as const).map((a) => (
                        <button key={a || "none"} type="button" aria-pressed={r.answer === a && !(a === "" && r.req === "참석")} className={`a-${a || "none"}`} disabled={busy} onClick={() => setAnswer(r, a)}>{a || "미응답"}</button>
                      ))}
                    </div>
                  </div>
                  {r.req === "참석" && <span className="small"><span className="pill warn">승인 대기</span> 참석 신청을 했어요 · 위에서 승인하거나 “참석”을 누르면 바로 확정돼요</span>}
                  {r.reqResult === "declined" && !r.req && r.answer !== "참석" && <span className="small"><span className="pill gray">반려됨</span> 참석 신청을 반려했어요</span>}
                  {whoFor === r.memberId && <span className="small">{r.checkedBy} 님이 {fmtDateTime(r.checkedAt ?? "")}에 대신 체크했어요. 회원이 직접 답하면 사라져요.</span>}
                  {r.answer === "참석" && evDays.length > 1 && (
                    <div className="att-days" role="group" aria-label={`${r.name} 참석일`}>
                      <span className="small">참석일</span>
                      {evDays.map((d) => (
                        <button key={d} type="button" aria-pressed={days.includes(d)} disabled={busy} onClick={() => toggleDay(r, d)}>{fmtDateDow(d)}</button>
                      ))}
                    </div>
                  )}
                  {r.refund === "wait" && <span className="small"><span className="pill warn">송금대기</span> 회비 {won(r.refundAmount ?? "0")}을 돌려줘야 해요 · 회비 탭에서 “송금완료”</span>}
                  {r.refund === "done" && <span className="small"><span className="pill gray">송금완료</span> 회비 {won(r.refundAmount ?? "0")} 돌려줌 · {fmtDate(r.refundDoneAt ?? "")}</span>}
                  {memoFor === r.memberId ? (
                    <input className="field" autoFocus aria-label={`${r.name} 메모`} maxLength={200} placeholder="메모 (Enter 또는 칸 밖을 누르면 저장)" value={memoText}
                      onChange={(e) => setMemoText(e.target.value)} onBlur={() => saveMemo(r)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setMemoFor(null); }} />
                  ) : r.memo ? <span className="small att-memo-text">메모: {r.memo}</span> : null}
                </li>
              );
            })}
          </ul>
          <span className="small">누르면 바로 저장돼요. 참석이 아니게 바꾸면 참석일이 지워지고, 입금이 확인된 회원은 송금대기가 돼요.</span>
          {ev.club && (
            <>
              <span className="small">클럽 일정이라 참석 신청 명단에는 {clubLabel(ev.club)} 회원과 참관자만 보여요(다른 회원은 일정을 읽기만 할 수 있어요). 일정 개요에서 클럽을 바꾸면 저장 후 반영돼요.</span>
              <ObserversCard key={ev.club} eventId={id} admin onChange={load} />
            </>
          )}
        </>
        );
      })()}

      {tab === "fee" && (
        <>
          <VisSwitch eventId={id} k="fee" note="켜 두면 참석 전에도 참석 일수별 예상 회비가 보여요." />
          {/* 회비 설정(개요에서 옮겨 옴): 입금 기한·계좌·예금주와 조건별 회비 줄. 아래 "회비 저장"으로 저장해요. */}
          {/* 입금 기한 · 입금 계좌 · 예금주 한 줄(좁으면 계좌가 넓게) */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1.25fr) minmax(0, 0.8fr)", gap: 6 }}>
            {!light && <><div className="compact-form"><label className="l" htmlFor="o-dl">입금 기한</label><DateField id="o-dl" mode="date" value={ev.feeDeadline} onChange={(v) => set("feeDeadline", v)} /></div>
            <div className="compact-form"><label className="l" htmlFor="o-acc">입금 계좌</label><input id="o-acc" className="field" value={ev.account} onChange={(e) => set("account", e.target.value)} /></div>
            <div className="compact-form"><label className="l" htmlFor="o-holder">예금주</label><input id="o-holder" className="field" value={ev.accountHolder ?? ""} onChange={(e) => set("accountHolder", e.target.value)} /></div></>}
          </div>
          {/* 회비: 회원구분 / 직책 / 참석일 조건별 (회의·미팅은 없음) */}
          {!light && <section className="card" aria-label="회비" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 제목 줄: 왼쪽 "회비" · 오른쪽 + 회비 줄 추가 */}
            <div className="row" style={{ gap: 6 }}>
              <b className="grow" style={{ font: `700 ${fs(15)} var(--display)` }}>회비</b>
              <button className="btn" type="button" style={{ width: "auto", minHeight: 34, padding: "0 10px", fontSize: fs(12) }} onClick={() => setRules([...rules, { days: "", kind: "", position: "", amount: "" }])}>+ 회비 줄 추가</button>
            </div>
            <span className="small" style={{ fontSize: fs(12) }}>
              회원마다 <b>조건이 가장 많이 맞는 줄</b>의 금액을 써요(모두 “전체”인 줄은 기본 회비, 맞는 줄이 없거나 0원이면 회비 없음). 직책의 “일반회원”은 직책이 없는 회원이에요. 회원에게는 <b>본인 회비만</b> 보여요.
            </span>
            {rules.length === 0 && <span className="small" style={{ fontSize: fs(12) }}>아직 회비가 없어요. 회비를 받는 일정이라면 “+ 회비 줄 추가”를 눌러 주세요.</span>}
            {rules.length > 0 && (
              <div className="tblw">
                <table className="tbl compact stack" style={{ minWidth: 520 }}>
                  <thead>
                    <tr><th>회원구분</th><th>직책</th><th>참석일</th><th>금액(원)</th><th style={{ width: 70 }}><span className="sr-only">삭제</span></th></tr>
                  </thead>
                  <tbody>
                    {rules.map((r, i) => {
                      const upd = (patch: Partial<FeeRule>) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      const sel = {} as const;
                      return (
                        <tr key={i}>
                          <td data-label="회원구분">
                            <select className="field" style={sel} aria-label={`${i + 1}번째 줄 회원구분`} value={r.kind} onChange={(e) => upd({ kind: e.target.value })}>
                              <option value="">전체</option>
                              {[...new Set([...opts.kinds, ...(r.kind ? [r.kind] : [])])].map((k) => <option key={k}>{k}</option>)}
                            </select>
                          </td>
                          <td data-label="직책">
                            <select className="field" style={sel} aria-label={`${i + 1}번째 줄 직책`} value={r.position} onChange={(e) => upd({ position: e.target.value })}>
                              <option value="">전체</option>
                              {[...new Set([...opts.positions, ...(r.position ? [r.position] : [])])].map((p) => <option key={p}>{p}</option>)}
                            </select>
                          </td>
                          <td data-label="참석일">
                            <select className="field" style={sel} aria-label={`${i + 1}번째 줄 참석일`} value={r.days} onChange={(e) => upd({ days: e.target.value })}>
                              <option value="">전체</option>
                              {Array.from({ length: dayCount }, (_, d) => d + 1).map((d) => (
                                <option key={d} value={String(d)}>{d === 1 ? "1일" : `${d}일 (${d - 1}박${d}일)`}</option>
                              ))}
                            </select>
                          </td>
                          <td data-label="금액(원)">
                            <CalcText className="field" style={sel} aria-label={`${i + 1}번째 줄 금액`} value={r.amount} onChange={(v) => upd({ amount: v })} />
                          </td>
                          <td className="act" data-label="">
                            <button className="mini danger" type="button" aria-label={`${i + 1}번째 줄 삭제`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>삭제</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rules.some((r) => !r.amount) && <span className="small" style={{ color: "var(--red-t)" }}>금액이 빈 줄이 있어요. 금액을 넣거나 줄을 삭제해 주세요.</span>}
            {dist.length > 0 && <span className="small" style={{ fontSize: fs(12) }}>현재 참석자 회비(저장 기준): {dist.map(([k, n]) => `${k} ${n}명`).join(" · ")}</span>}
          </section>}
          {/* 지원금: 모임회비에서 지원 / 회원이 지원금을 냄. 총 예산에 더한다. 아래 "회비 저장"으로 함께 저장. */}
          <section className="card" aria-label="지원금" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 제목 줄: 왼쪽 "지원금" · 오른쪽 + 모임회비 지원 / + 회원 지원 */}
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <b className="grow" style={{ font: `700 ${fs(15)} var(--display)` }}>지원금</b>
              <button className="btn" type="button" style={{ width: "auto", minHeight: 34, padding: "0 10px", fontSize: fs(12) }} onClick={() => setSupports([...supports, { kind: "dues", name: "", amount: "", memo: "" }])}>+ 모임회비 지원</button>
              <button className="btn" type="button" style={{ width: "auto", minHeight: 34, padding: "0 10px", fontSize: fs(12) }} onClick={() => setSupports([...supports, { kind: "member", name: "", amount: "", memo: "" }])}>+ 회원 지원</button>
            </div>
            <span className="small" style={{ fontSize: fs(12) }}>
              <b>모임회비 지원</b>은 모임{ev.club ? `(${clubLabel(ev.club)})` : ""} 회비에서 쓰는 돈(장부에 지출로 기록), <b>회원 지원</b>은 회원이 따로 내는 돈이에요. 둘 다 총 예산에 더해져요.
            </span>
            {supports.length > 0 && (
              <div className="tblw">
                <table className="tbl compact stack" style={{ minWidth: 520 }}>
                  <thead><tr><th>구분</th><th>지원한 분·내용</th><th>금액(원)</th><th>메모</th><th style={{ width: 70 }}><span className="sr-only">삭제</span></th></tr></thead>
                  <tbody>
                    {supports.map((x, i) => {
                      const upd = (patch: Partial<Support>) => setSupports(supports.map((y, j) => (j === i ? { ...y, ...patch } : y)));
                      const sel = {} as const;
                      return (
                        <tr key={i}>
                          <td data-label="구분">
                            <select className="field" style={sel} aria-label={`${i + 1}번째 지원금 구분`} value={x.kind} onChange={(e) => setAndSaveSupports(supports.map((y, j) => (j === i ? { ...y, kind: e.target.value as Support["kind"] } : y)))}>
                              <option value="dues">{SUPPORT_LABEL.dues}</option>
                              <option value="member">{SUPPORT_LABEL.member}</option>
                            </select>
                          </td>
                          <td data-label="지원한 분·내용">
                            <input className="field" style={sel} list={x.kind === "member" ? "sup-members" : undefined} maxLength={60} aria-label={`${i + 1}번째 지원한 분·내용`}
                              placeholder={x.kind === "member" ? "회원 이름" : `예) ${new Date().getFullYear()} 연회비`} value={x.name} onChange={(e) => upd({ name: e.target.value })} onBlur={() => saveSupports(supports)} />
                          </td>
                          <td data-label="금액(원)"><CalcText className="field" style={sel} aria-label={`${i + 1}번째 지원금 금액`} value={x.amount} onChange={(v) => upd({ amount: v })} onBlur={() => saveSupports(supports)} /></td>
                          <td data-label="메모"><input className="field" style={sel} maxLength={200} aria-label={`${i + 1}번째 지원금 메모`} value={x.memo} onChange={(e) => upd({ memo: e.target.value })} onBlur={() => saveSupports(supports)} /></td>
                          <td className="act" data-label=""><button className="mini danger" type="button" aria-label={`${i + 1}번째 지원금 삭제`} onClick={() => { if (!x.amount || window.confirm(`${x.name || SUPPORT_LABEL[x.kind]} ${won(x.amount)} 지원금을 지울까요?${x.kind === "dues" ? "\n모임설정 › 회비현황 장부에서도 함께 빠져요." : ""}`)) setAndSaveSupports(supports.filter((_, j) => j !== i)); }}>삭제</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="sup-members">{rows.map((r) => <option key={r.memberId} value={r.name} />)}</datalist>
              </div>
            )}
            {supports.some((x) => !x.amount) && <span className="small" style={{ color: "var(--red-t)" }}>금액이 빈 지원금이 있어요. 금액을 넣거나 삭제해 주세요.</span>}
            {nearNote("supports")}
          </section>
          {/* 총 예산 */}
          <MiniStats items={[
            ["참석자 회비 합계", `${won(totalOwed)} (${attend.length}명)`],
            ["지원금", won(supDues + supMember), `모임회비 지원 ${won(supDues)} · 회원 지원 ${won(supMember)}`],
            ["총 예산", won(totalBudget), "회비 + 지원금 (저장 기준)", "var(--blue-t)"],
          ]} />
          {!light && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn" type="button" disabled={busy || supports.some((x) => !x.amount)} style={{ width: "auto", minWidth: 120, minHeight: 40, fontSize: fs(14) }} onClick={() => save(undefined, "feeSave")}>회비 저장</button>
              {nearNote("feeSave") ?? <span className="small" style={{ fontSize: fs(12) }}>회비 설정과 지원금을 저장해요. 공개 상태는 그대로예요.</span>}
            </div>
          )}
          <MiniStats items={[
            ["입금 완료", `${paid.length}명 · ${won(totalPaid)} / ${won(totalOwed)}`, undefined, "var(--green-t)"],
            ["미입금", `${attend.length - paid.length}명`, undefined, "var(--red-t)"],
            ...(refundWait.length ? [["송금대기", `${refundWait.length}명 · ${won(refundWait.reduce((n, x) => n + x.amount, 0))}`, "참석에서 빠졌거나 회비가 줄어든 회원에게 돌려줄 회비", "var(--orange-t)"] as [string, string, string, string]] : []),
          ]} />
          {refunds.length > 0 && (
            <section className="card" aria-label="회비 돌려주기" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <b style={{ font: `700 ${fs(15)} var(--display)` }}>회비 돌려주기</b>
              <span className="small" style={{ fontSize: fs(12) }}>입금 확인 뒤 참석에서 빠졌거나(회비 합계에서 빠져요) 참석 날짜·회비가 바뀌어 차액이 생긴 회원이에요. 돌려준 뒤 “송금완료”를 누르면 회원에게 알림이 가고, 그전까지는 일주일마다 관리자에게 알려 드려요.</span>
              <div className="tblw">
                <table className="tbl compact stack" style={{ minWidth: 460 }}>
                  <thead><tr><th>이름</th><th>금액</th><th>상태</th><th>날짜</th><th></th></tr></thead>
                  <tbody>
                    {refunds.map(({ r, diff, amount }) => {
                      const waiting = diff || r.refund === "wait";
                      return (
                        <tr key={`${r.memberId}:${diff ? "diff" : r.refund}`}>
                          <td data-label=""><b>{r.name}</b></td>
                          <td className="num" data-label="금액">{diff ? `환불 ${won(String(amount))}` : won(String(amount))}</td>
                          <td data-label=""><span className={`pill ${waiting ? "warn" : "gray"}`}>{waiting ? "송금대기" : "송금완료"}</span></td>
                          <td className="num" data-label="날짜">{diff ? "참석 중 · 회비 줄어듦" : r.refund === "wait" ? `${fmtDate(r.refundSince ?? "")} 참석 해제` : `${fmtDate(r.refundDoneAt ?? "")} 송금`}</td>
                          <td className="act" data-label="">{waiting && <button className="mini" type="button" disabled={busy} onClick={() => refundDone(r, diff)}>송금완료</button>}{near?.at === `refund:${r.memberId}` && waiting && <div style={{ marginTop: 4 }}>{nearNote(`refund:${r.memberId}`)}</div>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <span className="small" style={{ fontSize: fs(12) }}>“입금 확인”을 누르면 그 회원 화면의 회비 알림이 바로 사라져요. 미입금 회원에게는 알림이 계속 보여요.</span>
          {attend.length === 0 && <div className="msg info">아직 참석을 신청한 회원이 없어요.</div>}
          {attend.length > 0 && (
            <div className="tblw">
              <table className="tbl compact stack" style={{ minWidth: 460 }}>
                <thead><tr><th>이름</th><th>금액</th><th>입금 상태</th><th>확인일</th><th></th></tr></thead>
                <tbody>
                  {attend.map((r) => (
                    <tr key={r.memberId}>
                      <td data-label=""><b>{r.name}</b></td>
                      <td className="num" data-label="금액">{r.feePending ? <span className="small">날짜 선택 전</span> : owed(r) ? owed(r).toLocaleString("ko-KR") : "-"}</td>
                      <td data-label="">
                        <span className={`pill ${r.paid ? "ok" : "warn"}`}>{r.paid ? "입금" : "미입금"}</span>
                        {r.payNotice && <span className="pill blue" style={{ marginLeft: 4 }}>{!r.paid ? "입금 알림 받음" : (r.feeDiff ?? 0) > 0 ? "추가 입금 알림" : "입금 알림 다시 받음"} {fmtDate(r.payNotice)}</span>}
                        {/* 입금 확인 때 금액과 지금 회비가 다름(참석 날짜·회비 조건 변경) */}
                        {r.paid && (r.feeDiff ?? 0) !== 0 && <span className="pill red" style={{ marginLeft: 4 }} title={`입금 확인 ${won(r.paidAmount ?? "0")}`}>차액 있음 · {(r.feeDiff ?? 0) > 0 ? `추가 입금 ${won(String(r.feeDiff))}` : `환불 ${won(String(-(r.feeDiff ?? 0)))}`}</span>}
                      </td>
                      <td className="num" data-label="확인일">{fmtDate(r.paidAt) || "-"}</td>
                      <td className="act" data-label="">
                        {/* 처리 결과 안내는 버튼 앞(위)에 */}
                        {near?.at === `pay:${r.memberId}` && <div style={{ marginBottom: 4 }}>{nearNote(`pay:${r.memberId}`)}</div>}
                        {r.paid && (r.feeDiff ?? 0) > 0 && <button className="mini" type="button" style={{ marginRight: 4 }} onClick={() => pay(r.memberId, true)}>추가 입금 확인</button>}
                        {/* 입금 확인 뒤 다시 들어온 알림: "입금 확인"을 먼저, "확인 취소"는 그 뒤 */}
                        {r.payNotice && r.paid && !((r.feeDiff ?? 0) > 0) && <button className="mini" type="button" style={{ marginRight: 4 }} title="이미 입금 확인된 회원이 다시 알렸어요. 입금 확인 알림을 한 번 더 보내요." onClick={() => dismissNotice(r.memberId)}>입금 확인</button>}
                        <button className="mini" type="button" onClick={() => pay(r.memberId, !r.paid)}>{r.paid ? "확인 취소" : "입금 확인"}</button>
                        {r.payNotice && !(r.paid && !((r.feeDiff ?? 0) > 0)) && <button className="mini danger" type="button" style={{ marginLeft: 4 }} onClick={() => pay(r.memberId, false, true)}>입금 안 됨</button>}
                      </td>
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

// 클럽관리에서 열면(?club=클럽) 위쪽 메뉴도 클럽관리로 둔다.
// ?tab=fee 처럼 열 탭을 정할 수 있다(종 알림의 입금 알림에서 회비 탭으로 바로).
export default function EventDetailAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ club?: string; tab?: string }> }) {
  const { id } = use(params);
  const { club, tab } = use(searchParams);
  return <AdminGate mode={club ? "clubs" : "events"} active={club ? "/admin/clubs" : undefined} need={["events", "evMain", "evClub", "clubs"]}><Detail id={id} initialTab={tab} /></AdminGate>;
}
