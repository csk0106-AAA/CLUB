"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { playSfx } from "@/lib/sfx";
import { EndOfActivities, type NextLink } from "./NextActivityButton";

// 내가 누구일까요? 현장 맞히기 흐름의 진행자 전체화면(프로젝터용, 조마다)
//  ① 한 명씩 소개 열기 → 맞히기 → 마감 ② 한 명씩 “저예요” ③ 한 명씩 진실과 거짓(모두 투표하면 저절로 결과) ④ 시상(추측왕·직감왕)
export type FlowRound = {
  id: string; state: string; orderNo: number; alias: string; introMd: string; nameRevealed: boolean; name: string;
  guessResults: { name: string; count: number }[]; guessTotal: number; guessJoined: number; guessEligible: number;
  statements: string[]; votes: { counts: number[]; voted: number; total?: number; eligible: number; notVoted: string[] };
  lieIndex: number; correctVoters: string[]; correctGuessers: string[];
};
export type FlowInfo = {
  phase: "guess" | "reveal" | "tl" | "done";
  awards: boolean;
  hasAwards: boolean;
  rounds: { orderNo: number; alias: string; state: string; name: string }[];
};
export type FlowAct = "open" | "gclose" | "reveal" | "name" | "vote" | "answer" | "awards" | "back";

const PHASES = [
  { key: "guess", label: "① 누구일까요? 맞히기" },
  { key: "reveal", label: "② 저예요" },
  { key: "tl", label: "③ 진실과 거짓" },
  { key: "awards", label: "④ 시상" },
];
const CHIP: Record<string, string> = {
  guess: "맞히는 중", guessed: "맞히기 마감", reveal: "저예요 대기", named: "이름 공개", voting: "투표 중", answer: "결과 발표",
};
const NO = [
  { bg: "#eceef0", ink: "#111111" },
  { bg: "#a6adb5", ink: "#111111" },
  { bg: "#5f666e", ink: "#ffffff" },
];
const BAR = ["#eceef0", "#a6adb5", "#6b737c", "#ced3d8"];

