"use client";

import { useEffect, useRef } from "react";

export type ActionMsg = { tone: "bad" | "info"; text: string; at?: "bottom" } | null;

// 버튼을 누른 뒤의 결과 문구. 화면 밖에 있으면 보이는 곳까지 살짝 스크롤해서, 눌렀는데 반응이 없는 것처럼 보이지 않게 한다.
//  at: 문구를 둘 자리(같은 화면에 위·아래 버튼이 있을 때 누른 버튼 가까이에 보여 준다).
export function ActionNote({ msg, at }: { msg: ActionMsg; at?: "bottom" }) {
  const ref = useRef<HTMLDivElement>(null);
  const show = !!msg && (msg.at ?? undefined) === at;
  useEffect(() => {
    if (show) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [show, msg]);
  if (!show || !msg) return null;
  return (
    <div ref={ref} className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>
      {msg.tone === "info" ? "✓ " : ""}{msg.text}
    </div>
  );
}
