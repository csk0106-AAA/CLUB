"use client";

import { useEffect, useState } from "react";

// 숫자 칸: 다 지우고 새로 적을 수 있다(지우는 순간 0이 다시 채워져 "05"가 되던 문제).
//  적는 동안은 글자 그대로 두고, 숫자가 되면 바로 반영한다. 칸을 벗어나면 범위(min~max)에 맞추고 비어 있으면 min.
export function NumField({ value, onChange, min = 0, max = 9999, ...rest }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "type">) {
  const [text, setText] = useState(String(value));
  // 밖에서 값이 바뀌면(불러오기 등) 칸도 맞춘다
  useEffect(() => {
    setText((t) => (Number(t) === value && t !== "" ? t : String(value)));
  }, [value]);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        setText(t);
        if (t !== "") onChange(clamp(Number(t)));
      }}
      onBlur={(e) => {
        const n = text === "" ? min : clamp(Number(text));
        setText(String(n));
        onChange(n);
        rest.onBlur?.(e);
      }}
    />
  );
}
