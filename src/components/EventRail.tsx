"use client";

import { focusStyle } from "@/lib/cover-focus";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDate } from "@/lib/client";

// 홈 맨 위 "다가오는 나의 일정" 카드: 내가 참석 신청한 일정 중 한 달 안에 시작하는, 날짜가 가장 가까운 3개까지.
// 2개 이상이면 원통(드럼)이 위로 굴러가듯 5초마다 다음 카드로 돌아간다(끝에서 처음으로 끊김 없이). 위·아래(또는 옆)로 밀면 그 방향으로 돈다.
// 자동 넘김은 손가락·마우스를 올리거나 포커스가 있으면 멈추고, 기기의 "동작 줄이기"가 켜져 있으면 하지 않는다.
// 카드: 사진(회원 사진 → 클럽·모임 대표사진, 없으면 바탕색) 위에 라벨 줄(D-day · 유형 · 오른쪽 끝 참석 인원), 오른쪽 아래 "활동 바로가기",
// 카드를 누르면 일정 화면, "활동 바로가기"를 누르면 지금 할 활동 화면(사전 작성 등, lib/activity-shortcut.ts).
type Ev = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string; club?: string;
  past: boolean; draft?: boolean; outside?: boolean; pinned: boolean; coverUrl?: string; actHref?: string; going?: number; myAnswer: string; needsAnswer: boolean;
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
  // rot: 지금까지 돈 칸 수(음수도 됨). 지금 앞면 카드 = rot 를 개수로 나눈 나머지
  const [rot, setRot] = useState(0);
  const [h, setH] = useState(0); // 카드 높이(px) — 원통 반지름 계산용
  const stage = useRef<HTMLDivElement>(null);
  const hold = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  useEffect(() => {
    api<{ events: Ev[] }>("/api/events").then((r) => {
      if (!r.ok) return setList([]);
      const limit = monthLater();
      const up = r.data.events
        // 내가 참석 신청한, 지나지 않은 공개 일정 중 시작일이 한 달 안(오늘 ~ 다음 달 같은 날)인 것만. 진행 중인 일정도 포함.
        .filter((e) => e.myAnswer === "참석" && !e.past && !e.draft && !e.outside && e.startsAt && startDay(e.startsAt) <= limit)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, MAX);
      setList(up);
    });
  }, []);

  // 카드 높이 재기(화면 크기가 바뀌면 다시)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, [list]);

  const n = list?.length ?? 0;
  const idx = n ? ((rot % n) + n) % n : 0;
  const step = n ? 360 / n : 0;
  // 원통 반지름: 면 n개가 둘러싼 다각형. 2개면 앞·뒤로 뒤집기(반지름 0)
  const radius = n >= 3 ? Math.round(h / 2 / Math.tan(Math.PI / n)) : 0;
  const goTo = useCallback((i: number) => setRot((r) => { const cur = ((r % n) + n) % n; let d = i - cur; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return r + d; }), [n]);

  // 자동 넘김
  useEffect(() => {
    if (!list || list.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (hold.current || document.hidden) return;
      setRot((r) => r + 1);
    }, 5000);
    return () => window.clearInterval(t);
  }, [list]);

  if (!list || list.length === 0) return null;
  const stop = () => { hold.current = true; };
  const resume = () => { hold.current = false; };
  // 밀어서 돌리기: 위·왼쪽으로 밀면 다음, 아래·오른쪽이면 이전. 민 뒤에는 카드 링크로 넘어가지 않게
  const down = (x: number, y: number) => { touch.current = { x, y }; swiped.current = false; stop(); };
  const up = (x: number, y: number) => {
    const t0 = touch.current;
    touch.current = null;
    resume();
    if (!t0 || n < 2) return;
    const dx = x - t0.x, dy = y - t0.y;
    const big = Math.abs(dy) > Math.abs(dx) ? dy : dx;
    if (Math.abs(big) < 30) return;
    swiped.current = true;
    setRot((r) => r + (big < 0 ? 1 : -1));
  };

  return (
    <section className="rail" aria-label="다가오는 나의 일정" aria-roledescription="carousel">
      <div className="rail-head">
        <h2 className="title" style={{ margin: 0 }}>다가오는 나의 일정</h2>
        <Link href="/events" className="rail-more">타임라인 ›</Link>
      </div>
      {/* 원통(드럼): 카드마다 원통의 한 면. 원통을 돌려 앞면을 바꾼다 */}
      <div ref={stage} className={`rail-stage${n > 1 ? " drum" : ""}`}
        onPointerEnter={stop} onPointerLeave={resume} onFocus={stop} onBlur={resume}
        onTouchStart={(ev) => down(ev.touches[0].clientX, ev.touches[0].clientY)} onTouchEnd={(ev) => up(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY)}
        onMouseDown={(ev) => down(ev.clientX, ev.clientY)} onMouseUp={(ev) => up(ev.clientX, ev.clientY)}
        onClickCapture={(ev) => { if (swiped.current) { ev.preventDefault(); ev.stopPropagation(); swiped.current = false; } }}>
        <div className="rail-drum" style={n > 1 ? { transform: `translateZ(${-radius}px) rotateX(${rot * step}deg)` } : undefined}>
        {list.map((e, i) => {
          const dd = dday(e.startsAt, e.endsAt);
          return (
            // 카드: 전체를 덮는 일정 상세 링크(.rail-hit) 위에 라벨 줄. 라벨 줄 오른쪽 끝 "활동 바로가기"는 따로 누르는 링크
            <div key={e.id} className={`rail-card${e.coverUrl ? " photo" : ""}${i === idx ? " front" : ""}`} aria-roledescription="slide" role="group" aria-label={`${i + 1}/${list.length}`}
              aria-hidden={n > 1 && i !== idx ? true : undefined} inert={n > 1 && i !== idx ? true : undefined}
              style={n > 1 ? { transform: `rotateX(${-i * step}deg) translateZ(${radius}px)` } : undefined}>
              {e.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.coverUrl} alt="" loading={i < 2 ? "eager" : "lazy"} style={focusStyle(e.coverUrl)} />
              )}
              <Link href={`/events/${e.id}`} className="rail-hit"
                aria-label={`${e.name}, ${when(e.startsAt)}${dd ? `, ${dd}` : ""}${e.going ? `, ${e.going}명 참석` : ""} — 일정 보기`} />
              <span className="rail-badges">
                {dd && <span className="rail-dday" aria-hidden="true">{dd}</span>}
                <span className="rail-type" aria-hidden="true">{e.club ? `${e.type} · ${e.club}` : e.type}</span>
                {/* 라벨 줄 오른쪽 끝: 참석 인원(일정 상세 맨 위 카드와 같은 모양) */}
                {(e.going ?? 0) > 0 && <span className="evhero-going" aria-hidden="true">{e.going}명 참석</span>}
              </span>
              {/* 오른쪽 아래: 활동 바로가기(지금 할 활동 화면으로) */}
              {e.actHref && <Link href={e.actHref} className="rail-act rail-act-bottom" aria-label={`${e.name} 활동 바로가기`}>활동 바로가기 ›</Link>}
              <span className="rail-text" aria-hidden="true">
                <b>{e.name}</b>
                <span>{when(e.startsAt)}</span>
                <span className="rail-sub">
                  {e.place}
                </span>
              </span>
            </div>
          );
        })}
        </div>
      </div>
      {list.length > 1 && (
        <div className="rail-dots" role="group" aria-label="일정 카드 고르기">
          {list.map((e, i) => (
            <button key={e.id} type="button" className={i === idx ? "on" : ""} aria-label={`${i + 1}번째 일정 카드`} aria-current={i === idx ? "true" : undefined} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
    </section>
  );
}
