"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import css from "./EventCalendar.module.css";
import { fs } from "@/lib/fs";

// 행사 달력(월간, 일~토). 구글 캘린더 월 보기와 비슷하게:
//  - 날짜 칸 안에 행사 칩. 하루 행사는 "14:30 행사명", 여러 날 행사는 주(줄)마다 이어진 막대(줄 첫 칸에 제목).
//  - 칩 색: 고정(주황) / 내 소모임 행사(초록) / 참석·미응답(파랑) / 불참·다른 소모임(회색). 참석 체크가 필요하면 점선 + "!".
//  - 내가 참석하는 행사가 있는 날은 칸에 파란 테두리.
//  - 한 칸에 칩이 3개를 넘으면 "+N개 더". 날짜나 "+N개 더"를 누르면 그날 행사를 아래에 카드로 보여 준다(renderItem).
// 날짜가 있는 행사만 표시한다. 순서는 서버(/api/events)가 정한 순서를 따른다.
export type CalEvent = {
  id: string; name: string; type: string; startsAt: string; endsAt: string; club?: string;
  pinned: boolean; needsAnswer: boolean; canApply: boolean; myAnswer: string;
};

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const MAXL = 3; // 한 주 줄에 보여 줄 칩 줄 수
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const dayOf = (s: string) => s.slice(0, 10);
const endOf = (e: CalEvent) => { const a = dayOf(e.startsAt), b = dayOf(e.endsAt || e.startsAt); return b < a ? a : b; };

function tone(e: CalEvent): string {
  if (e.pinned) return css.cPin;
  if (!e.canApply || e.myAnswer === "불참") return css.cMute;
  if (e.club) return css.cClub;
  return css.cMain;
}
const toneText = (e: CalEvent) =>
  e.pinned ? "고정 행사" : !e.canApply ? "다른 소모임 행사" : e.myAnswer === "불참" ? "불참" : e.myAnswer === "참석" ? "참석" : e.needsAnswer ? "참석 여부 체크 필요" : "";

type Seg = { e: CalEvent; start: number; end: number; lane: number; contL: boolean; contR: boolean };

