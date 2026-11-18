"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDate } from "@/lib/client";

// 홈 맨 위 "다가오는 일정" 카드: 한 달 안에 시작하는 일정 중 날짜가 가장 가까운 3개까지(옆으로 넘기기 + 5초마다 자동으로 다음 카드).
// 자동 넘김은 손가락·마우스를 올리거나 포커스가 있으면 멈추고, 기기의 "동작 줄이기"가 켜져 있으면 하지 않는다.
// 카드: 사진(회원 사진 → 클럽·모임 대표사진, 없으면 바탕색) 위에 D-day · 이름 · 날짜 · 참석 인원. 누르면 일정 화면.
type Ev = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string; club?: string;
  past: boolean; draft?: boolean; outside?: boolean; pinned: boolean; coverUrl?: string; going?: number; myAnswer: string; needsAnswer: boolean;
};

const MAX = 3; // 가장 가까운 순으로 3개까지
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
// 시작일(한국 시간) "YYYY-MM-DD"
const startDay = (startsAt: string) => fmtDate(startsAt).replace(/\//g, "-");
// 한 달 뒤 같은 날 "YYYY-MM-DD"(다음 달에 그날이 없으면 그달 말일: 1/31 → 2/28). 이날보다 늦게 시작하는 일정은 홈에 안 보인다.
function monthLater(): string {
  const t = new Date();
  const y = t.getFullYear(), m = t.getMonth() + 1;
  const last = new Date(y, m + 1, 0).getDate();
  const d = new Date(y, m, Math.min(t.getDate(), last));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function when(startsAt: string): string {
  const x = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(fmtDate(startsAt));
  if (!x) return "날짜 미정";
  const [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  const t = startsAt.length >= 16 && /T\d{2}:\d{2}/.test(startsAt) && !/[Z+]/.test(startsAt.slice(10)) ? ` ${startsAt.slice(11, 16)}` : "";
  return `${m}월 ${d}일 (${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})${t}`;
}
function dday(startsAt: string, endsAt: string): string {
  const s = fmtDate(startsAt).replace(/\//g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const e = (fmtDate(endsAt || startsAt) || s).replace(/\//g, "-");
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (s <= today && today <= e) return "오늘";
  const [y, m, d] = s.split("-").map(Number);
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86_400_000);
  return n === 1 ? "내일" : `D-${n}`;
}

export function EventRail() {
  const [list, setList] = useState<Ev[] | null>(null);
  const [idx, setIdx] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const hold = useRef(false);

  useEffect(() => {
    api<{ events: Ev[] }>("/api/events").then((r) => {
      if (!r.ok) return setList([]);
      const limit = monthLater();
      const up = r.data.events
        // 지나지 않은 공개 일정 중 시작일이 한 달 안(오늘 ~ 다음 달 같은 날)인 것만. 진행 중인 일정도 포함.
        .filter((e) => !e.past && !e.draft && !e.outside && e.startsAt && startDay(e.startsAt) <= limit)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, MAX);
      setList(up);
    });
  }, []);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const card = el.children[i] as HTMLElement | undefined;
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - (el.clientWidth - card.clientWidth) / 2, behavior: "smooth" });
  }, []);

  // 스크롤 위치 → 지금 카드 번호(점 표시)
  const onScroll = () => {
    const el = track.current;
    if (!el || !el.children.length) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    [...el.children].forEach((c, i) => {
      const h = c as HTMLElement;
      const cm = h.offsetLeft - el.offsetLeft + h.clientWidth / 2;
      const bm = (el.children[best] as HTMLElement).offsetLeft - el.offsetLeft + (el.children[best] as HTMLElement).clientWidth / 2;
      if (Math.abs(cm - mid) < Math.abs(bm - mid)) best = i;
    });
    setIdx(best);
  };

  // 자동 넘김
  useEffect(() => {
    if (!list || list.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (hold.current || document.hidden) return;
      go((idx + 1) % list.length);
    }, 5000);
    return () => window.clearInterval(t);
  }, [list, idx, go]);

  if (!list || list.length === 0) return null;
  const stop = () => { hold.current = true; };
  const resume = () => { hold.current = false; };

  return (
    <section className="rail" aria-label="다가오는 일정" aria-roledescription="carousel">
      <div className="rail-head">
        <h2 className="title" style={{ margin: 0 }}>다가오는 일정</h2>
        <Link href="/events" className="rail-more">타임라인 ›</Link>
      </div>
      <div ref={track} className="rail-track" onScroll={onScroll}
        onPointerEnter={stop} onPointerLeave={resume} onTouchStart={stop} onTouchEnd={resume} onFocus={stop} onBlur={resume}>
        {list.map((e, i) => {
          const dd = dday(e.startsAt, e.endsAt);
          return (
            <Link key={e.id} href={`/events/${e.id}`} className={`rail-card${e.coverUrl ? " photo" : ""}`} aria-roledescription="slide"
              aria-label={`${i + 1}/${list.length}: ${e.name}, ${when(e.startsAt)}${dd ? `, ${dd}` : ""}${e.going ? `, ${e.going}명 참석` : ""}${e.needsAnswer ? ", 참석 여부 체크 필요" : ""}`}>
              {e.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.coverUrl} alt="" loading={i < 2 ? "eager" : "lazy"} />
              )}
              <span className="rail-badges" aria-hidden="true">
                {dd && <span className="rail-dday">{dd}</span>}
                <span className="rail-type">{e.club ? `${e.type} · ${e.club}` : e.type}</span>
              </span>
              <span className="rail-text" aria-hidden="true">
                <b>{e.name}</b>
                <span>{when(e.startsAt)}</span>
                <span className="rail-sub">
                  {e.needsAnswer ? "참석 여부를 알려 주세요" : e.myAnswer === "참석" ? "참석 신청 완료 ✓" : e.going ? `${e.going}명 참석` : e.place}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      {list.length > 1 && (
        <div className="rail-dots" role="group" aria-label="일정 카드 고르기">
          {list.map((e, i) => (
            <button key={e.id} type="button" className={i === idx ? "on" : ""} aria-label={`${i + 1}번째 일정 카드`} aria-current={i === idx ? "true" : undefined} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </section>
  );
}
