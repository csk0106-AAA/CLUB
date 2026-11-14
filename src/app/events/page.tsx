"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentSheet } from "@/components/ConsentSheet";
import { EventCalendar } from "@/components/EventCalendar";
import { EventCreate } from "@/components/EventCreate";
import { IconCalendar, IconPin } from "@/components/Icons";
import { MemberTabs } from "@/components/MemberTabs";
import { api, fmtWhen, TYPE_TONE } from "@/lib/client";
import { fs } from "@/lib/fs";

type Ev = {
  id: string;
  type: string;
  name: string;
  startsAt: string;
  endsAt: string;
  place: string;
  status: string;
  myAnswer: string;
  feeDue: boolean;
  feePaid: boolean;
  payNotice: boolean;
  club?: string;
  pinned: boolean;
  past: boolean;
  group: number; // 0 고정 / 1 참석 예정·미응답·내 소모임 / 2 불참·다른 소모임 / 3 지난 일정
  canApply: boolean;
  needsAnswer: boolean;
  draft?: boolean; // 공개 전 초안(일정 관리 권한이 있는 회원에게만 온다)
};
type Me = { name: string; consent: boolean; admin: boolean; livePerms?: string[]; clubOptions?: string[] };
type View = "list" | "calendar";
// 고른 보기(리스트/캘린더)는 이 기기에만 기억한다.
const VIEW_KEY = "club:events-view";
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "list";
  } catch {
    return "list";
  }
}

