"use client";

import { useState } from "react";
import { fs } from "@/lib/fs";

// 비밀번호·초대코드 입력칸. 오른쪽 눈 아이콘으로 입력한 내용을 보이거나 숨긴다.
export function PasswordField(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={props.id}
        className="field"
        type={show ? "text" : "password"}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        aria-describedby={props.describedBy}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={{ paddingRight: 56 }}
      />
      <button
        type="button"
        aria-label={show ? "입력한 내용 숨기기" : "입력한 내용 보기"}
        aria-pressed={show}
        aria-controls={props.id}
        onClick={() => setShow(!show)}
        style={{
          position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
          width: 48, height: 48, display: "grid", placeItems: "center",
          border: 0, background: "transparent", color: "var(--sub)", cursor: "pointer", borderRadius: 10,
        }}
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

function Eye() {
  return (
    <svg width="24" height="24" style={{ width: fs(24), height: fs(24), flex: "none" }} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="24" height="24" style={{ width: fs(24), height: fs(24), flex: "none" }} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.6 5.1A10 10 0 0 1 12 4.5c6.5 0 10.5 7.5 10.5 7.5a17.6 17.6 0 0 1-3.2 4.1M6.2 6.2C3.3 8.1 1.5 12 1.5 12s4 7.5 10.5 7.5c1.9 0 3.6-.6 5-1.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
