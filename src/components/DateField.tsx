"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { fs } from "@/lib/fs";

// 날짜·일시 입력칸. 화면에는 "2026/12/11" 또는 "2026/12/11 14:30" 으로 보이고,
// 저장 값은 그대로 "2026-12-11" / "2026-12-11T14:30" 이다.
// 칸이나 달력 아이콘을 누르면 구글 캘린더처럼 한 달 달력(+ 일시면 5분 단위 시간 목록)이 칸 아래에 열린다. 직접 입력도 된다.
export type DateFieldMode = "date" | "datetime";

type Props = {
  id?: string;
  value: string; // 저장 형식: "YYYY-MM-DD" | "YYYY-MM-DDTHH:mm" | ""
  onChange: (stored: string) => void;
  mode: DateFieldMode;
  ariaLabel?: string;
  disabled?: boolean;
  style?: CSSProperties; // 바깥 줄(입력칸+버튼) 스타일
  inputStyle?: CSSProperties;
};

const p2 = (n: number) => String(n).padStart(2, "0");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
// 시간 목록: 5분 단위(00:00, 00:05 … 23:55)
const TIMES = Array.from({ length: 288 }, (_, i) => `${p2(Math.floor(i / 12))}:${p2((i % 12) * 5)}`);
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${p2(m)}`;
};

// 저장 값 → 화면 글자
export function storedToText(stored: string, mode: DateFieldMode): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(stored ?? "");
  if (!m) return stored ?? "";
  const d = `${m[1]}/${m[2]}/${m[3]}`;
  return mode === "datetime" && m[4] ? `${d} ${m[4]}:${m[5]}` : d;
}

// 화면 글자 → 저장 값. 비면 "", 알아볼 수 없으면 null.
// 받는 형태: 2026/12/11, 2026-12-11, 2026.12.11, 20261211 (+ " 14:30" / "1430")
export function textToStored(text: string, mode: DateFieldMode): string | null {
  const t = text.trim();
  if (!t) return "";
  const m =
    /^(\d{4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\.?(?:(?:\s+|T|\s*,\s*)(\d{1,2})\s*:?\s*(\d{2}))?$/.exec(t) ??
    /^(\d{4})(\d{2})(\d{2})(?:\s*T?\s*(\d{2}):?(\d{2}))?$/.exec(t);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || y > 2200 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const date = `${y}-${p2(mo)}-${p2(d)}`;
  const hasTime = m[4] !== undefined;
  if (mode === "date") return hasTime ? null : date;
  if (!hasTime) return null;
  const [h, mi] = [Number(m[4]), Number(m[5])];
  if (h > 23 || mi > 59) return null;
  return `${date}T${p2(h)}:${p2(mi)}`;
}

export function DateField({ id, value, onChange, mode, ariaLabel, disabled, style, inputStyle }: Props) {
  const auto = useId();
  const inputId = id ?? `df-${auto}`;
  const hintId = `${inputId}-hint`;
  const [text, setText] = useState(() => storedToText(value, mode));
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(false);
  const [right, setRight] = useState(false); // 화면 오른쪽 끝 칸이면 달력을 오른쪽에 맞춰 연다
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const example = mode === "datetime" ? "예: 2026/12/11 14:30" : "예: 2026/12/11";

  const curDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  const curTime = mode === "datetime" && /T\d{2}:\d{2}/.test(value) ? value.slice(11, 16) : "";
  // 달력에 보이는 달(처음엔 고른 날의 달, 없으면 이번 달)
  const [view, setView] = useState(() => {
    const d = curDate ? new Date(`${curDate}T00:00:00`) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // 바깥에서 값이 바뀌면(불러오기·초기화 등) 화면 글자를 맞춘다. 입력 중인 같은 값은 건드리지 않는다.
  useEffect(() => {
    setText((cur) => (textToStored(cur, mode) === value ? cur : storedToText(value, mode)));
    if (value) setErr(false);
  }, [value, mode]);

  // 바깥을 누르거나 Esc 면 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  // 열 때: 고른 날의 달로, 시간 목록은 고른 시간(없으면 오전 9시) 근처로
  function openCal() {
    if (disabled) return;
    const d = curDate ? new Date(`${curDate}T00:00:00`) : new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    const r = wrapRef.current?.getBoundingClientRect();
    const w = mode === "datetime" && window.innerWidth > 480 ? 420 : 300;
    setRight(!!r && r.left + w > window.innerWidth - 8);
    setOpen(true);
    requestAnimationFrame(() => {
      const el = timeRef.current?.querySelector<HTMLElement>(`[data-t="${curTime || "09:00"}"]`);
      if (el && timeRef.current) timeRef.current.scrollTop = el.offsetTop - 60;
    });
  }

  const set = (stored: string) => {
    setErr(false);
    setText(storedToText(stored, mode));
    if (stored !== value) onChange(stored);
  };
  const pickDay = (day: string) => {
    if (mode === "date") { set(day); setOpen(false); return; }
    set(`${day}T${curTime || "09:00"}`); // 시간은 그대로(없으면 오전 9시) — 이어서 시간을 고른다
  };
  const pickTime = (t: string) => {
    set(`${curDate || ymd(new Date())}T${t}`);
    setOpen(false);
  };

  const type = (v: string) => {
    setText(v);
    const s = textToStored(v, mode);
    if (s !== null) {
      setErr(false);
      if (s !== value) onChange(s);
    }
  };
  const blur = () => {
    const s = textToStored(text, mode);
    if (s === null) { setErr(true); return; }
    setErr(false);
    setText(storedToText(s, mode));
    if (s !== value) onChange(s);
  };

  // 달력 칸: 그 달 1일이 있는 주의 일요일부터 6주
  const first = new Date(view.y, view.m, 1);
  const start = new Date(view.y, view.m, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = ymd(new Date());
  const move = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="df-wrap" ref={wrapRef}>
      <div className="df" style={style}>
        <input
          id={inputId}
          className="field"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder={mode === "datetime" ? "2026/12/11 14:30" : "2026/12/11"}
          aria-label={ariaLabel}
          aria-invalid={err || undefined}
          aria-describedby={hintId}
          aria-haspopup="dialog"
          aria-expanded={open}
          value={text}
          disabled={disabled}
          style={inputStyle}
          onChange={(e) => type(e.target.value)}
          onBlur={blur}
          onClick={openCal}
        />
        <button type="button" className="mini df-btn" aria-label="달력에서 고르기" title="달력에서 고르기" disabled={disabled} onClick={() => (open ? setOpen(false) : openCal())}>
          <svg width="22" height="22" style={{ width: fs(22), height: fs(22), flex: "none" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
      <span id={hintId} className="df-hint" aria-live="polite">{err ? example : ""}</span>

      {open && (
        <div className={`df-pop${mode === "datetime" ? " wide" : ""}${right ? " right" : ""}`} role="dialog" aria-label={mode === "datetime" ? "날짜와 시간 고르기" : "날짜 고르기"}>
          <div className="df-cal">
            <div className="df-head">
              <button type="button" className="df-nav" aria-label="이전 달" onClick={() => move(-1)}>‹</button>
              <b>{view.y}년 {view.m + 1}월</b>
              <button type="button" className="df-nav" aria-label="다음 달" onClick={() => move(1)}>›</button>
            </div>
            <div className="df-grid" role="grid">
              {DOW.map((w, i) => <span key={w} className={`df-dow${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>{w}</span>)}
              {days.map((d) => {
                const k = ymd(d);
                const other = d.getMonth() !== view.m;
                return (
                  <button key={k} type="button" role="gridcell" aria-selected={k === curDate}
                    className={`df-day${other ? " other" : ""}${k === today ? " today" : ""}${k === curDate ? " on" : ""}${d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : ""}`}
                    aria-label={`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일${k === today ? ", 오늘" : ""}`}
                    onClick={() => pickDay(k)}>{d.getDate()}</button>
                );
              })}
            </div>
          </div>
          {mode === "datetime" && (
            <div className="df-times" ref={timeRef} role="listbox" aria-label="시간 (5분 단위)">
              {TIMES.map((t) => (
                <button key={t} type="button" role="option" aria-selected={t === curTime} data-t={t} className={`df-time${t === curTime ? " on" : ""}`} onClick={() => pickTime(t)}>
                  {timeLabel(t)}
                </button>
              ))}
            </div>
          )}
          <div className="df-foot">
            <button type="button" className="mini" onClick={() => { const t = today; if (mode === "date") { set(t); setOpen(false); } else { set(`${t}T${curTime || "09:00"}`); setView({ y: new Date().getFullYear(), m: new Date().getMonth() }); } }}>오늘</button>
            {value && <button type="button" className="mini" onClick={() => { set(""); setOpen(false); }}>지우기</button>}
            <span className="grow" />
            {mode === "datetime" && curDate && <span className="small">{storedToText(value, mode)}</span>}
            <button type="button" className="mini" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
