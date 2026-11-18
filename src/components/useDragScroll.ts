"use client";

import { useRef } from "react";

// 옆으로 넘기는 줄(scroll-snap)을 PC 마우스로 잡고 끌어 넘기기. 휴대폰 손가락·터치패드는 브라우저 기본 스크롤 그대로.
//  - 5px 넘게 끌면 끌기로 보고, 끄는 동안 .dragging(스냅 끔)을 붙인다.
//  - 손을 떼면 가장 가까운 칸에 맞춰 멈춘다(align: start = 왼쪽 끝 맞춤, center = 가운데 맞춤).
//  - 끈 뒤 바로 오는 클릭(링크 이동·크게 보기)은 막는다.
// 쓰는 곳: 일정 사진첩(EventPhotos), 홈 다가오는 나의 일정(EventRail). 줄 요소에 {...handlers} 를 붙인다.
export function useDragScroll(align: "start" | "center" = "start") {
  const drag = useRef<{ x: number; left: number; moved: boolean; el: HTMLElement } | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    dragged.current = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = e.currentTarget;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false, el };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) {
      d.moved = true;
      d.el.classList.add("dragging");
      d.el.setPointerCapture(e.pointerId);
    }
    if (d.moved) d.el.scrollLeft = d.left - dx;
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    dragged.current = true;
    const box = d.el.getBoundingClientRect();
    const anchor = align === "center" ? box.left + box.width / 2 : box.left;
    const pos = (k: HTMLElement) => { const r = k.getBoundingClientRect(); return align === "center" ? r.left + r.width / 2 : r.left; };
    const kids = [...d.el.children] as HTMLElement[];
    d.el.classList.remove("dragging");
    if (!kids.length) return;
    const near = kids.reduce((b, k) => (Math.abs(pos(k) - anchor) < Math.abs(pos(b) - anchor) ? k : b), kids[0]);
    d.el.scrollTo({ left: d.el.scrollLeft + pos(near) - anchor, behavior: "smooth" });
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (!dragged.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragged.current = false;
  };
  const onDragStart = (e: React.DragEvent) => e.preventDefault(); // 이미지·링크 끌어 놓기 막기

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onClickCapture, onDragStart };
}