export function EventCalendar<T extends CalEvent>({ events, renderItem, hrefOf }: {
  events: T[];
  renderItem: (e: T) => React.ReactNode;
  hrefOf: (e: T) => string;
}) {
  const [sel, setSel] = useState(todayStr);
  const [view, setView] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const dated = useMemo(() => events.filter((e) => dayOf(e.startsAt)), [events]);
  const undated = events.length - dated.length;

  // 이번 달 1일이 있는 주의 일요일부터 말일이 있는 주의 토요일까지(4~6주)
  const first = new Date(view.y, view.m, 1);
  const nWeeks = Math.ceil((first.getDay() + new Date(view.y, view.m + 1, 0).getDate()) / 7);
  const weeks = Array.from({ length: nWeeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => new Date(view.y, view.m, 1 - first.getDay() + w * 7 + i)),
  );
  const today = todayStr();

  const onDay = (key: string) => dated.filter((e) => dayOf(e.startsAt) <= key && key <= endOf(e));

  // 주마다 칩 줄(lane) 배치: 먼저 시작하고 긴 행사부터 빈 줄에 넣는다.
  function layout(days: Date[]): { segs: Seg[]; lanes: number } {
    const ws = ymd(days[0]), we = ymd(days[6]);
    const items = dated
      .filter((e) => dayOf(e.startsAt) <= we && endOf(e) >= ws)
      .map((e, order) => {
        const s = dayOf(e.startsAt), t = endOf(e);
        const start = s < ws ? 0 : days.findIndex((d) => ymd(d) === s);
        const end = t > we ? 6 : days.findIndex((d) => ymd(d) === t);
        return { e, start, end, order, contL: s < ws, contR: t > we };
      })
      .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order);
    const laneEnd: number[] = [];
    const segs: Seg[] = items.map((it) => {
      let lane = laneEnd.findIndex((x) => x < it.start);
      if (lane < 0) { lane = laneEnd.length; laneEnd.push(it.end); } else laneEnd[lane] = it.end;
      return { e: it.e, start: it.start, end: it.end, lane, contL: it.contL, contR: it.contR };
    });
    return { segs, lanes: laneEnd.length };
  }

  const move = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => {
    const t = new Date();
    setView({ y: t.getFullYear(), m: t.getMonth() });
    setSel(todayStr());
  };
  const pick = (key: string) => {
    setSel(key);
    // 아래 목록으로 스크롤(접근성: 목록 제목으로 포커스)
    requestAnimationFrame(() => document.getElementById("cal-day-h")?.focus());
  };

  const selEvents = onDay(sel) as T[];
  const [sy, sm, sd] = sel.split("-").map(Number);

  return (
    <section className={css.cal} aria-label="행사 달력" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className={css.head}>
        <h2 className={css.month} aria-live="polite">{view.y}년 {view.m + 1}월</h2>
        <button type="button" className={css.nav} onClick={goToday}>오늘</button>
        <button type="button" className={css.nav} onClick={() => move(-1)} aria-label="이전 달">‹</button>
        <button type="button" className={css.nav} onClick={() => move(1)} aria-label="다음 달">›</button>
      </div>

      <div className={css.board}>
        <div className={css.wdrow} aria-hidden="true">
          {WD.map((w, i) => <span key={w} className={`${css.wd} ${i === 0 ? css.sun : i === 6 ? css.sat : ""}`}>{w}</span>)}
        </div>
        {weeks.map((days) => {
          const { segs, lanes } = layout(days);
          const shownLanes = Math.max(1, Math.min(MAXL, lanes));
          return (
            <div key={ymd(days[0])} className={css.week} style={{ ["--lanes" as string]: shownLanes }}>
              {days.map((d, i) => {
                const key = ymd(d);
                const evs = onDay(key);
                const attend = evs.some((e) => e.myAnswer === "참석");
                const need = evs.filter((e) => e.needsAnswer).length;
                const label = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일${key === today ? ", 오늘" : ""}, ${evs.length ? `행사 ${evs.length}개` : "행사 없음"}${attend ? ", 참석하는 행사 있음" : ""}${need ? `, 참석 여부 체크 필요 ${need}개` : ""}`;
                const cls = [css.day, d.getMonth() !== view.m ? css.out : "", key === today ? css.today : "", key === sel ? css.sel : "", attend ? css.attend : ""].join(" ");
                return (
                  <button key={key} type="button" className={cls} style={{ gridColumn: i + 1 }} aria-label={label}
                    aria-pressed={key === sel} aria-current={key === today ? "date" : undefined} onClick={() => pick(key)}>
                    <span className={css.num}>{d.getDate()}</span>
                  </button>
                );
              })}
              {segs.filter((s) => s.lane < MAXL).map((s) => {
                const e = s.e as T;
                const single = dayOf(e.startsAt) === endOf(e);
                const time = single ? e.startsAt.slice(11, 16) : "";
                const extra = toneText(e);
                return (
                  <Link key={e.id} href={hrefOf(e)}
                    className={[css.chip, tone(e), e.needsAnswer ? css.need : "", s.contL ? css.contL : "", s.contR ? css.contR : ""].join(" ")}
                    style={{ gridRow: s.lane + 2, gridColumn: `${s.start + 1} / span ${s.end - s.start + 1}` }}
                    aria-label={`${e.name}${time ? `, ${time}` : ""}${extra ? `, ${extra}` : ""}`}>
                    {e.needsAnswer && <b className={css.bang} aria-hidden="true">!</b>}
                    <span aria-hidden="true">{time ? `${time} ` : ""}{e.name}</span>
                  </Link>
                );
              })}
              {days.map((d, i) => {
                const hidden = segs.filter((s) => s.lane >= MAXL && s.start <= i && i <= s.end).length;
                if (!hidden) return null;
                const key = ymd(d);
                return (
                  <button key={`m-${key}`} type="button" className={css.more} style={{ gridRow: shownLanes + 2, gridColumn: i + 1 }}
                    aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 행사 ${hidden}개 더 보기`} onClick={() => pick(key)}>
                    +{hidden}개 더
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className={css.legend}>
        <span><i className={`${css.sw} ${css.cPin}`} aria-hidden="true" />고정</span>
        <span><i className={`${css.sw} ${css.cClub}`} aria-hidden="true" />내 소모임</span>
        <span><i className={`${css.sw} ${css.cMain}`} aria-hidden="true" />참석·미응답</span>
        <span><i className={`${css.sw} ${css.cMute}`} aria-hidden="true" />불참·다른 소모임</span>
        <span><i className={`${css.sw} ${css.need}`} aria-hidden="true" /><b className={css.bang}>!</b> 참석 여부 체크 필요</span>
        <span><i className={css.swAttend} aria-hidden="true" />내가 참석하는 행사가 있는 날</span>
      </div>

      <h3 id="cal-day-h" tabIndex={-1} style={{ font: `700 ${fs(16)} var(--display)`, margin: "4px 0 0", outline: "none" }}>
        {sm}월 {sd}일 ({WD[new Date(sy, sm - 1, sd).getDay()]}) 행사
      </h3>
      {selEvents.length === 0 ? <p className="small" style={{ margin: 0 }}>이날은 행사가 없어요.</p> : <div className="pick">{selEvents.map(renderItem)}</div>}
      {undated > 0 && <p className="hint">날짜가 아직 정해지지 않은 행사 {undated}개는 리스트로 보기에서 볼 수 있어요.</p>}
    </section>
  );
}
