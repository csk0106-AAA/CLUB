"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplyNotice } from "@/components/ApplyNotice";
import { ConsentSheet } from "@/components/ConsentSheet";
import { EventCreate } from "@/components/EventCreate";
import { IconPin } from "@/components/Icons";
import { MainHeader } from "@/components/MainHeader";
import { FreshChip, type Fresh } from "@/components/FreshChip";
import { MemberTabs, markSeenAfterList } from "@/components/MemberTabs";
import { WeekStrip } from "@/components/WeekStrip";
import { api, fmtDate, fmtRange, TYPE_TONE } from "@/lib/client";
import { fs } from "@/lib/fs";
import { creatableTypes } from "@/lib/perm-keys";

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
  group: number; // 0 고정 / 1 참석 예정·미응답·내 클럽 / 2 불참·다른 클럽 / 3 지난 일정
  canApply: boolean;
  needsAnswer: boolean;
  draft?: boolean; // 공개 전 초안(일정 관리 권한이 있는 회원 또는 만든 사람에게만 온다)
  mine?: boolean; // 내가 만든 일정
  outside?: boolean; // 공개 대상 밖의 일정(일정 관리 권한이 있는 회원에게만 온다)
  fresh?: Fresh | null; // 마지막으로 본 뒤 새로 공개(NEW) / 바뀜(UP)
  going?: number; // 참석 인원
  coverUrl?: string; // 카드 사진 주소(회원 사진 → 클럽·모임 대표사진, 없으면 "")
  photoCount?: number;
};
type Me = { name: string; consent: boolean; admin: boolean; livePerms?: string[]; clubOptions?: string[] };

const PAST_STEP = 10; // 지난 일정은 10개씩 더 보기