export function WhoFlowStage({ flow, r, remaining, selectable, busy, act, id, aid, q, setError, next, leftover }: {
  flow: FlowInfo; r: FlowRound | null; remaining: number; selectable: { id: string; name: string }[]; next?: NextLink | null; leftover?: (NextLink & { remaining: number }) | null;
  busy: boolean; act: (a: FlowAct, target?: string) => void; id: string; aid: string; q: string; setError: (e: string) => void;
}) {
  const [pickId, setPickId] = useState("");
  // 효과음: 단계가 바뀔 때(다른 기기에서 눌러도 이 화면이 바뀌면) 한 번
  const sig = `${r?.id ?? ""}:${r?.state ?? ""}:${flow.awards ? "awards" : ""}`;
  const prevSig = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSig.current;
    prevSig.current = sig;
    if (prev === null || prev === sig) return; // 처음 열 때는 소리 없이
    if (flow.awards && !prev.endsWith(":awards")) return playSfx("fanfare");
    const st = r?.state;
    if (st === "guess" || st === "voting") playSfx("ding");
    else if (st === "guessed") playSfx("drum");
    else if (st === "reveal") playSfx("roll");
    else if (st === "named") playSfx("tada");
    else if (st === "answer") playSfx("correct");
  }, [sig, flow.awards, r?.state]);
  const count = (st: string) => flow.rounds.filter((x) => x.state === st).length;
  const nowPhase = flow.awards ? "awards" : flow.phase === "done" ? "tl" : flow.phase;
  const guessing = r?.state === "guess";
  const revealing = r?.state === "reveal";
  const voting = r?.state === "voting";
  const leftGuessed = count("guessed");
  const leftNamed = count("named");

  if (flow.awards) {
    return (
      <>
        <Stepper now={nowPhase} />
        <Awards id={id} aid={aid} q={q} setError={setError} />
        {/* 아직 진실과 거짓을 하지 않은 사람이 남아 있으면(시상을 먼저 연 경우) 이어서 할 수 있다 */}
        <div className="controls" role="group" aria-label="진행자 버튼">
          {leftNamed > 0 && <button className="btn white" type="button" disabled={busy} onClick={() => act("vote")}>‹ 남은 진실과 거짓 이어서 하기</button>}
          {/* 다음 활동으로, 없으면 "남은 활동이 없습니다"(남은 고민이 있으면 다시 나누기) */}
          <EndOfActivities next={next} leftover={leftover} />
        </div>
      </>
    );
  }

  return (
    <>
      <Stepper now={nowPhase} />
      {flow.rounds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} aria-label="차례 목록">
          {flow.rounds.map((x) => (
            <span key={x.orderNo} className="hostcard" style={{ padding: "6px 12px", flexDirection: "row", gap: 8, alignItems: "center", ...(["guess", "reveal", "voting"].includes(x.state) ? { borderColor: "#7ee2a8" } : {}) }}>
              <b className="num">{x.orderNo}</b>
              <span>“{x.alias}”{x.name ? ` · ${x.name}` : ""}</span>
              <span className="sub">{CHIP[x.state] ?? x.state}</span>
            </span>
          ))}
        </div>
      )}

      <div className="stage">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {!r && (
            <div className="panel">
              <h2>첫 소개를 열어 주세요</h2>
              <p className="sub" style={{ margin: 0 }}>조원 소개를 한 명씩 열고, 회원 휴대폰에서 누구인지 골라요. 이름은 모두 맞힌 뒤 “저예요”로 공개해요. 열 수 있는 소개 {remaining}개 남았어요.</p>
            </div>
          )}
          {r && ["guess", "guessed", "reveal", "named"].includes(r.state) && (
            <div className="panel">
              <span className="sub">{r.orderNo}번째 소개 · 이 분은 누구일까요?</span>
              <div className="alias">“{r.alias}”</div>
              {/* 맞히기·저예요 단계 모두 소개 글을 함께 보여 준다(별칭은 크게 그대로) */}
              <div className="intro">{r.introMd}</div>
            </div>
          )}
          {r && (r.state === "voting" || r.state === "answer") && (
            <>
              <h2 style={{ color: "var(--violet-t)", fontSize: 34 }}>{r.name || r.alias} 님의 진실과 거짓</h2>
              <p style={{ margin: 0 }}>거짓이라고 생각하는 번호를 내 휴대폰에서 골라 주세요. {r.name || "본인"} 님은 투표하지 않아요. 모두 투표하면 결과가 바로 발표돼요.</p>
              {r.statements.map((t, i) => (
                <div key={i} className={`stmt ${r.state === "answer" ? (i === r.lieIndex ? "lie" : "truth") : ""}`}>
                  <span className="no" style={{ background: NO[i % 3].bg, color: NO[i % 3].ink }}>{i + 1}</span>
                  <span style={{ flex: 1 }}>{t}</span>
                  {r.state === "answer" && <b>{i === r.lieIndex ? "거짓!" : "진실"}</b>}
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {r && (r.state === "guess" || r.state === "guessed") && (
            <div className="panel">
              <h3>맞히기</h3>
              <div className="hostcard">
                <span className="sub">고른 사람</span>
                <b className="num">{r.guessJoined} / {r.guessEligible}명</b>
              </div>
              <span className="sub">{r.state === "guess" ? "모두 고르면 “맞히기 마감”을 눌러 주세요. 누가 누구를 골랐는지는 “저예요” 단계에서 보여요." : "마감했어요. 다음 소개를 열거나, 모두 열었으면 “저예요”를 시작해요."}</span>
            </div>
          )}
          {r && (r.state === "reveal" || r.state === "named") && (
            <>
              <div className="panel">
                <h3>누구라고 골랐을까요? ({r.guessTotal}명)</h3>
                {r.guessResults.length === 0 && <span className="sub">고른 분이 없어요.</span>}
                {r.guessResults.slice(0, 6).map((g, i) => (
                  <div key={g.name}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>{g.name}</span><span className="num">{g.count}표</span></div>
                    <div className="bar"><i style={{ width: `${r.guessTotal ? (g.count / r.guessTotal) * 100 : 0}%`, background: BAR[i % BAR.length] }} /></div>
                  </div>
                ))}
              </div>
              <div className="panel">
                <h3>정답</h3>
                <div className={`namebox ${r.nameRevealed ? "on" : ""}`} aria-live="polite">{r.nameRevealed ? r.name : "?"}</div>
                {revealing && <span className="sub">당사자 휴대폰에 “저예요” 버튼이 떠 있어요. 진행자가 대신 공개할 수도 있어요.</span>}
                {r.nameRevealed && <span className="sub">맞힌 분 {r.correctGuessers.length}명{r.correctGuessers.length ? `: ${r.correctGuessers.join(", ")}` : ""}</span>}
              </div>
            </>
          )}
          {r && (r.state === "voting" || r.state === "answer") && (
            <div className="panel">
              <h3>거짓 투표 현황 <span className="num">투표 {r.votes.voted} / {r.votes.eligible}명</span></h3>
              {r.votes.counts.map((n, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>{i + 1}번</span><span className="num">{n}표</span></div>
                  <div className="bar"><i style={{ width: `${(r.votes.total ?? r.votes.voted) ? (n / (r.votes.total ?? r.votes.voted)) * 100 : 0}%`, background: r.state === "answer" && i === r.lieIndex ? "#ff5a52" : NO[i % 3].bg }} /></div>
                </div>
              ))}
              {voting && r.votes.notVoted.length > 0 && (
                <details>
                  <summary className="sub" style={{ cursor: "pointer" }}>아직 투표 안 한 사람 ({r.votes.notVoted.length}명)</summary>
                  <div className="sub" style={{ marginTop: 6, lineHeight: 1.7 }}>{r.votes.notVoted.join(", ")}</div>
                </details>
              )}
              {r.state === "answer" && <span className="sub">거짓을 맞힌 분 {r.correctVoters.length}명{r.correctVoters.length ? `: ${r.correctVoters.join(", ")}` : ""}</span>}
            </div>
          )}
        </div>
      </div>

      {/* 진행자 버튼 */}
      <div className="controls" role="group" aria-label="진행자 버튼">
        {flow.phase === "guess" && !guessing && (
          <>
            {remaining > 0 && <button className="btn" type="button" disabled={busy} onClick={() => act("open")}>{flow.rounds.length ? "다음 소개 열기 ›" : "소개 열기 (무작위)"}</button>}
            {remaining > 0 && selectable.length > 0 && (
              <div style={{ display: "flex", gap: 8, flex: "1 1 280px" }}>
                <select className="field" aria-label="순서 지정" value={pickId} onChange={(e) => setPickId(e.target.value)} style={{ minHeight: 64, fontSize: 20 }}>
                  <option value="">순서 지정…</option>
                  {selectable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button className="btn white" type="button" disabled={busy || !pickId} style={{ flex: "0 0 auto", minWidth: 120 }} onClick={() => { act("open", pickId); setPickId(""); }}>이 사람</button>
              </div>
            )}
            {flow.rounds.length > 0 && (
              <button className={`btn ${remaining > 0 ? "white" : "blue"}`} type="button" disabled={busy}
                onClick={() => (remaining === 0 || window.confirm(`아직 열지 않은 소개가 ${remaining}개 있어요. 저예요를 시작하면 더 열 수 없어요. 시작할까요?`)) && act("reveal")}>
                “저예요” 시작 ›
              </button>
            )}
          </>
        )}
        {guessing && (
          <>
            <button className="btn white" type="button" disabled={busy || r!.guessJoined > 0} onClick={() => act("back")}>‹ 이 소개 취소</button>
            <button className="btn red" type="button" disabled={busy}
              onClick={() => (r!.guessJoined >= r!.guessEligible || window.confirm(`아직 고르지 않은 분이 ${r!.guessEligible - r!.guessJoined}명 있어요. 마감할까요?`)) && act("gclose")}>맞히기 마감</button>
          </>
        )}
        {revealing && (
          <>
            <button className="btn white" type="button" disabled={busy} onClick={() => act("back")}>‹ 이전</button>
            <button className="btn" type="button" disabled={busy} onClick={() => act("name")}>이름 공개 (대신)</button>
          </>
        )}
        {flow.phase === "reveal" && !revealing && (
          leftGuessed > 0
            ? <button className="btn" type="button" disabled={busy} onClick={() => act("reveal")}>다음 “저예요” ›</button>
            : <button className="btn blue" type="button" disabled={busy} onClick={() => act("vote")}>진실과 거짓 시작 ›</button>
        )}
        {voting && (
          <>
            <button className="btn white" type="button" disabled={busy || r!.votes.voted > 0} onClick={() => act("back")}>‹ 이전</button>
            <button className="btn red" type="button" disabled={busy}
              onClick={() => (r!.votes.voted >= r!.votes.eligible || window.confirm(`아직 투표하지 않은 분이 ${r!.votes.eligible - r!.votes.voted}명 있어요. 마감하고 결과를 발표할까요?`)) && act("answer")}>마감하고 결과 발표</button>
          </>
        )}
        {(flow.phase === "tl" || flow.phase === "done") && !voting && (
          leftNamed > 0
            ? <button className="btn" type="button" disabled={busy} onClick={() => act("vote")}>{count("answer") ? "다음 사람 진실과 거짓 ›" : "첫 사람 진실과 거짓 ›"}</button>
            : flow.hasAwards && <button className="btn blue" type="button" disabled={busy} onClick={() => act("awards")}>시상 발표 ›</button>
        )}
      </div>
    </>
  );
}

function Stepper({ now }: { now: string }) {
  const idx = PHASES.findIndex((p) => p.key === now);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="진행 단계">
      {PHASES.map((p, i) => (
        <span key={p.key} className="hostcard" aria-current={i === idx ? "step" : undefined}
          style={{ padding: "6px 14px", fontWeight: i === idx ? 800 : 500, opacity: i > idx ? 0.5 : 1, ...(i === idx ? { borderColor: "#7ee2a8", color: "#7ee2a8" } : {}) }}>
          {p.label}{i < idx ? " ✓" : ""}
        </span>
      ))}
    </div>
  );
}

/* ───── 시상 발표: 조별 추측왕·직감왕(동점이면 동점자만으로 룰렛) ───── */
type Side = { top: { memberId: string; name: string; score: number }[]; topScore: number; tied: { id: string; name: string }[]; needsRoulette: boolean; lottery: null | { winnerId: string; winnerName: string } };

function Awards({ id, aid, q, setError }: { id: string; aid: string; q: string; setError: (e: string) => void }) {
  const [sc, setSc] = useState<{ played: number; A: Side; B: Side } | null>(null);
  const [spin, setSpin] = useState<{ cat: "A" | "B"; shown: string } | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ played: number; A: Side; B: Side }>(`/api/admin/events/${id}/activities/${aid}/scores${q}`);
    if (r.ok) setSc(r.data);
    else setError(r.error);
  }, [id, aid, q, setError]);
  useEffect(() => { load(); }, [load]);

  async function roulette(cat: "A" | "B", redo = false) {
    const r = await api<{ tied: { id: string; name: string }[]; winnerName: string }>(`/api/admin/events/${id}/activities/${aid}/scores${q}`, { body: { category: cat, redo } });
    if (!r.ok) return setError(r.error);
    const names = r.data.tied.map((x) => x.name);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return load();
    let i = 0;
    const steps = 28;
    const run = (n: number) => {
      if (n >= steps) { setSpin(null); playSfx("tada"); load(); return; }
      playSfx("tick");
      setSpin({ cat, shown: n === steps - 1 ? r.data.winnerName : names[i++ % names.length] });
      setTimeout(() => run(n + 1), 80 + n * 14);
    };
    run(0);
  }

  if (!sc) return <p className="sub">불러오는 중이에요…</p>;
  const card = (cat: "A" | "B", title: string, what: string, unit: string, s: Side) => {
    const winner = s.topScore === 0 ? "" : !s.needsRoulette ? s.top[0]?.name ?? "" : s.lottery?.winnerName ?? "";
    return (
      <div className="panel" style={{ alignItems: "center", textAlign: "center" }}>
        <span className="sub">{what}</span>
        <h2 style={{ fontSize: 40, margin: 0 }}>{title}</h2>
        {s.topScore === 0 ? (
          <span className="sub">아직 맞힌 분이 없어요.</span>
        ) : spin?.cat === cat ? (
          <div className="roulette spin" aria-live="polite">{spin.shown}</div>
        ) : winner ? (
          <>
            <div style={{ fontSize: 64, lineHeight: 1.1 }} aria-hidden="true">🏆</div>
            <div className="namebox on" aria-live="polite" style={{ fontSize: 52 }}>{winner}</div>
            <span className="sub num">{s.topScore}{unit} 맞혔어요</span>
          </>
        ) : (
          <>
            <span className="sub">{s.topScore}{unit}로 동점 {s.tied.length}명: {s.tied.map((x) => x.name).join(", ")}</span>
            <div className="roulette" aria-live="polite">룰렛을 돌려 주세요</div>
          </>
        )}
        {s.needsRoulette && spin === null && (
          s.lottery
            ? <button className="btn white" type="button" onClick={() => roulette(cat, true)}>동점자 룰렛 다시 돌리기</button>
            : <button className="btn" type="button" onClick={() => roulette(cat)}>동점자 룰렛 돌리기</button>
        )}
        <details style={{ alignSelf: "stretch", textAlign: "left" }}>
          <summary className="sub" style={{ cursor: "pointer" }}>순위 보기</summary>
          {s.top.map((x, i) => (
            <div key={x.memberId} style={{ display: "flex", justifyContent: "space-between" }}><span>{i + 1}. {x.name}</span><span className="num">{x.score}{unit}</span></div>
          ))}
        </details>
      </div>
    );
  };
  return (
    <div className="stage even">
      {card("A", "추측왕", "누구인지 가장 많이 맞힌 사람", "명", sc.A)}
      {card("B", "직감왕", "거짓을 가장 많이 맞힌 사람", "개", sc.B)}
    </div>
  );
}