// ② 예정된 일정. 순서는 서버(/api/events)가 정한다: 고정 → 참석 예정·미응답·내 소모임 → 불참·다른 소모임 → 지난 일정.
export default function EventsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("list");
  // 지난 일정은 늘 접힌 채로 시작한다(펼침 상태는 기억하지 않음).
  const [showPast, setShowPast] = useState(false);
  useEffect(() => setView(readView()), []);
  function toggleView() {
    const next: View = view === "list" ? "calendar" : "list";
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // 저장소를 못 쓰는 환경: 이번에만 적용
    }
  }

  useEffect(() => {
    (async () => {
      const m = await api<Me>("/api/me");
      if (!m.ok) {
        if (m.status === 401) router.replace("/");
        else setError(m.error);
        return;
      }
      setMe(m.data);
      const e = await api<{ events: Ev[] }>("/api/events");
      if (e.ok) setEvents(e.data.events);
      else setError("일정 목록을 불러오지 못했어요. 화면을 새로 고쳐 주세요.");
    })();
  }, [router]);

  const locked = me ? !me.consent : true;
  // 일정 만들기: 일정 권한(all/events), 일정 관리 화면: 일정·회비 권한(all/events/fees) — 지금 DB 기준 권한
  const perms = me?.livePerms ?? [];
  const canCreate = perms.includes("all") || perms.includes("events");
  const canManage = canCreate || perms.includes("fees");
  const [creating, setCreating] = useState(false);

  // 참석 여부를 아직 안 알린 일정(또는 신청할 수 없는 다른 소모임 일정)는 개요(③)부터, 알린 일정은 홈(⑥)으로 간다.
  // 초안은 회원 화면이 없으므로 관리 화면으로 간다.
  const hrefOf = (e: Ev) => (e.draft ? `/admin/events/${e.id}` : e.myAnswer === "" ? `/events/${e.id}/overview` : `/events/${e.id}`);
  function open(e: Ev) {
    router.push(hrefOf(e));
  }

  const shown = events?.filter((e) => !e.draft) ?? [];
  const drafts = events?.filter((e) => e.draft) ?? [];
  const upcoming = shown.filter((e) => !e.past);
  const past = shown.filter((e) => e.past);

  const card = (e: Ev) => (
    <button key={e.id} className="opt" type="button" disabled={locked} onClick={() => open(e)}
      style={e.needsAnswer ? { boxShadow: "inset 3px 0 0 var(--red)" } : undefined}>
      <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {e.pinned && !e.past && <span className="pill red" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><IconPin size={13} />고정</span>}
        <span className={`pill ${TYPE_TONE[e.type] ?? "gray"}`}>{e.club ? `${e.type} · ${e.club}` : e.type}</span>
        {e.draft && <span className="pill gray">초안 · 회원에게 안 보임</span>}
        {!e.canApply && !e.draft && <span className="pill gray">내 소모임 아님</span>}
      </span>
      <span className="name">{e.name}</span>
      <span className="small">{fmtWhen(e.startsAt, e.endsAt, e.place)}</span>
      {e.needsAnswer && <span className="pill bad">! 참석 여부를 체크해 주세요</span>}
      {e.myAnswer === "불참" && <span className="pill gray">불참으로 알림</span>}
      {e.feeDue && (e.payNotice ? <span className="pill warn">₩ 입금 확인 중</span> : <span className="pill bad">₩ 회비 미입금</span>)}
      {e.feePaid && <span className="pill ok">회비 입금 ✓</span>}
    </button>
  );
  // 일정 관리 권한이 있으면 줄 오른쪽에 "일정 관리"(관리 화면, 관리자 비밀번호를 아직 확인하지 않았으면 그 화면에서 묻는다)
  const item = (e: Ev) =>
    canManage && !e.draft ? (
      <div key={e.id} style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex" }}>{card(e)}</div>
        <a className="mini" href={`/admin/events/${e.id}`} onClick={(ev) => { ev.preventDefault(); router.push(`/admin/events/${e.id}`); }}
          style={{ alignSelf: "center", margin: "0 10px", textDecoration: "none" }} aria-label={`${e.name} 일정 관리`}>일정 관리</a>
      </div>
    ) : (
      card(e)
    );

  return (
    <main className="app with-tabs">
      <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <h1 className="title grow">예정된 일정</h1>
        <div className="seg" role="group" aria-label="보기 방식" style={{ flex: "none" }}>
          <button type="button" aria-pressed={view === "list"} onClick={() => view !== "list" && toggleView()} style={{ minHeight: 44, padding: "0 12px" }}>
            <ListIcon />리스트
          </button>
          <button type="button" aria-pressed={view === "calendar"} onClick={() => view !== "calendar" && toggleView()} style={{ minHeight: 44, padding: "0 12px" }}>
            <IconCalendar size={18} />캘린더
          </button>
        </div>
        {canCreate && (
          <button type="button" className="btn" style={{ width: "auto", minHeight: 44, padding: "0 14px", flex: "none" }} aria-haspopup="dialog" disabled={locked} onClick={() => setCreating(true)}>
            + 일정 만들기
          </button>
        )}
      </div>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {!events && !error && <p className="small">불러오는 중이에요…</p>}
      {view === "list" && events && upcoming.length === 0 && <div className="msg info">아직 예정된 일정이 없어요.</div>}

      {view === "calendar" && events && <EventCalendar events={shown} renderItem={item} hrefOf={hrefOf} />}

      {view === "list" && upcoming.length > 0 && <div className="rows">{upcoming.map(item)}</div>}
      {view === "list" && upcoming.length > 0 && <p className="hint">일정을 누르면 그 일정에 필요한 화면으로 이동해요. 다른 소모임 일정은 읽어 볼 수 있고, 가입이나 참관을 신청할 수 있어요.</p>}

      {view === "list" && past.length > 0 && (
        <section aria-label="지난 일정" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" className="btn white" aria-expanded={showPast} aria-controls="past-list" onClick={() => setShowPast(!showPast)}>
            {showPast ? "접기 ▴" : `지난 일정 ${past.length}개 보기 ▾`}
          </button>
          {showPast && <div id="past-list" className="rows">{past.map(item)}</div>}
        </section>
      )}

      {drafts.length > 0 && (
        <section aria-label="공개 전 초안" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>공개 전 초안 {drafts.length}개</b>
          <span className="small">관리 권한이 있는 회원에게만 보여요. 누르면 일정 관리 화면에서 내용을 채우고 “회원에게 전달”할 수 있어요.</span>
          <div className="rows">{drafts.map(item)}</div>
        </section>
      )}

      {me && canCreate && creating && <EventCreate open={creating} onClose={() => setCreating(false)} clubs={me.clubOptions ?? []} unlocked={me.admin} />}

      {me && <ConsentSheet consent={me.consent} onAgreed={() => setMe({ ...me, consent: true })} />}

      <MemberTabs on="events" />
    </main>
  );
}

// 리스트로 보기 아이콘(줄 세 개)
function ListIcon() {
  return (
    <svg width={18} height={18} style={{ width: fs(18), height: fs(18), flex: "none" }} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