// ② 일정 › 타임라인: 위에 주간 달력, 아래에 날짜별 일정 피드(다가오는 일정 → 날짜 미정 → 지난 일정).
// 날짜를 누르면 피드가 그날(없으면 그 뒤 가장 가까운 날)로 이동한다. 고정 일정은 맨 위에 따로 보여 준다.
export default function EventsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  const [pastShown, setPastShown] = useState(PAST_STEP);

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
      if (e.ok) {
        setEvents(e.data.events);
        // 목록을 받은 뒤 "봤음"으로 표시(NEW / UP 은 이번 방문 동안 남고, 다음에 열면 사라진다)
        markSeenAfterList("events");
      } else setError("일정 목록을 불러오지 못했어요. 화면을 새로 고쳐 주세요.");
    })();
  }, [router]);

  const locked = me ? !me.consent : true;
  // 일정관리(모든 일정) 또는 일정 만들기 권한(evMain·evClub: 정해진 종류만, 내가 만든 일정만 관리)
  const perms = me?.livePerms ?? [];
  const canManageAll = perms.includes("all") || perms.includes("events");
  const canCreate = canManageAll || perms.includes("evMain") || perms.includes("evClub");
  const createTypes = creatableTypes(perms);
  const canManageOf = (e: Ev) => canManageAll || !!e.mine;
  const [creating, setCreating] = useState(false);

  // 일정은 모두 일정 화면(/events/[id])으로 간다. 초안·공개 대상 밖의 일정은 관리 화면으로.
  // 관리 화면 주소: 클럽 일정은 ?club= 을 붙여 위쪽 메뉴가 클럽관리로, 돌아가기는 그 클럽의 일정 목록으로.
  const manageHref = (e: Ev) => `/admin/events/${e.id}${e.club ? `?club=${encodeURIComponent(e.club)}` : ""}`;
  const hrefOf = (e: Ev) => (e.draft || e.outside ? manageHref(e) : `/events/${e.id}`);

  const shown = useMemo(() => events?.filter((e) => !e.draft) ?? [], [events]);
  const drafts = events?.filter((e) => e.draft) ?? [];
  const pinned = shown.filter((e) => e.pinned && !e.past);
  // 다가오는 일정: 날짜순(서버 순서는 참석 상태로 묶여 있어 타임라인에서는 날짜로 다시 정렬)
  const upcoming = shown.filter((e) => !e.past && !e.pinned && e.startsAt).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const undated = shown.filter((e) => !e.past && !e.pinned && !e.startsAt);
  const past = shown.filter((e) => e.past); // 서버가 최근 것 먼저 보낸다

  // 다가오는 일정을 날짜(한국 시간)별로 묶는다
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of upcoming) {
      const k = dayKey(e.startsAt);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [upcoming]);

  // 주간 달력에서 날짜를 고르면 그날(없으면 그 뒤 가장 가까운 날, 지난 날이면 지난 일정)로 이동
  function pick(d: string) {
    setDay(d);
    const target = byDay.find(([k]) => k >= d)?.[0];
    const id = target ? `tl-${target}` : past.some((e) => dayKey(e.startsAt) <= d) ? "tl-past" : "";
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // 타임라인 카드(4줄): ① 유형 칩 + 고정·NEW/UP·회비 상태·공개 대상 아님·초안 ② 제목 ③ 일시(장소 없음) ④ 내 상태 · 참석 인원 · 사진 수
  // 왼쪽 사진(회원 사진 → 대표사진 → 유형 칸)은 4줄 높이에 꽉 맞춘다. "일정 관리"는 카드 밖 날짜 줄 오른쪽 끝(head)
  const item = (e: Ev) => {
    const dim = !e.canApply && !e.draft;
    const status = e.draft ? null
      : e.needsAnswer ? <span style={{ color: "var(--red-t)", fontWeight: 700 }}>참석 여부 체크 필요</span>
      : e.myAnswer === "불참" ? <span>불참으로 알림</span>
      : e.myAnswer ? <span style={{ color: "var(--violet-t)", fontWeight: 700 }}>{e.myAnswer}</span>
      : dim ? <span>내 클럽 아님 · 신청 가능</span>
      : null;
    const extra = [(e.going ?? 0) > 0 ? `${e.going}명 참석` : "", (e.photoCount ?? 0) > 0 ? `사진 ${e.photoCount}장` : ""].filter(Boolean).join(" · ");
    return (
      <div key={e.id} className={`evcard tl${dim ? " dim" : ""}`}>
        <button type="button" disabled={locked} onClick={() => router.push(hrefOf(e))}>
          <span className="body">
            {e.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tl-thumb" src={e.coverUrl} alt="" loading="lazy" />
            ) : (
              // 회원 사진도 대표사진도 없으면 유형 이름 칸(관리자가 모임설정·클럽 개요에서 대표사진을 올리면 그 사진이 보인다)
              <span className="tl-thumb tl-none" aria-hidden="true">{e.type}</span>
            )}
            <span className="info">
              <span className="top">
                <span className={`chip ${TYPE_CHIP[TYPE_TONE[e.type] ?? "gray"] ?? "line"}`}>{e.club ? `${e.type} · ${e.club}` : e.type}</span>
                {e.pinned && !e.past && <span className="chip red"><IconPin size={12} />고정</span>}
                <FreshChip fresh={e.fresh} />
                {e.feeDue && (e.payNotice ? <span className="chip warn">₩ 입금 확인 중</span> : <span className="chip red">₩ 회비 미입금</span>)}
                {e.feePaid && <span className="chip violet">회비 입금 ✓</span>}
                {e.outside && <span className="chip line">공개 대상 아님</span>}
                {e.draft && <span className="chip gray">초안 · 회원에게 안 보임</span>}
              </span>
              <span className="n">{e.name}</span>
              <span className="s">{fmtRange(e.startsAt, e.endsAt)}</span>
              {(status || extra) && (
                <span className="s tl-meta">
                  {status}{status && extra ? " · " : ""}{extra}
                </span>
              )}
            </span>
          </span>
        </button>
      </div>
    );
  };

  // 날짜 줄(오른쪽 끝에 "일정 관리"): 그 날짜의 일정 중 내가 관리할 수 있는 일정마다 링크.
  // 한 날짜에 둘 이상이면 "(이름) 관리 ›"로 구분한다.
  const manageLinks = (list: Ev[]) => {
    const mine = list.filter((e) => canManageOf(e) && !e.draft && !e.outside);
    if (mine.length === 0) return null;
    return (
      <span className="tl-links">
        {mine.map((e) => (
          <a key={e.id} href={manageHref(e)} onClick={(ev) => { ev.preventDefault(); router.push(manageHref(e)); }} aria-label={`${e.name} 일정 관리`}>
            {mine.length > 1 ? <><span className="tl-lname">{e.name}</span> 관리 ›</> : "일정 관리 ›"}
          </a>
        ))}
      </span>
    );
  };
  const head = (label: React.ReactNode, list: Ev[]) => (
    <div className="tl-hrow">
      <h2 className="tl-h">{label}</h2>
      {manageLinks(list)}
    </div>
  );

  return (
    <main className="app with-tabs">
      {/* 윗줄: 홈·프로필 북과 같은 공통 머리(프로필 + 이름 + 알림·조직도·로그아웃) */}
      <MainHeader />
      {/* 화면 제목은 보이지 않게(화면 낭독기용). 윗줄은 달력 머리: 연도 | 오늘 · 주/월 */}
      <h1 className="sr-only">일정 타임라인</h1>
      <WeekStrip events={shown} selected={day} onPick={pick} hrefOf={hrefOf} />

      {error && <div className="msg bad" role="alert">{error}</div>}
      {!events && !error && <p className="small">불러오는 중이에요…</p>}

      {/* 일정 피드 맨 위: 일정 만들기(권한이 있을 때) */}
      {canCreate && (
        <div className="tl-create">
          <button type="button" className="btn wk-create" aria-haspopup="dialog" disabled={locked} onClick={() => setCreating(true)}>
            + 일정 만들기
          </button>
        </div>
      )}

      {pinned.length > 0 && (
        <section aria-label="고정 일정" className="tl-group">
          {head(<><IconPin size={14} /> 고정</>, pinned)}
          <div className="evlist">{pinned.map(item)}</div>
        </section>
      )}

      {events && byDay.length === 0 && undated.length === 0 && pinned.length === 0 && <div className="msg info">아직 예정된 일정이 없어요.</div>}

      {byDay.map(([k, list]) => (
        <section key={k} id={`tl-${k}`} aria-label={dayLabel(k)} className={`tl-group${day && k === day ? " on" : ""}`}>
          {head(<>{dayLabel(k)}{dday(k) && <span className="tl-dday">{dday(k)}</span>}</>, list)}
          <div className="evlist">{list.map(item)}</div>
        </section>
      ))}

      {undated.length > 0 && (
        <section aria-label="날짜 미정" className="tl-group">
          {head("날짜 미정", undated)}
          <div className="evlist">{undated.map(item)}</div>
        </section>
      )}

      {past.length > 0 && (
        <section id="tl-past" aria-label="지난 일정" className="tl-group">
          <div className="tl-sep"><span>지난 일정</span></div>
          {/* 지난 일정도 날짜 줄로 묶는다(최근 날짜 먼저) */}
          {groupByDay(past.slice(0, pastShown)).map(([k, list]) => (
            <div key={k} className="tl-group">
              {head(k ? dayLabel(k) : "날짜 미정", list)}
              <div className="evlist">{list.map(item)}</div>
            </div>
          ))}
          {past.length > pastShown && (
            <button type="button" className="morebtn" onClick={() => setPastShown(pastShown + PAST_STEP)}>지난 일정 더 보기 ({past.length - pastShown}개 남음) ▾</button>
          )}
        </section>
      )}

      {drafts.length > 0 && (
        <section aria-label="공개 전 초안" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>공개 전 초안 {drafts.length}개</b>
          <span className="small">관리 권한이 있는 회원에게만 보여요. 누르면 일정 관리 화면에서 내용을 채우고 “공개 및 회원전달”을 누를 수 있어요.</span>
          <div className="evlist">{drafts.map(item)}</div>
        </section>
      )}

      {me && canCreate && creating && <EventCreate open={creating} onClose={() => setCreating(false)} clubs={me.clubOptions ?? []} unlocked={me.admin} allowed={createTypes} />}

      {me && <ConsentSheet consent={me.consent} onAgreed={() => setMe({ ...me, consent: true })} />}
      {me && <ApplyNotice ready={me.consent} />}

      <MemberTabs on="events" />
    </main>
  );
}

