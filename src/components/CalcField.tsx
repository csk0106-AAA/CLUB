"use client";

import { useEffect, useState } from "react";

// 금액 칸 계산식: 엑셀처럼 "=3*5", "3+5", "=6/2", "=(3+2)*1000" 을 적으면 계산한 값(원 단위 정수)으로 바꾼다.
//  쓸 수 있는 것: 숫자, + - * / ( ), 쉼표(1,000), ×·÷·x. 계산할 수 없으면 null.
export function calcAmount(text: string): number | null {
  const s = text.trim().replace(/^=/, "").replace(/[,\s]/g, "").replace(/[×xX]/g, "*").replace(/÷/g, "/");
  if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const num = (): number => {
    if (peek() === "(") { i++; const v = expr(); if (peek() !== ")") throw 0; i++; return v; }
    if (peek() === "-") { i++; return -num(); }
    if (peek() === "+") { i++; return num(); }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return Number(m[0]);
  };
  const term = (): number => {
    let v = num();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = num();
      if (op === "/" && r === 0) throw 0;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.max(0, Math.round(v));
  } catch {
    return null;
  }
}

// 글자로 저장하는 금액 칸(비워 둘 수 있다: "" = 아직 안 적음). 계산식은 CalcField 와 같다.
export function CalcText({ value, onChange, ...rest }: {
  value: string;
  onChange: (s: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText((t) => (t !== "" && String(calcAmount(t)) === value ? t : value));
  }, [value]);
  const toS = (t: string): string | null => (t.trim() === "" ? "" : (() => { const n = calcAmount(t); return n == null ? null : String(n); })());
  return (
    <input
      title="=3*5 처럼 계산식을 넣으면 계산한 금액이 들어가요(+ - * /)"
      {...rest}
      type="text"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const v = toS(t);
        if (v != null && v !== value) onChange(v);
      }}
      onBlur={(e) => {
        const v = toS(text) ?? value;
        setText(v);
        if (v !== value) onChange(v);
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        rest.onKeyDown?.(e);
      }}
    />
  );
}

// 금액 입력칸: 적는 동안은 글자 그대로 두고, 계산되는 값이면 바로 onChange.
//  칸을 벗어나거나 Enter 를 누르면 계산한 숫자로 바꿔 보여 주고 onCommit(저장 등). 계산이 안 되면 원래 값으로 돌린다.
//  휴대폰 숫자 자판에는 + * 가 없어서 inputMode 는 정하지 않는다(일반 자판).
export function CalcField({ value, onChange, onCommit, ...rest }: {
  value: number;
  onChange?: (n: number) => void;
  onCommit?: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((t) => (calcAmount(t) === value && t !== "" ? t : String(value)));
  }, [value]);
  const finish = () => {
    const n = text.trim() === "" ? 0 : calcAmount(text);
    const v = n ?? value;
    setText(String(v));
    onChange?.(v);
    onCommit?.(v);
  };
  return (
    <input
      title="=3*5 처럼 계산식을 넣으면 계산한 금액이 들어가요(+ - * /)"
      {...rest}
      type="text"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = t.trim() === "" ? 0 : calcAmount(t);
        if (n != null) onChange?.(n);
      }}
      onBlur={(e) => { finish(); rest.onBlur?.(e); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur(); // 칸을 벗어날 때 한 번만 계산·저장
        rest.onKeyDown?.(e);
      }}
    />
  );
}
