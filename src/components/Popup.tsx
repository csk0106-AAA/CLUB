"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 만들기·편집 화면을 띄우는 창(레이어 팝업).
// - 네이티브 <dialog>.showModal(): 포커스 가둠, Esc 로 닫기, 뒤 화면 어둡게.
// - 폭 640px 이상: 제목 줄을 끌어 옮기고, 오른쪽 아래 모서리·왼쪽/오른쪽/아래 가장자리를 끌어 크기를 바꾼다.
//   바꾼 크기와 "크게" 상태는 이 기기에 창 id 별로 기억한다(localStorage).
// - 휴대폰(640px 미만): 아래에서 올라오는 거의 전체 화면 창(크기 손잡이 없음, "크게"는 됨).
// - document.body 로 포털해서 그리므로 바깥 <form> 안에 넣어도 폼이 겹치지 않는다.
//   React 이벤트는 컴포넌트 트리를 따라 올라가므로 submit·click 은 창 밖으로 전달하지 않는다.
// - dirty 이면 닫기 전에 확인한다. 닫히면 연 버튼으로 포커스를 돌려준다.

type Geo = { x?: number; y?: number; w?: number; h?: number }; // CSS px (글자 크기 배율을 뺀 값)
type Saved = { w?: number; h?: number; max?: boolean };

const MIN_W = 320;
const MIN_H = 240;
const NARROW = "(max-width: 639px)";
const keyOf = (id: string) => `club-pop:${id}`;