// 유형 칩 색(TYPE_TONE) → 작은 칩 모양. 회색 유형은 테두리만 있는 칩.
const TYPE_CHIP: Record<string, string> = { red: "red", violet: "violet", warn: "warn", ink: "ink", gray: "line" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
// 순서를 지키며 날짜(한국 시간)별로 묶기
function groupByDay<T extends { startsAt: string }>(list: T[]): [string, T[]][] {
  const out: [string, T[]][] = [];
  for (const e of list) {
    const k = e.startsAt ? dayKey(e.startsAt) : "";
    const last = out[out.length - 1];
    if (last && last[0] === k) last[1].push(e);
    else out.push([k, [e]]);
  }
  return out;
}
// 한국 시간 날짜 "YYYY-MM-DD"
function dayKey(startsAt: string): string {
  return fmtDate(startsAt).replace(/\//g, "-");
}
// "12월 11일 (목)" — 올해가 아니면 연도도
function dayLabel(k: string): string {
  const [y, m, d] = k.split("-").map(Number);
  const w = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y !== new Date().getFullYear() ? `${y}년 ` : ""}${m}월 ${d}일 (${w})`;
}
// 오늘 / 내일 / D-n
function dday(k: string): string {
  const t = new Date();
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const [y, m, d] = k.split("-").map(Number);
  const n = Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n > 1 ? `D-${n}` : "";
}
