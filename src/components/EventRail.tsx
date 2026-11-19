"use client";

import { focusStyle } from "@/lib/cover-focus";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, fmtDate } from "@/lib/client";

// 홈 맨 위 "다가오는 일정" 카드: 내가 참석 신청한 일정 중 한 달 안에 시작하는, 날짜가 가장 가까운 3개까지.
// 2개 이상이면 세로 축 원통에 카드가 둘러 있고, 옆으로 밀면 원통이 손가락을 따라 돌다가 놓으면 다음·이전 카드에 멈춘다(끝에서 처음으로 끊김 없이).
// 저절로 넘어가지는 않고, 5초 넘게 돌리지 않으면 원통이 몇 초마다 살짝 움찔해서 넘길 수 있다는 걸 알려 준다(돌리면 멈췄다가 다시 5초 뒤부터).
// 사진은 아주 천천히 확대·축소돼서(1장이어도) 멈춘 그림처럼 보이지 않게. 기기의 "동작 줄이기"가 켜져 있으면 움직임은 하지 않는다.
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
  const [w, setW] = useState(0); // 카드 폭(px) — 원통 반지름 계산용
  const [dx, setDx] = useState(0); // 끄는 중 옆으로 움직인 거리(px)
  const [dragging, setDragging] = useState(false);
  // 움찔 안내: 처음에는 바로, 돌린 뒤에는 5초 동안 안 건드리면 다시
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<number | undefined>(undefined);
  const poke = () => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 5000);
  };
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);
  const stage = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; t: number; id: number; lock: "x" | "y" | null } | null>(null);
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

  // 카드 폭 재기(화면 크기가 바뀌면 다시)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [list]);

  const n = list?.length ?? 0;
  const idx = n ? ((rot % n) + n) % n : 0;
  // 원통의 면: 카드가 2~3개면 되풀이해서 면을 4개 이상으로(뒤집히지 않고 옆으로 돌게). 면 k 에는 카드 k % n
  const faces = n >= 4 ? n : n > 1 ? n * Math.ceil(4 / n) : 1;
  const step = 360 / faces;
  // 원통 반지름(면 사이 약간 띄움)
  const radius = faces > 1 ? Math.round(w / 2 / Math.tan(Math.PI / faces)) + 14 : 0;
  const goTo = (i: number) => setRot((r) => { const cur = ((r % n) + n) % n; let d = i - cur; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return r + d; });

  if (!list || n === 0) return null;

  // 끌어서 돌리기: 옆으로 끌면 원통이 손가락을 따라 돌고, 놓을 때 충분히 끌었거나(폭의 1/5) 빠르게 튕겼으면 다음·이전 카드로.
  // 위아래로 먼저 움직이면 화면 스크롤로 둔다. 끈 뒤에는 카드 링크로 넘어가지 않게.
  const onDown = (ev: React.PointerEvent) => {
    if (n < 2 || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    start.current = { x: ev.clientX, y: ev.clientY, t: Date.now(), id: ev.pointerId, lock: null };
    swiped.current = false;
  };
  const onMove = (ev: React.PointerEvent) => {
    const s0 = start.current;
    if (!s0 || s0.id !== ev.pointerId) return;
    const mx = ev.clientX - s0.x, my = ev.clientY - s0.y;
    if (!s0.lock) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      s0.lock = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (s0.lock === "x") { setDragging(true); poke(); (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId); }
    }
    if (s0.lock !== "x") return;
    setDx(mx);
    if (Math.abs(mx) > 8) swiped.current = true;
  };
  const onUp = (ev: React.PointerEvent) => {
    const s0 = start.current;
    start.current = null;
    if (!s0 || s0.lock !== "x") { setDragging(false); setDx(0); return; }
    const mx = ev.clientX - s0.x;
    const fast = Math.abs(mx) / Math.max(1, Date.now() - s0.t) > 0.4 && Math.abs(mx) > 20;
    const far = Math.abs(mx) > (w || 300) / 5;
    if (fast || far) setRot((r) => r + (mx < 0 ? 1 : -1));
    poke();
    setDragging(false);
    setDx(0);
  };
  // 끄는 중 원통 각도: 카드 폭만큼 끌면 한 칸
  const angle = -rot * step + (w ? (dx / w) * step : 0);

  return (
    <section className="rail" aria-label="다가오는 일정" aria-roledescription="carousel">
      <div className="rail-head">
        <h2 className="title" style={{ margin: 0 }}>다가오는 일정</h2>
        <Link href="/events" className="rail-more">타임라인 ›</Link>
      </div>
      {/* 원통: 카드마다 원통의 한 면. 원통을 옆으로 돌려 앞면을 바꾼다 */}
      <div ref={stage} className={`rail-stage${n > 1 ? " drum" : ""}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDragStart={(ev) => ev.preventDefault()}
        onClickCapture={(ev) => { if (swiped.current) { ev.preventDefault(); ev.stopPropagation(); swiped.current = false; } }}>
        <div className={`rail-nudge${n > 1 && idle && !dragging ? " hint" : ""}`}>
        <div className={`rail-drum${dragging ? " dragging" : ""}`} style={n > 1 ? { transform: `translateZ(${-radius}px) rotateY(${angle}deg)` } : undefined}>
        {Array.from({ length: faces }, (_, k) => k).map((k) => {
          const i = k % n;
          const e = list[i];
          const front = n > 1 ? ((rot % faces) + faces) % faces === k : true;
          const dd = dday(e.startsAt, e.endsAt);
          const face = n > 1 ? { transform: `rotateY(${k * step}deg) translateZ(${radius}px)` } : undefined;
          return (
            // 카드: 전체를 덮는 일정 상세 링크(.rail-hit) 위에 라벨 줄. 오른쪽 아래 "활동 바로가기"는 따로 누르는 링크
            <div key={`${e.id}-${k}`} className={`rail-card${e.coverUrl ? " photo" : ""}${front ? " front" : ""}`} aria-roledescription="slide" role="group" aria-label={`${i + 1}/${n}`}
              aria-hidden={!front ? true : undefined} inert={!front ? true : undefined} style={face}>
              {e.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.coverUrl} alt="" draggable={false} loading={i < 2 ? "eager" : "lazy"} style={focusStyle(e.coverUrl)} />
              )}
              <Link href={`/events/${e.id}`} className="rail-hit" draggable={false}
                aria-label={`${e.name}, ${when(e.startsAt)}${dd ? `, ${dd}` : ""}${e.going ? `, ${e.going}명 참석` : ""} — 일정 보기`} />
              <span className="rail-badges">
                {dd && <span className="rail-dday" aria-hidden="true">{dd}</span>}
                <span className="rail-type" aria-hidden="true">{e.club ? `${e.type} · ${e.club}` : e.type}</span>
                {/* 라벨 줄 오른쪽 끝: 참석 인원(일정 상세 맨 위 카드와 같은 모양) */}
                {(e.going ?? 0) > 0 && <span className="evhero-going" aria-hidden="true">{e.going}명 참석</span>}
              </span>
              {/* 오른쪽 아래: 활동 바로가기(지금 할 활동 화면으로) */}
              {e.actHref && <Link href={e.actHref} className="rail-act rail-act-bottom" draggable={false} aria-label={`${e.name} 활동 바로가기`}>활동 바로가기 ›</Link>}
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
      </div>
      {n > 1 && (
        <div className="rail-dots" role="group" aria-label="일정 카드 고르기">
          {list.map((e, i) => (
            <button key={e.id} type="button" className={i === idx ? "on" : ""} aria-label={`${i + 1}번째 일정 카드`} aria-current={i === idx ? "true" : undefined} onClick={() => { poke(); goTo(i); }} />
          ))}
        </div>
      )}
    </section>
  );
}
