"use client";

import { HostBack, HostDenied } from "@/components/HostBack";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Stage = {
  event: { id: string; name: string };
  activity: { id: string; name: string; participants: string };
  missingSteps: string[];
  serverNow: number;
  categories: string[];
  counts: { total: number; drawn: number; remaining: number; byCategory: Record<string, number> };
  current: null | {
    id: string; body: string; category: string; orderNo: number; paused: boolean; remainingMs: number; timeUp: boolean;
    minutes: number; nameRevealed: boolean; displayName: string; tips: string[];
  };
};
type Action = "draw" | "pause" | "resume" | "extend" | "skip" | "reveal" | "tips";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// 사회자 전체화면: 고민 뽑기. 뽑힌 고민의 내용만 크게 보이고 작성자는 이름 오픈 전까지 숨겨진다.
export default function WorryHostPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const [st, setSt] = useState<Stage | null>(null);
  const [recv, setRecv] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState("");
  const [spin, setSpin] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<Stage>(`/api/admin/events/${id}/activities/${aid}/worry`);
    if (r.ok) {
      setSt(r.data);
      setRecv(Date.now());
      setError("");
    } else if (r.status === 401 || r.status === 403) setDenied(true);
    else setError(r.error);
  }, [id, aid]);

  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") await load();
      if (!stop) t = setTimeout(tick, 2000);
    }
    tick();
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      stop = true;
      clearTimeout(t);
      clearInterval(clock);
    };
  }, [load]);

  async function act(action: Action, extra: { category?: string; minutes?: number } = {}) {
    setBusy(true);
    setError("");
    const r = await api(`/api/admin/events/${id}/activities/${aid}/worry`, { body: { action, ...extra } });
    setBusy(false);
    if (!r.ok) setError(r.error);
    await load();
  }

  // 로또 번호 뽑기처럼 카테고리 이름이 돌아가다(약 1.8초, 점점 느려짐) 서버가 뽑은 고민이 나온다.
  // 아직 나오지 않은 고민의 내용은 서버가 내려주지 않으므로 카테고리 이름만 돌린다.
  // 움직임 줄이기 설정이면 돌리지 않고 "뽑는 중" 문구만 보여 준다.
  // 서버 뽑기는 연출과 동시에 시작하고, 연출이 끝나면 실제로 뽑힌 고민이 나온다(연출 중에는 화면에 가려 둔다).
  async function draw() {
    if (!st) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setSpin("고민을 뽑는 중…");
    const req = act("draw", cat ? { category: cat } : {});
    if (!reduce) {
      const left = st.categories.filter((k) => (st.counts.byCategory[k] ?? 0) > 0);
      const pool = cat ? [cat] : left.length ? left : st.categories;
      const labels = pool.length > 1 ? pool : [...pool, "고민을 뽑는 중…"];
      let i = Math.floor(Math.random() * labels.length);
      let elapsed = 0;
      let step = 70;
      while (elapsed < 1800) {
        setSpin(labels[i++ % labels.length]);
        await new Promise((r) => setTimeout(r, step));
        elapsed += step;
        step = Math.min(260, Math.round(step * 1.12));
      }
    }
    try {
      await req;
    } finally {
      setSpin("");
    }
  }

  function fullscreen() {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else el.requestFullscreen?.().catch(() => setError("이 화면에서는 전체화면을 켤 수 없어요. 브라우저의 전체화면(F11)을 사용해 주세요."));
  }

  if (denied) return <HostDenied />;
  if (!st) return <div className="host">{error ? <p role="alert">{error}</p> : <p className="sub">불러오는 중이에요…</p>}</div>;

  const c = st.current;
  const elapsed = c && !c.paused && !c.timeUp && now ? Math.max(0, now - recv) : 0;
  const remaining = c ? Math.max(0, c.remainingMs - elapsed) : 0;
  const timeUp = c ? c.timeUp || (!c.paused && remaining <= 0) : false;
  const canDraw = !c || c.nameRevealed;

  return (
    <div className="host" ref={wrap}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28 }}>{st.activity.name}</h1>
        <span className="sub">{st.event.name} · 진행 {st.counts.drawn}개 · 남은 고민 {st.counts.remaining}개{st.activity.participants === "selected" ? " · 선택된 회원의 고민만" : ""}</span>
        <span style={{ flex: 1 }} />
        <button className="mini" type="button" onClick={fullscreen}>전체화면 ⛶</button>
        <HostBack eventId={id} />
      </header>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {st.missingSteps.length > 0 && <div className="msg bad" role="alert">이 활동의 템플릿에 필요한 단계가 없어요: {st.missingSteps.join(", ")}.</div>}

      <div className="stage">
        <div className="panel" style={{ justifyContent: "center" }}>
          {spin && (
            <>
              <span className="sub" role="status">고민을 뽑는 중이에요…</span>
              <div className="roulette spin" aria-hidden="true">{spin}</div>
            </>
          )}
          {!spin && !c && <><h2>“고민 뽑기”를 눌러 주세요</h2><p className="sub" style={{ margin: 0 }}>이미 나온 고민은 다시 나오지 않아요. 남은 고민 {st.counts.remaining}개.</p></>}
          {!spin && c && (
            <>
              <span className="sub">{c.orderNo}번째 고민 · {c.category}</span>
              <div className="intro" style={{ fontSize: "clamp(26px, 3.4vw, 44px)", lineHeight: 1.6, maxHeight: "none" }}>{c.body}</div>
              {c.tips.length > 0 && (
                <div style={{ borderTop: "2px solid #37464f", paddingTop: 10 }}>
                  <b className="sub">대화를 시작하는 관점</b>
                  <ol style={{ margin: "6px 0 0", paddingLeft: 24, fontSize: 24, lineHeight: 1.6 }}>{c.tips.map((t, i) => <li key={i}>{t}</li>)}</ol>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="panel">
            <h3>대화 시간</h3>
            <div className="num" style={{ font: "400 clamp(64px, 10vw, 120px)/1 var(--display)", color: timeUp ? "#ff4b4b" : "#ffc800" }} aria-label="남은 시간">{c ? (timeUp ? "00:00" : fmt(remaining)) : "--:--"}</div>
            <span className="sub">{!c ? "고민을 뽑으면 시작돼요" : timeUp ? (c.nameRevealed ? "시간이 끝났어요." : "시간이 끝났어요. 이름 오픈을 눌러 주세요.") : c.paused ? "일시정지 중" : `기본 ${c.minutes}분`}</span>
            {c && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.paused ? <button className="btn white" type="button" disabled={busy} style={{ minHeight: 52 }} onClick={() => act("resume")}>계속</button>
                  : <button className="btn white" type="button" disabled={busy || timeUp} style={{ minHeight: 52 }} onClick={() => act("pause")}>일시정지</button>}
                <button className="btn white" type="button" disabled={busy} style={{ minHeight: 52 }} onClick={() => act("extend", { minutes: 5 })}>+5분</button>
                <button className="btn white" type="button" disabled={busy || timeUp} style={{ minHeight: 52 }} onClick={() => act("skip")}>건너뛰기</button>
              </div>
            )}
          </div>
          <div className="panel">
            <h3>작성자</h3>
            <div className={`namebox ${c?.nameRevealed ? "on" : ""}`} aria-live="polite">{c?.nameRevealed ? c.displayName : "?"}</div>
          </div>
        </div>
      </div>

      <div className="controls" role="group" aria-label="사회자 버튼">
        {canDraw && (
          <>
            <button className="btn" type="button" disabled={busy || !!spin || st.counts.remaining === 0} onClick={draw}>{c ? "다음 고민 뽑기" : "고민 뽑기"}</button>
            <select className="field" aria-label="카테고리 지정" value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: "1 1 220px", minHeight: 64, fontSize: 20 }}>
              <option value="">카테고리: 전체</option>
              {st.categories.map((k) => <option key={k} value={k}>{k} ({st.counts.byCategory[k] ?? 0})</option>)}
            </select>
          </>
        )}
        {c && !c.nameRevealed && <button className="btn blue" type="button" disabled={busy} onClick={() => act("reveal")}>이름 오픈</button>}
        {c && <button className="btn white" type="button" disabled={busy} onClick={() => act("tips")}>AI 관점 3가지</button>}
      </div>
    </div>
  );
}
