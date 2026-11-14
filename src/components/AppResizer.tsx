"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ADMIN_W_KEY, APP_W_KEY } from "./ThemeBoot";

// PC(화면 폭 900px 이상)에서 앱 화면(main.app) 오른쪽 가장자리에 세로 손잡이를 둔다.
// 끌면 앱 너비가 바뀌고(가운데 정렬이라 양쪽이 함께 늘어남), 두 번 누르면 기본 너비로 돌아간다.
// 회원 화면은 --app-w(기본 720px), 관리자 화면(.app.admin)은 --admin-w(기본 1120px).
// 이 기기(localStorage)에 저장하고, ThemeBoot 스크립트가 첫 화면 전에 적용한다.

const MIN = 420;
const WIDE = "(min-width: 900px)";

function zoomOf(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z"));
  return z > 0 ? z : 1;
}

type Pos = { x: number; w: number; max: number; admin: boolean };

export function AppResizer() {
  const pathname = usePathname();
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ cx: number; z: number; pid: number; admin: boolean } | null>(null);
  const raf = useRef(0);

  const measure = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>("main.app");
      if (!main || !window.matchMedia(WIDE).matches || pathname.startsWith("/host") || document.querySelector(".host")) {
        setPos(null);
        return;
      }
      const z = zoomOf();
      const r = main.getBoundingClientRect();
      const next: Pos = {
        x: Math.round(r.right / z),
        w: Math.round(r.width / z),
        max: Math.round(window.innerWidth / z - 40),
        admin: main.classList.contains("admin"),
      };
      setPos((p) => (p && p.x === next.x && p.w === next.w && p.max === next.max && p.admin === next.admin ? p : next));
    });
  }, [pathname]);

  useEffect(() => {
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    const mq = window.matchMedia(WIDE);
    window.addEventListener("resize", measure);
    mq.addEventListener("change", measure);
    return () => {
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", measure);
      cancelAnimationFrame(raf.current);
    };
  }, [measure]);

  function setWidth(admin: boolean, w: number | null, save: boolean) {
    const name = admin ? "--admin-w" : "--app-w";
    const key = admin ? ADMIN_W_KEY : APP_W_KEY;
    const root = document.documentElement;
    if (w === null) root.style.removeProperty(name);
    else root.style.setProperty(name, `${Math.round(w)}px`);
    if (save) {
      try {
        if (w === null) localStorage.removeItem(key);
        else localStorage.setItem(key, String(Math.round(w)));
      } catch {
        // 이번에만 적용
      }
    }
    measure();
  }

  if (!pos) return null;
  const limit = (w: number) => Math.max(MIN, Math.min(pos.max, w));

  return (
    <div
      className={`app-resizer${dragging ? " on" : ""}`}
      style={{ left: pos.x, top: 0, bottom: 0 }}
      role="separator"
      aria-orientation="vertical"
      aria-label={pos.admin ? "관리자 화면 너비 (끌거나 화살표 키, 두 번 누르면 기본)" : "앱 화면 너비 (끌거나 화살표 키, 두 번 누르면 기본)"}
      aria-valuenow={pos.w}
      aria-valuemin={MIN}
      aria-valuemax={Math.max(MIN, pos.max)}
      tabIndex={0}
      title="끌어서 화면 너비 바꾸기 · 두 번 누르면 기본 너비"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const main = document.querySelector<HTMLElement>("main.app");
        if (!main) return;
        e.preventDefault();
        const r = main.getBoundingClientRect();
        drag.current = { cx: (r.left + r.right) / 2, z: zoomOf(), pid: e.pointerId, admin: pos.admin };
        document.body.classList.add("app-resizing");
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 무시
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.pid !== e.pointerId) return;
        setWidth(d.admin, limit((2 * (e.clientX - d.cx)) / d.z), false);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d || d.pid !== e.pointerId) return;
        drag.current = null;
        setDragging(false);
        document.body.classList.remove("app-resizing");
        setWidth(d.admin, limit((2 * (e.clientX - d.cx)) / d.z), true);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        document.body.classList.remove("app-resizing");
      }}
      onDoubleClick={() => setWidth(pos.admin, null, true)}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" ? 20 : e.key === "ArrowLeft" ? -20 : 0;
        if (step) {
          e.preventDefault();
          setWidth(pos.admin, limit(pos.w + step), true);
        } else if (e.key === "Home") {
          e.preventDefault();
          setWidth(pos.admin, null, true);
        }
      }}
    />
  );
}
