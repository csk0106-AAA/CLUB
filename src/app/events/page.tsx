"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentSheet } from "@/components/ConsentSheet";
import { EventCalendar } from "@/components/EventCalendar";
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
  group: number; // 0 고정 / 1 참석 예정·미응답·내 소모임 / 2 불참·다른 소모임 / 3 지난 행사
  canApply: boolean;
  needsAnswer: boolean;
};
type Me = { name: string; consent: boolean };
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

// ② 예정된 행사. 순서는 서버(/api/events)가 정한다: 고정 → 참석 예정·미응답·내 소모임 → 불참·다른 소모임 → 지난 행사.
export default function EventsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("list");
  // 지난 행사는 늘 접힌 채로 시작한다(펼침 상태는 기억하지 않음).
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
      else setError("행사 목록을 불러오지 못했어요. 화면을 새로 고쳐 주세요.");
    })();
  }, [router]);

  const locked = me ? !me.consent : true;

  // 참석 여부를 아직 안 알린 행사(또는 신청할 수 없는 다른 소모임 행사)는 개요(③)부터, 알린 행사는 홈(⑥)으로 간다.
  const hrefOf = (e: Ev) => (e.myAnswer === "" ? `/events/${e.id}/overview` : `/events/${e.id}`);
  function open(e: Ev) {
    router.push(hrefOf(e));
  }

  const upcoming = events?.filter((e) => !e.past) ?? [];
  const past = events?.filter((e) => e.past) ?? [];

  const item = (e: Ev) => (
    <button key={e.id} className="opt" type="button" disabled={locked} onClick={() => open(e)}
      style={e.needsAnswer || e.pinned ? { borderColor: "var(--blue)" } : undefined}>
      <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {e.pinned && !e.past && <span className="pill blue" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><IconPin size={13} />고정</span>}
        <span className={`pill ${TYPE_TONE[e.type] ?? "gray"}`}>{e.club ? `${e.type} · ${e.club}` : e.type}</span>
        {!e.canApply && <span className="pill gray">내 소모임 아님</span>}
      </span>
      <span className="name">{e.name}</span>
      <span className="small">{fmtWhen(e.startsAt, e.endsAt, e.place)}</span>
      {e.needsAnswer && <span className="pill warn">참석 여부를 체크해 주세요</span>}
      {e.myAnswer === "불참" && <span className="pill gray">불참으로 알림</span>}
      {e.feeDue && (e.payNotice ? <span className="pill warn">₩ 입금 확인 중</span> : <span className="pill bad">₩ 회비 미입금</span>)}
      {e.feePaid && <span className="pill ok">회비 입금 ✓</span>}
    </button>
  );

  return (
    <main className="app with-tabs">
      <div className="row" style={{ alignItems: "center" }}>
        <h1 className="title grow" style={{ fontSize: fs(22) }}>예정된 행사</h1>
        <button type="button" className="mini" onClick={toggleView} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, flex: "none" }}>
          {view === "list" ? <><IconCalendar size={20} />캘린더로 보기</> : <><ListIcon />리스트로 보기</>}
        </button>
      </div>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {!events && !error && <p className="small">불러오는 중이에요…</p>}
      {view === "list" && events && upcoming.length === 0 && <div className="msg info">아직 예정된 행사가 없어요.</div>}

      {view === "calendar" && events && <EventCalendar events={events} renderItem={item} hrefOf={hrefOf} />}

      {view === "list" && upcoming.length > 0 && <div className="pick">{upcoming.map(item)}</div>}
      {view === "list" && upcoming.length > 0 && <p className="hint">행사를 누르면 그 행사에 필요한 화면으로 이동해요. 다른 소모임 행사는 읽어 볼 수 있고, 가입이나 참관을 신청할 수 있어요.</p>}

      {view === "list" && past.length > 0 && (
        <section aria-label="지난 행사" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" className="btn white" aria-expanded={showPast} aria-controls="past-list" onClick={() => setShowPast(!showPast)}>
            {showPast ? "접기 ▴" : `지난 행사 ${past.length}개 보기 ▾`}
          </button>
          {showPast && <div id="past-list" className="pick">{past.map(item)}</div>}
        </section>
      )}

      {me && <ConsentSheet consent={me.consent} onAgreed={() => setMe({ ...me, consent: true })} />}

      <MemberTabs on="events" />
    </main>
  );
}

// 리스트로 보기 아이콘(줄 세 개)
function ListIcon() {
  return (
    <svg width={20} height={20} style={{ width: fs(20), height: fs(20), flex: "none" }} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
