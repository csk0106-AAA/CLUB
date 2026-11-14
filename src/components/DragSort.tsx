"use client";

import { useRef, useState } from "react";
import { fs } from "@/lib/fs";

// 끌어서 순서 바꾸기. 마우스·손가락(터치) 모두 되고, 손잡이에 초점을 두고 위·아래 방향키로도 옮길 수 있다.
//   const ds = useDragSort(items, setItems);
//   items.map((it, i) => <div {...ds.item(i)}> <DragHandle {...ds.handle(i, "이름")} /> … </div>)
// 끄는 동안에는 끌고 있는 줄을 흐리게, 놓을 자리를 파란 선으로 보여 주고, 손을 떼면 onReorder 를 부른다.

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function useDragSort<T>(items: T[], onReorder: (next: T[]) => void) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  // from: 끌고 있는 줄, slot: 놓을 자리(0~n, 줄 사이 위치)
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null);
  const n = items.length;

  function slotAt(y: number): number {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const r = rows.current[i]?.getBoundingClientRect();
      if (r && y > r.top + r.height / 2) s = i + 1;
    }
    return s;
  }

  function finish(from: number, slot: number) {
    const to = slot > from ? slot - 1 : slot;
    if (to !== from) onReorder(moveItem(items, from, to));
  }

  // 화면 끝 근처에서는 저절로 스크롤
  function autoScroll(y: number) {
    const edge = 70;
    if (y < edge) window.scrollBy(0, -12);
    else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
  }

  return {
    dragging: drag !== null,
    item(i: number) {
      const isSlotTop = drag && drag.slot === i && drag.slot !== drag.from && drag.slot !== drag.from + 1;
      const isSlotEnd = drag && i === n - 1 && drag.slot === n && drag.from !== n - 1;
      return {
        ref: (el: HTMLElement | null) => { rows.current[i] = el; },
        style: {
          opacity: drag?.from === i ? 0.45 : 1,
          boxShadow: isSlotTop ? "0 -4px 0 0 var(--blue)" : isSlotEnd ? "0 4px 0 0 var(--blue)" : undefined,
          transition: "opacity .12s",
        } as React.CSSProperties,
      };
    },
    handle(i: number, label: string) {
      return {
        ref: (el: HTMLButtonElement | null) => { handles.current[i] = el; },
        label,
        active: drag?.from === i,
        onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ from: i, slot: i });
        },
        onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
          if (!drag) return;
          autoScroll(e.clientY);
          const slot = slotAt(e.clientY);
          if (slot !== drag.slot) setDrag({ ...drag, slot });
        },
        onPointerUp() {
          if (drag) finish(drag.from, drag.slot);
          setDrag(null);
        },
        onPointerCancel() {
          setDrag(null);
        },
        onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
          const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
          if (!d) return;
          e.preventDefault();
          const to = i + d;
          if (to < 0 || to >= n) return;
          onReorder(moveItem(items, i, to));
          // 옮긴 뒤에도 같은 항목의 손잡이에 초점을 둔다
          requestAnimationFrame(() => handles.current[to]?.focus());
        },
      };
    },
  };
}

type HandleProps = ReturnType<ReturnType<typeof useDragSort>["handle"]>;

// 끌기 손잡이(⠿). 손가락으로 끌 때 화면이 스크롤되지 않도록 touch-action: none.
export function DragHandle({ ref, label, active, ...on }: HandleProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${label} 순서 바꾸기: 끌어서 옮기거나 위·아래 방향키를 눌러요`}
      title="끌어서 순서 바꾸기"
      {...on}
      style={{
        width: 44, minWidth: 44, height: 44, display: "grid", placeItems: "center", flex: "none",
        border: "1px solid var(--line)", borderRadius: 10, background: active ? "var(--blue-bg)" : "var(--card)",
        color: active ? "var(--blue-t)" : "var(--sub)", cursor: active ? "grabbing" : "grab", touchAction: "none", userSelect: "none",
      }}
    >
      <svg width="18" height="18" style={{ width: fs(18), height: fs(18), flex: "none" }} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <circle cx="8" cy="5" r="2" /><circle cx="16" cy="5" r="2" />
        <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
        <circle cx="8" cy="19" r="2" /><circle cx="16" cy="19" r="2" />
      </svg>
    </button>
  );
}
