"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentSheet } from "@/components/ConsentSheet";
import { EventCalendar } from "@/components/EventCalendar";
import { EventCreate } from "@/components/EventCreate";
import { IconPin } from "@/components/Icons";
import { MemberTabs } from "@/components/MemberTabs";
import { api, fmtDate, fmtWhen, TYPE_TONE } from "@/lib/client";
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

  // 일정 카드(목업 C): 칩 줄(고정·유형 + 오른쪽 내 상태) → 왼쪽 날짜 칸(월/일/요일) | 이름·일시·장소
  // 일정 관리 권한이 있으면 카드 아래 "일정 관리"(관리 화면, 관리자 비밀번호를 아직 확인하지 않았으면 그 화면에서 묻는다)
  const item = (e: Ev) => {
    const d = dateParts(e.startsAt);
    const dim = !e.canApply && !e.draft;
    const status = e.draft ? null
      : e.needsAnswer ? <span className="st" style={{ color: "var(--red-t)" }}>참석 여부 체크 필요</span>
      : e.myAnswer === "불참" ? <span className="st" style={{ color: "var(--sub)", fontWeight: 500 }}>불참으로 알림</span>
      : e.myAnswer ? <span className="st" style={{ color: "var(--violet-t)" }}>{e.myAnswer}</span>
      : dim ? <span className="st" style={{ color: "var(--sub)", fontWeight: 500 }}>내 소모임 아님 · 신청 가능</span>
      : null;
    return (
      <div key={e.id} className={`evcard${dim ? " dim" : ""}`}>
        <button type="button" disabled={locked} onClick={() => open(e)}>
          <span className="top">
            {e.pinned && !e.past && <span className="chip red"><IconPin size={12} />고정</span>}
            <span className={`chip ${TYPE_CHIP[TYPE_TONE[e.type] ?? "gray"] ?? "line"}`}>{e.club ? `${e.type} · ${e.club}` : e.type}</span>
            {e.draft && <span className="chip gray">초안 · 회원에게 안 보임</span>}
            {status}
          </span>
          <span className="body">
            <span className="date" aria-hidden="true">
              {d ? <>{d.m}월<b>{d.d}</b>{d.w}</> : <>날짜<b>–</b>미정</>}
            </span>
            <span className="info">
              <span className="n">{e.name}</span>
              <span className="s">{fmtWhen(e.startsAt, e.endsAt, e.place)}</span>
              {(e.feeDue || e.feePaid) && (
                <span style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  {e.feeDue && (e.payNotice ? <span className="chip warn">₩ 입금 확인 중</span> : <span className="chip red">₩ 회비 미입금</span>)}
                  {e.feePaid && <span className="chip violet">회비 입금 ✓</span>}
                </span>
              )}
            </span>
          </span>
        </button>
        {canManage && !e.draft && (
          <div className="foot">
            <a href={`/admin/events/${e.id}`} onClick={(ev) => { ev.preventDefault(); router.push(`/admin/events/${e.id}`); }} aria-label={`${e.name} 일정 관리`}>일정 관리 ›</a>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="app with-tabs">
      {/* 윗줄(목업 C): 제목 + 리스트|캘린더 보기 전환 (+ 일정 만들기) */}
      <header className="topbar pagebar">
        <h1 className="title">예정된 일정</h1>
        <div className="seg" role="group" aria-label="보기 방식" style={{ flex: "none" }}>
          <button type="button" aria-pressed={view === "list"} onClick={() => view !== "list" && toggleView()} style={{ minHeight: 36, padding: "0 12px", fontSize: fs(13) }}>
            리스트
          </button>
          <button type="button" aria-pressed={view === "calendar"} onClick={() => view !== "calendar" && toggleView()} style={{ minHeight: 36, padding: "0 12px", fontSize: fs(13) }}>
            캘린더
          </button>
        </div>
        {canCreate && (
          <button type="button" className="btn" style={{ width: "auto", minHeight: 36, padding: "0 12px", flex: "none", fontSize: fs(13), fontWeight: 500 }} aria-haspopup="dialog" disabled={locked} onClick={() => setCreating(true)}>
            + 일정 만들기
          </button>
        )}
      </header>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {!events && !error && <p className="small">불러오는 중이에요…</p>}
      {view === "list" && events && upcoming.length === 0 && <div className="msg info">아직 예정된 일정이 없어요.</div>}

      {view === "calendar" && events && <EventCalendar events={shown} renderItem={item} hrefOf={hrefOf} />}

      {view === "list" && upcoming.length > 0 && <div className="evlist">{upcoming.map(item)}</div>}

      {view === "list" && past.length > 0 && (
        <section aria-label="지난 일정" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="morebtn" aria-expanded={showPast} aria-controls="past-list" onClick={() => setShowPast(!showPast)}>
            {showPast ? "지난 일정 접기 ▴" : `지난 일정 ${past.length}개 보기 ▾`}
          </button>
          {showPast && <div id="past-list" className="evlist">{past.map(item)}</div>}
        </section>
      )}
      {view === "list" && upcoming.length > 0 && <p className="hint" style={{ fontSize: fs(12) }}>일정을 누르면 그 일정에 필요한 화면으로 이동해요. 다른 소모임 일정은 읽어 볼 수 있고, 가입이나 참관을 신청할 수 있어요.</p>}

      {drafts.length > 0 && (
        <section aria-label="공개 전 초안" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>공개 전 초안 {drafts.length}개</b>
          <span className="small">관리 권한이 있는 회원에게만 보여요. 누르면 일정 관리 화면에서 내용을 채우고 “회원에게 전달”할 수 있어요.</span>
          <div className="evlist">{drafts.map(item)}</div>
        </section>
      )}

      {me && canCreate && creating && <EventCreate open={creating} onClose={() => setCreating(false)} clubs={me.clubOptions ?? []} unlocked={me.admin} />}

      {me && <ConsentSheet consent={me.consent} onAgreed={() => setMe({ ...me, consent: true })} />}

      <MemberTabs on="events" />
    </main>
  );
}

// 유형 칩 색(TYPE_TONE) → 작은 칩 모양. 회색 유형은 테두리만 있는 칩.
const TYPE_CHIP: Record<string, string> = { red: "red", violet: "violet", warn: "warn", ink: "ink", gray: "line" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
// 날짜 칸(월/일/요일). fmtDate 가 한국 시간 "YYYY/MM/DD" 로 바꿔 준다.
function dateParts(startsAt: string): { m: number; d: number; w: string } | null {
  const v = fmtDate(startsAt);
  const x = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(v);
  if (!x) return null;
  const [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  return { m, d, w: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}
