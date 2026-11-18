"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconBack, IconNext } from "./Icons";

// 일정 › 타임라인 위쪽 달력. 주(월~일 한 주) / 월(한 달) 보기를 고른다(고른 보기는 이 기기에 기억).
// 일정이 있는 날은 날짜 아래에 일정 유형 라벨(참석하는 일정이 있으면 강조색, 여러 개면 "+n").
// 날짜 칸을 누르면 onPick(그날, YYYY-MM-DD) — 아래 일정 피드가 그날(또는 그 뒤 가장 가까운 날)로 이동한다.
// 유형 라벨을 누르면 그 일정 화면(hrefOf)으로 간다(라벨은 날짜 버튼 위에 겹친 링크).
export type StripEvent = { id: string; type: string; startsAt: string; endsAt: string; myAnswer?: string };
type Mode = "week" | "month";

const WD = ["월", "화", "수", "목", "금", "토", "일"];
const MODE_KEY = "club:timeline-cal";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (s: string) => (s ?? "").slice(0, 10);
// 그 주 월요일
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "month" ? "month" : "week";
  } catch {
    return "week";
  }
}

export function WeekStrip<T extends StripEvent>({ events, selected, onPick, hrefOf, actions }: {
  events: T[];
  selected: string;
  onPick: (day: string) => void;
  hrefOf: (e: T) => string; // 라벨을 누르면 갈 일정 화면
  actions?: React.ReactNode; // 윗줄 오른쪽 끝(주/월 옆)에 둘 버튼(일정 만들기 등)
}) {
  const [mode, setMode] = useState<Mode>("week");
  useEffect(() => setMode(readMode()), []);
  // 기준 날짜: 주 보기는 그 주 월요일, 월 보기는 그 달 1일
  const [anchor, setAnchor] = useState(() => new Date());
  const today = ymd(new Date());

  function choose(m: Mode) {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // 저장소를 못 쓰는 환경: 이번에만 적용
    }
  }

  // 그릴 날짜: 주 = 7일, 월 = 그 달 1일이 있는 주 월요일 ~ 말일이 있는 주 일요일(4~6주)
  const days = useMemo(() => {
    if (mode === "week") {
      const s = mondayOf(anchor);
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const s = mondayOf(first);
    const n = Math.ceil((((first.getDay() + 6) % 7) + last.getDate()) / 7) * 7;
    return Array.from({ length: n }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
  }, [mode, anchor]);

  const onDay = (key: string) => events.filter((e) => dayOf(e.startsAt) && dayOf(e.startsAt) <= key && key <= (dayOf(e.endsAt) || dayOf(e.startsAt)));
  const move = (n: number) => {
    const d = new Date(anchor);
    if (mode === "week") d.setDate(d.getDate() + n * 7);
    else { d.setDate(1); d.setMonth(d.getMonth() + n); }
    setAnchor(d);
  };
  // 위에 보일 달: 주 보기는 그 주 목요일이 속한 달, 월 보기는 그 달
  const shownMonth = mode === "week" ? days[3] : anchor;
  const unit = mode === "week" ? "주" : "달";
  // 박스 안 가운데 제목: 주 = "11월 3주"(몇째 주는 그 주 목요일이 그달의 몇 번째 목요일인지), 월 = "11월"
  const title = `${shownMonth.getMonth() + 1}월${mode === "week" ? ` ${Math.ceil(days[3].getDate() / 7)}주` : ""}`;

  return (
    <div className="wk-wrap">
      {/* 박스 밖 윗줄: 왼쪽 연도, 오른쪽 "오늘"(강조색 글자) + 주·월 전환(사각형 토글) + actions */}
      <div className="wk-top">
        <div className="wk-yrow">
          <h2 className="title wk-year" aria-live="polite">{shownMonth.getFullYear()}년</h2>
        </div>
        <div className="wk-right">
          <button type="button" className="wk-today" onClick={() => { setAnchor(new Date()); onPick(today); }}>오늘</button>
          <div className="wk-mode" role="group" aria-label="달력 보기">
            <button type="button" aria-pressed={mode === "week"} onClick={() => choose("week")}>주</button>
            <button type="button" aria-pressed={mode === "month"} onClick={() => choose("month")}>월</button>
          </div>
          {actions}
        </div>
      </div>
    <section className={`wk${mode === "month" ? " month" : ""}`} aria-label="일정 달력">
      {/* 박스 안 가운데: ‹ 11월 3주 › (이전·다음 주/달) */}
      <div className="wk-title">
        <button type="button" className="wk-nav" aria-label={`이전 ${unit}`} onClick={() => move(-1)}><IconBack size={18} /></button>
        <span className="wk-month" aria-live="polite">{title}</span>
        <button type="button" className="wk-nav" aria-label={`다음 ${unit}`} onClick={() => move(1)}><IconNext size={18} /></button>
      </div>
      <div className="wk-days">
        {mode === "month" && WD.map((w, i) => <span key={w} className={`wk-wd wk-wdh${i >= 5 ? " we" : ""}`} aria-hidden="true">{w}</span>)}
        {days.map((d) => {
          const key = ymd(d);
          const i = (d.getDay() + 6) % 7;
          const evs = onDay(key);
          const attend = evs.some((e) => e.myAnswer === "참석");
          const out = mode === "month" && d.getMonth() !== anchor.getMonth();
          const label = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[i]}요일${key === today ? ", 오늘" : ""}, ${evs.length ? `일정 ${evs.length}개` : "일정 없음"}${attend ? ", 참석하는 일정 있음" : ""}`;
          // 라벨에 보일 일정: 참석하는 일정 먼저
          const lead = evs.find((e) => e.myAnswer === "참석") ?? evs[0];
          return (
            <div key={key} className={`wk-day${key === selected ? " on" : ""}${key === today ? " today" : ""}${i >= 5 ? " we" : ""}${out ? " out" : ""}`}>
              {/* 칸 전체를 덮는 날짜 버튼(피드를 그날로) */}
              <button type="button" className="wk-hit" aria-label={label} aria-pressed={key === selected} aria-current={key === today ? "date" : undefined} onClick={() => onPick(key)} />
              {mode === "week" && <span className="wk-wd" aria-hidden="true">{WD[i]}</span>}
              <span className="wk-num" aria-hidden="true">{d.getDate()}</span>
              <span className="wk-mark">
                {/* 일정 유형 라벨(참석하는 일정이 있으면 강조색, 여러 개면 "+n") — 누르면 그 일정 화면 */}
                {lead && (
                  <Link href={hrefOf(lead)} className={`wk-lab${attend ? " go" : ""}`} aria-label={`${lead.type} 일정 열기${evs.length > 1 ? `, 이날 일정 ${evs.length}개 중 하나` : ""}`}>
                    {lead.type}{evs.length > 1 ? <b>+{evs.length - 1}</b> : null}
                  </Link>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
    </div>
  );
}