function readSaved(id: string): Saved {
  try {
    const raw = localStorage.getItem(keyOf(id));
    const v = raw ? (JSON.parse(raw) as Saved) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function writeSaved(id: string, v: Saved) {
  try {
    localStorage.setItem(keyOf(id), JSON.stringify(v));
  } catch {
    // 저장소를 못 쓰는 환경: 이번에만 적용
  }
}
// 설정의 "글자 크기"(body zoom) 배율. 포인터 좌표(화면 px)를 CSS px 로 바꿀 때 쓴다.
function zoomOf(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z"));
  return z > 0 ? z : 1;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type PopupProps = {
  /** 크기를 기억할 이름(창 종류별로 하나) */
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
  /** 작성 중인 내용이 있으면 true: 닫기 전에 물어본다 */
  dirty?: boolean;
  /** 처음 너비(px). 기본 560 */
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Popup(props: PopupProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!props.open || !ready) return null;
  return createPortal(<PopupWindow {...props} />, document.body);
}

function PopupWindow({ id, onClose, title, dirty, width = 560, children, footer }: PopupProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [narrow, setNarrow] = useState(false);
  const [max, setMax] = useState(false);
  const [geo, setGeo] = useState<Geo>({});
  const dirtyRef = useRef(!!dirty);
  dirtyRef.current = !!dirty;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closingRef = useRef(false);
  const downOnBackdrop = useRef(false);
  const drag = useRef<{ dir: string; px: number; py: number; x: number; y: number; w: number; h: number; z: number; pid: number } | null>(null);

  // 닫기 요청: 작성 중이면 확인
  const requestClose = useCallback((): boolean => {
    if (dirtyRef.current && !window.confirm("작성 중인 내용이 사라져요. 닫을까요?")) return false;
    closingRef.current = true;
    onCloseRef.current();
    return true;
  }, []);

  // 열기·닫기, 포커스 처리
  useLayoutEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    closingRef.current = false;
    const opener = document.activeElement instanceof HTMLElement && !dlg.contains(document.activeElement) ? document.activeElement : null;
    const mq = window.matchMedia(NARROW);
    setNarrow(mq.matches);
    const saved = readSaved(id);
    setMax(!!saved.max);
    if (saved.w || saved.h) {
      const z = zoomOf();
      const vw = window.innerWidth / z;
      const vh = window.innerHeight / z;
      setGeo({
        w: saved.w ? clamp(saved.w, MIN_W, vw - 16) : undefined,
        h: saved.h ? clamp(saved.h, MIN_H, vh - 16) : undefined,
      });
    }
    try {
      if (!dlg.open) dlg.showModal();
    } catch {
      dlg.setAttribute("open", "");
    }
    // 첫 입력칸에 포커스 (없으면 닫기 버튼)
    const first = bodyRef.current?.querySelector<HTMLElement>(
      "[autofocus], input:not([type=hidden]):not([type=file]):not([tabindex='-1']):not(:disabled), select:not(:disabled), textarea:not(:disabled)",
    );
    (first ?? dlg.querySelector<HTMLElement>(".pop-x"))?.focus();

    const onCancel = (e: Event) => {
      e.preventDefault();
      requestClose();
    };
    // 브라우저가 Esc 를 연달아 눌러 강제로 닫은 경우
    const onNativeClose = () => {
      if (closingRef.current) return;
      if (!requestClose()) {
        try {
          dlg.showModal();
        } catch {
          // 무시
        }
      }
    };
    const onMq = () => setNarrow(mq.matches);
    dlg.addEventListener("cancel", onCancel);
    dlg.addEventListener("close", onNativeClose);
    mq.addEventListener("change", onMq);
    return () => {
      dlg.removeEventListener("cancel", onCancel);
      dlg.removeEventListener("close", onNativeClose);
      mq.removeEventListener("change", onMq);
      closingRef.current = true;
      try {
        if (dlg.open) dlg.close();
      } catch {
        // 무시
      }
      // 연 버튼으로 포커스 돌려주기 (화면이 다시 그려진 뒤)
      requestAnimationFrame(() => {
        if (!opener || !opener.isConnected) return;
        // 창 안의 버튼으로 연 창(겹친 창)이면 바깥 창이 열려 있을 때만, 아니면 다른 창이 없을 때만
        const host = opener.closest("dialog");
        if (host ? host.open : !document.querySelector("dialog.pop[open]")) opener.focus();
      });
    };
  }, [id, requestClose]);

  // 화면 크기가 줄면 창을 화면 안으로
  useEffect(() => {
    const fit = () => {
      const z = zoomOf();
      const vw = window.innerWidth / z;
      const vh = window.innerHeight / z;
      setGeo((g) => {
        if (g.x === undefined && g.w === undefined && g.h === undefined) return g;
        const w = g.w !== undefined ? clamp(g.w, Math.min(MIN_W, vw - 16), vw - 16) : undefined;
        const h = g.h !== undefined ? clamp(g.h, Math.min(MIN_H, vh - 16), vh - 16) : undefined;
        const x = g.x !== undefined ? clamp(g.x, 0, Math.max(0, vw - (w ?? MIN_W))) : undefined;
        const y = g.y !== undefined ? clamp(g.y, 0, Math.max(0, vh - (h ?? MIN_H))) : undefined;
        return { x, y, w, h };
      });
    };
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function startDrag(dir: string, e: React.PointerEvent<HTMLElement>) {
    if (narrow || max || e.button !== 0) return;
    if (dir === "move" && (e.target as HTMLElement).closest("button")) return;
    const dlg = ref.current;
    if (!dlg) return;
    e.preventDefault();
    const z = zoomOf();
    const r = dlg.getBoundingClientRect();
    drag.current = { dir, px: e.clientX, py: e.clientY, x: r.left / z, y: r.top / z, w: r.width / z, h: r.height / z, z, pid: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 무시
    }
  }
  function onDrag(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    const vw = window.innerWidth / d.z;
    const vh = window.innerHeight / d.z;
    const dx = (e.clientX - d.px) / d.z;
    const dy = (e.clientY - d.py) / d.z;
    if (d.dir === "move") {
      setGeo((g) => ({
        x: clamp(d.x + dx, 0, Math.max(0, vw - d.w)),
        y: clamp(d.y + dy, 0, Math.max(0, vh - d.h)),
        w: g.w ?? d.w,
        h: g.h,
      }));
      return;
    }
    let { x, w, h } = d;
    if (d.dir.includes("e")) w = clamp(d.w + dx, MIN_W, Math.max(MIN_W, vw - d.x));
    if (d.dir.includes("w")) {
      x = clamp(d.x + dx, 0, d.x + d.w - MIN_W);
      w = d.w + (d.x - x);
    }
    if (d.dir.includes("s")) h = clamp(d.h + dy, MIN_H, Math.max(MIN_H, vh - d.y));
    setGeo({ x, y: d.y, w, h });
  }
  function endDrag(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    if (d.dir !== "move") {
      setGeo((g) => {
        writeSaved(id, { w: g.w, h: g.h, max: false });
        return g;
      });
    }
  }
  function toggleMax() {
    const next = !max;
    setMax(next);
    writeSaved(id, { w: geo.w, h: geo.h, max: next });
  }
  // 크기 손잡이: 키보드로도 (화살표 ±20px)
  function gripKey(e: React.KeyboardEvent<HTMLElement>) {
    const step = e.shiftKey ? 60 : 20;
    const dw = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
    const dh = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
    if (!dw && !dh) return;
    e.preventDefault();
    const dlg = ref.current;
    if (!dlg) return;
    const z = zoomOf();
    const r = dlg.getBoundingClientRect();
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const x = r.left / z;
    const y = r.top / z;
    const w = clamp(r.width / z + dw, MIN_W, Math.max(MIN_W, vw - x));
    const h = clamp(r.height / z + dh, MIN_H, Math.max(MIN_H, vh - y));
    setGeo({ x, y, w, h });
    writeSaved(id, { w, h, max: false });
  }

  let style: React.CSSProperties = { ["--pop-w" as string]: `${width}px` };
  if (!narrow && !max) {
    if (geo.x !== undefined && geo.y !== undefined) {
      style = {
        ...style, left: geo.x, top: geo.y, right: "auto", bottom: "auto", margin: 0,
        width: geo.w, height: geo.h, maxWidth: "none",
        maxHeight: geo.h === undefined ? `calc(100% - ${Math.round(geo.y) + 8}px)` : "none",
      };
    } else {
      style = { ...style, width: geo.w, height: geo.h };
    }
  }

  const gripProps = (dir: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => startDrag(dir, e),
    onPointerMove: onDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });

  return (
    <dialog
      ref={ref}
      className={`pop${max ? " max" : ""}`}
      aria-labelledby={titleId}
      style={style}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget && outside(e.currentTarget, e.clientX, e.clientY);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (downOnBackdrop.current && e.target === e.currentTarget && outside(e.currentTarget, e.clientX, e.clientY)) requestClose();
        downOnBackdrop.current = false;
      }}
      onSubmit={(e) => e.stopPropagation()}
    >
      <div className="pop-bar" {...gripProps("move")}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="pop-ic" onClick={toggleMax} aria-pressed={max} title={max ? "원래 크기로" : "크게 보기"}>
          {max ? "원래대로" : "크게"}
        </button>
        <button type="button" className="pop-ic pop-x" onClick={() => requestClose()} aria-label="닫기">✕</button>
      </div>
      <div className="pop-body" ref={bodyRef}>{children}</div>
      {footer && <div className="pop-foot">{footer}</div>}
      {!narrow && !max && (
        <>
          <span className="pop-grip e" aria-hidden="true" {...gripProps("e")} />
          <span className="pop-grip w" aria-hidden="true" {...gripProps("w")} />
          <span className="pop-grip s" aria-hidden="true" {...gripProps("s")} />
          <span
            className="pop-grip se"
            role="button"
            tabIndex={0}
            aria-label="창 크기 바꾸기 (화살표 키)"
            title="끌어서 크기 바꾸기"
            onKeyDown={gripKey}
            {...gripProps("se")}
          />
        </>
      )}
    </dialog>
  );
}

function outside(el: HTMLElement, cx: number, cy: number): boolean {
  const r = el.getBoundingClientRect();
  return cx < r.left || cx > r.right || cy < r.top || cy > r.bottom;
}
