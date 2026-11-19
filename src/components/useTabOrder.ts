"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

// 위쪽 메뉴(탭)를 끌어서 순서 바꾸기. 순서는 서버(/api/admin/tab-order)에 저장해 모든 관리자에게 같게 보인다.
//   const to = useTabOrder("event", canEdit);
//   to.sort(tabs).map((t) => <button {...to.drag(t.key)} …>)
// 저장된 순서에 없는 새 메뉴는 원래 자리 순서대로 뒤에 붙는다.
export function useTabOrder(page: string, canEdit: boolean) {
  const [order, setOrder] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState("");
  const [overKey, setOverKey] = useState("");

  useEffect(() => {
    api<{ keys: string[] }>(`/api/admin/tab-order?page=${page}`).then((r) => r.ok && setOrder(r.data.keys));
  }, [page]);

  function sort<T extends { key: string }>(list: T[]): T[] {
    const rank = (k: string) => {
      const i = order.indexOf(k);
      return i < 0 ? order.length + list.findIndex((t) => t.key === k) : i;
    };
    return [...list].sort((a, b) => rank(a.key) - rank(b.key));
  }

  // from 을 to 자리로 옮기고 저장한다. all: 지금 화면 순서(모든 탭 key)
  function move(all: string[], from: string, to: string) {
    if (!from || from === to) return;
    const next = all.filter((k) => k !== from);
    next.splice(next.indexOf(to) + (all.indexOf(from) < all.indexOf(to) ? 1 : 0), 0, from);
    // 이 화면에 안 보이는 탭(일정 종류에 따라 숨은 탭)의 저장 순서도 잃지 않게 뒤에 붙인다
    const merged = [...next, ...order.filter((k) => !next.includes(k))];
    setOrder(merged);
    api(`/api/admin/tab-order`, { method: "PUT", body: { page, keys: merged } });
  }

  // 각 탭 버튼에 펼쳐 넣는 속성(관리 권한이 있을 때만 끌 수 있다)
  const drag = (key: string, all: string[]) =>
    canEdit
      ? {
          draggable: true,
          title: "끌어서 순서를 바꿀 수 있어요",
          onDragStart: (e: React.DragEvent) => { setDragKey(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); },
          onDragOver: (e: React.DragEvent) => { if (dragKey) { e.preventDefault(); setOverKey(key); } },
          onDragLeave: () => setOverKey((k) => (k === key ? "" : k)),
          onDrop: (e: React.DragEvent) => { e.preventDefault(); move(all, dragKey, key); setDragKey(""); setOverKey(""); },
          onDragEnd: () => { setDragKey(""); setOverKey(""); },
          "data-dragging": dragKey === key || undefined,
          // 놓을 자리: 오른쪽으로 옮기면 그 탭 뒤, 왼쪽으로 옮기면 그 탭 앞
          "data-over": overKey === key && dragKey && dragKey !== key ? (all.indexOf(dragKey) < all.indexOf(key) ? "after" : "before") : undefined,
        }
      : {};

  return { sort, drag };
}
