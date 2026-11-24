"use client";

import { HostBack, HostDenied } from "@/components/HostBack";
import { HostLiveControls } from "@/components/HostLiveControls";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { TeamPicker, teamQ, useTeamParam } from "@/components/TeamScope";

type Stage = {
  event: { id: string; name: string };
  activity: { id: string; name: string; participants: string };
  team: { id: string; name: string } | null; // 조별 진행: 지금 보는 조
  teams: { id: string; name: string }[]; // 고를 수 있는 조(조 진행자는 맡은 조만)
  buttons?: { draw: string; reveal: string }; // 진행자 버튼 글자(템플릿)
  missingSteps: string[];
  live?: { active: boolean };
  serverNow: number;
  categories: string[];
  counts: { total: number; drawn: number; remaining: number; byCategory: Record<string, number> };
  current: null | {
    id: string; body: string; category: string; orderNo: number; paused: boolean; remainingMs: number; timeUp: boolean;
    minutes: number; extendMinutes?: number; nameRevealed: boolean; displayName: string; tips: string[];
  };
};
type Action = "draw" | "pause" | "resume" | "extend" | "skip" | "reveal" | "tips" | "end";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// 진행자 전체화면: 고민 뽑기. 뽑힌 고민의 내용만 크게 보이고 작성자는 이름 오픈 전까지 숨겨진다.
export default function WorryHostPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const [st, setSt] = useState<Stage | null>(null);
  const [recv, setRecv] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState(""); // 버튼을 눌러 난 오류(다음 버튼을 누를 때까지 그대로)
  const [loadErr, setLoadErr] = useState(""); // 2초마다 읽기에서 난 오류(다시 읽히면 지운다)
  const [notice, setNotice] = useState(""); // 진행자 없이 관리자가 진행할 때 같은 안내
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState("");
  const [spin, setSpin] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  // 조별 진행: ?team=조 id (고르지 않았으면 첫 조로)
  const [team, setTeam] = useTeamParam();
  const q = teamQ(team);

  const load = useCallback(async () => {
    if (team === null) return;
    const r = await api<Stage>(`/api/admin/events/${id}/activities/${aid}/worry${q}`);
    if (r.ok) {
      setSt(r.data);
      setRecv(Date.now());
      setLoadErr("");
      if (r.data.teams.length > 0 && !r.data.team) setTeam(r.data.teams[0].id);
    } else if (r.status === 401 || (r.status === 403 && !team)) setDenied(true);
    else setLoadErr(r.error);
  }, [id, aid, team, q, setTeam]);

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
    const r = await api(`/api/admin/events/${id}/activities/${aid}/worry${q}`, { body: { action, ...extra } });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else setNotice((r.data as { warning?: string }).warning ?? "");
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

  // 활동 마치기: 회원 화면의 '지금 진행 중' 표시를 끈다(남은 고민은 그대로, 다시 뽑으면 이어서 진행)
  function finish() {
    if (!window.confirm("활동을 마칠까요? 회원 화면에서 진행 중 표시가 사라져요. 남은 고민은 그대로 있어서 다시 뽑으면 이어서 할 수 있어요.")) return;
    act("end");
  }

  function fullscreen() {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else el.requestFullscreen?.().catch(() => setError("이 화면에서는 전체화면을 켤 수 없어요. 브라우저의 전체화면(F11)을 사용해 주세요."));
  }

  if (denied) return <HostDenied />;
  if (!st) return <div className="host">{error || loadErr ? <p role="alert">{error || loadErr}</p> : <p className="sub">불러오는 중이에요…</p>}</div>;

  const c = st.current;
  const drawLabel = st.buttons?.draw ?? "고민 뽑기";
  const revealLabel = st.buttons?.reveal ?? "이름 오픈";
  const elapsed = c && !c.paused && !c.timeUp && now ? Math.max(0, now - recv) : 0;
  const remaining = c ? Math.max(0, c.remainingMs - elapsed) : 0;
  const timeUp = c ? c.timeUp || (!c.paused && remaining <= 0) : false;
  const canDraw = !c || c.nameRevealed;
  const ended = !c && st.live?.active === false && st.counts.drawn > 0; // 마친 뒤(한 번이라도 뽑은 적이 있고 지금은 꺼짐)

  return (
    <div className="host" ref={wrap}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28 }}>{st.activity.name}</h1>
        <TeamPicker teams={st.teams} value={st.team?.id ?? ""} onChange={setTeam} />
        <span className="sub">{st.event.name}{st.team ? ` · ${st.team.name}` : ""} · 진행 {st.counts.drawn}개 · 남은 고민 {st.counts.remaining}개{st.activity.participants === "selected" ? " · 선택된 회원의 고민만" : ""}</span>
        <span style={{ flex: 1 }} />
        <button className="mini" type="button" onClick={fullscreen}>전체화면 ⛶</button>
        <HostLiveControls eventId={id} aid={aid} team={st.team?.id ?? ""} />
        <HostBack eventId={id} activityId={aid} />
      </header>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {loadErr && !error && <div className="msg bad" role="alert">{loadErr}</div>}
      {notice && <div className="msg info" role="status">{notice}</div>}
      {st.missingSteps.length > 0 && <div className="msg bad" role="alert">이 활동의 템플릿에 필요한 단계가 없어요: {st.missingSteps.join(", ")}.</div>}

      <div className="stage">
        <div className="panel" style={{ justifyContent: "center" }}>
          {spin && (
            <>
              <span className="sub" role="status">고민을 뽑는 중이에요…</span>
              <div className="roulette spin" aria-hidden="true">{spin}</div>
            </>
          )}
          {!spin && !c && ended && <span className="sub" role="status">활동을 마쳤어요. 회원 화면에서 진행 중 표시가 사라졌어요.</span>}
          {!spin && !c && <><h2>“{drawLabel}”를 눌러 주세요</h2><p className="sub" style={{ margin: 0 }}>이미 나온 고민은 다시 나오지 않아요. 남은 고민 {st.counts.remaining}개.</p></>}
          {!spin && c && (
            <>
              <span className="sub">{c.orderNo}번째 고민 · {c.category}</span>
              <div className="intro" style={{ fontSize: "clamp(26px, 3.4vw, 44px)", lineHeight: 1.6, maxHeight: "none" }}>{c.body}</div>
              {c.tips.length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.14)", paddingTop: 10 }}>
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
            <div className="num" style={{ font: "700 clamp(64px, 10vw, 120px)/1 var(--display)", color: timeUp ? "#ff5a52" : "#ffffff" }} aria-label="남은 시간">{c ? (timeUp ? "00:00" : fmt(remaining)) : "--:--"}</div>
            <span className="sub">{!c ? "고민을 뽑으면 시작돼요" : timeUp ? (c.nameRevealed ? "시간이 끝났어요." : `시간이 끝났어요. ${revealLabel}을 눌러 주세요.`) : c.paused ? "일시정지 중" : `기본 ${c.minutes}분`}</span>
            {c && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.paused ? <button className="btn white" type="button" disabled={busy} style={{ minHeight: 52 }} onClick={() => act("resume")}>계속</button>
                  : <button className="btn white" type="button" disabled={busy || timeUp} style={{ minHeight: 52 }} onClick={() => act("pause")}>일시정지</button>}
                <button className="btn white" type="button" disabled={busy} style={{ minHeight: 52 }} onClick={() => act("extend", { minutes: c.extendMinutes ?? 5 })}>+{c.extendMinutes ?? 5}분</button>
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

      <div className="controls" role="group" aria-label="진행자 버튼">
        {canDraw && (
          <>
            <button className="btn" type="button" disabled={busy || !!spin || st.counts.remaining === 0} onClick={draw}>{c ? `다음 ${drawLabel}` : drawLabel}</button>
            <select className="field" aria-label="카테고리 지정" value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: "1 1 220px", minHeight: 64, fontSize: 20 }}>
              <option value="">카테고리: 전체</option>
              {st.categories.map((k) => <option key={k} value={k}>{k} ({st.counts.byCategory[k] ?? 0})</option>)}
            </select>
          </>
        )}
        {c && !c.nameRevealed && <button className="btn blue" type="button" disabled={busy} onClick={() => act("reveal")}>{revealLabel}</button>}
        {c && <button className="btn white" type="button" disabled={busy} onClick={() => act("tips")}>AI 관점 3가지</button>}
        {(c || st.live?.active) && <button className="btn red" type="button" disabled={busy || !!spin} onClick={finish}>활동 마치기</button>}
      </div>
    </div>
  );
}
