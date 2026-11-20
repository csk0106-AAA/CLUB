"use client";

import { useRef, useState } from "react";

// 옆으로 밀어서 지우기(알림 창): 손가락·마우스로 왼쪽이나 오른쪽으로 밀면 밀려 나가며 사라진다.
//  조금만 밀면 제자리로 돌아오고, 밀었을 때는 안의 링크가 눌리지 않는다. 키보드는 안의 "지우기" 없이도 Delete 키로 지울 수 있다.
export function Swipe({ children, onDismiss, label }: { children: React.ReactNode; onDismiss: () => void; label: string }) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);
  const lock = useRef<"x" | "y" | null>(null);

  function end() {
    if (!start.current) return;
    start.current = null;
    lock.current = null;
    if (Math.abs(dx) > 80) {
      setDx(dx > 0 ? 600 : -600);
      setGone(true);
      setTimeout(onDismiss, 200);
    } else setDx(0);
  }

  return (
    <div
      role="group"
      aria-label={`${label} (옆으로 밀거나 Delete 키로 지우기)`}
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === "Delete") { setGone(true); setTimeout(onDismiss, 150); } }}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; moved.current = false; lock.current = null; }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const x = e.clientX - s.x;
        const y = e.clientY - s.y;
        if (!lock.current) {
          if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
          lock.current = Math.abs(x) > Math.abs(y) ? "x" : "y";
          if (lock.current === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        if (lock.current !== "x") return;
        moved.current = true;
        setDx(x);
      }}
      onPointerUp={end}
      onPointerCancel={() => { start.current = null; lock.current = null; setDx(0); }}
      onClickCapture={(e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }}
      style={{
        touchAction: "pan-y", transform: `translateX(${dx}px)`, opacity: gone ? 0 : 1 - Math.min(Math.abs(dx) / 300, 0.6),
        transition: start.current ? "none" : "transform .2s ease, opacity .2s ease",
      }}
    >
      {children}
    </div>
  );
}
