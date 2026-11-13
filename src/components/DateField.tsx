"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

// 날짜·일시 입력칸. 화면에는 "2026/12/11" 또는 "2026/12/11 14:30" 으로 보이고,
// 저장 값은 그대로 "2026-12-11" / "2026-12-11T14:30" 이다. 옆 달력 버튼으로 기기 달력에서 고를 수도 있다.
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
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => storedToText(value, mode));
  const [err, setErr] = useState(false);
  const example = mode === "datetime" ? "예: 2026/12/11 14:30" : "예: 2026/12/11";

  // 바깥에서 값이 바뀌면(불러오기·초기화 등) 화면 글자를 맞춘다. 입력 중인 같은 값은 건드리지 않는다.
  useEffect(() => {
    setText((cur) => (textToStored(cur, mode) === value ? cur : storedToText(value, mode)));
    if (value) setErr(false);
  }, [value, mode]);

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

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === "function") { el.showPicker(); return; }
    } catch { /* 지원하지 않으면 아래로 */ }
    el.focus();
    el.click();
  };

  const nativeValue = /^\d{4}-\d{2}-\d{2}/.test(value) ? (mode === "datetime" ? value.slice(0, 16) : value.slice(0, 10)) : "";

  return (
    <div className="df-wrap">
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
          value={text}
          disabled={disabled}
          style={inputStyle}
          onChange={(e) => type(e.target.value)}
          onBlur={blur}
        />
        <button type="button" className="mini df-btn" aria-label="달력에서 고르기" title="달력에서 고르기" disabled={disabled} onClick={openPicker}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
        <input
          ref={nativeRef}
          className="df-native"
          type={mode === "datetime" ? "datetime-local" : "date"}
          tabIndex={-1}
          aria-hidden="true"
          value={nativeValue}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setErr(false);
            setText(storedToText(v, mode));
            if (v !== value) onChange(v);
          }}
        />
      </div>
      <span id={hintId} className="df-hint" aria-live="polite">{err ? example : ""}</span>
    </div>
  );
}
