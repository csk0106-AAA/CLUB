"use client";

import { useState } from "react";
import { RowDelete } from "../RowDelete";
import { LADDER_MAX, LADDER_ROWS, ladderPath, type LadderData } from "@/lib/board";
import { fs } from "@/lib/fs";

const col = { display: "flex", flexDirection: "column", gap: 10 } as const;

/* ───── 글쓰기: 참가자 · 결과 짝으로 넣기 ───── */
export function LadderFields({ data, onChange }: { data: LadderData; onChange: (d: LadderData) => void }) {
  const players = data.players ?? [];
  const results = data.results ?? [];
  const n = Math.max(players.length, results.length);
  const rows = [...Array(n).keys()];
  const pick = (k: "players" | "results", j: number) => (k === "players" ? players : results)[j] ?? "";
  const setRow = (i: number, k: "players" | "results", v: string) => onChange({ ...data, [k]: rows.map((j) => (j === i ? v : pick(k, j))) });
  // 인원이 바뀌면 가로줄을 비운다(저장할 때 서버가 새로 만든다)
  const add = () => onChange({ players: [...rows.map((j) => pick("players", j)), ""], results: [...rows.map((j) => pick("results", j)), ""], rungs: [] });
  const del = (i: number) => onChange({ players: rows.filter((j) => j !== i).map((j) => pick("players", j)), results: rows.filter((j) => j !== i).map((j) => pick("results", j)), rungs: [] });
  const has = (data.rungs ?? []).length > 0;
  return (
    <section className="card" aria-label="사다리" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>사다리</b>
      <span className="small">왼쪽에 참가자, 오른쪽에 결과(당첨·벌칙·순서 등)를 넣어 주세요. 가로줄은 저장할 때 무작위로 만들어져서, 누가 어떤 결과가 될지는 작성자도 몰라요.</span>
      <div style={{ ...col, gap: 6 }}>
        {rows.map((i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            <span className="num small" style={{ width: 18, textAlign: "right", flex: "none" }}>{i + 1}</span>
            <input className="field" style={{ minHeight: 44, flex: 1, minWidth: 0 }} aria-label={`참가자 ${i + 1}`} placeholder="참가자" maxLength={20} value={players[i] ?? ""} onChange={(e) => setRow(i, "players", e.target.value)} />
            <input className="field" style={{ minHeight: 44, flex: 1, minWidth: 0 }} aria-label={`결과 ${i + 1}`} placeholder="결과" maxLength={30} value={results[i] ?? ""} onChange={(e) => setRow(i, "results", e.target.value)} />
            <RowDelete label={`${i + 1}번 줄 지우기`} disabled={n <= 2} onClick={() => del(i)} />
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {n < LADDER_MAX && <button className="mini" type="button" onClick={add}>+ 참가자 추가</button>}
        {has && <button className="mini" type="button" onClick={() => onChange({ ...data, rungs: [] })}>사다리 다시 섞기</button>}
      </div>
      <span className="hint">{has ? "지금 사다리를 그대로 둬요. “사다리 다시 섞기”를 누르고 저장하면 가로줄이 새로 만들어져요." : "저장하면 사다리가 만들어져요."} 참가자는 {LADDER_MAX}명까지예요.</span>
    </section>
  );
}

/* ───── 글 보기: 이름을 누르면 사다리를 타고 내려가 결과가 보인다(이 화면에서만, 저장하지 않음) ───── */
const COL_W = 64;
const ROW_H = 26;
const TOP = 8;
export function LadderBox({ data }: { data: LadderData }) {
  const n = data.players.length;
  const rungs = (data.rungs ?? []) as [number, number][];
  const [done, setDone] = useState<number[]>([]); // 탄 순서
  const [run, setRun] = useState(0); // 애니메이션 다시 그리기
  const cur = done[done.length - 1];
  const W = n * COL_W;
  const H = TOP * 2 + (LADDER_ROWS + 1) * ROW_H;
  const x = (c: number) => c * COL_W + COL_W / 2;
  const y = (r: number) => (r < 0 ? TOP : r >= LADDER_ROWS ? H - TOP : TOP + (r + 1) * ROW_H);
  const ends = data.players.map((_, i) => ladderPath(rungs, i));
  const revealed = new Set(done.map((i) => ends[i].col));
  const go = (i: number) => {
    setDone((d) => [...d.filter((j) => j !== i), i]);
    setRun((r) => r + 1);
  };
  if (!rungs.length) return <div className="msg info">사다리를 만드는 중이에요. 잠시 뒤 새로 고쳐 주세요.</div>;
  return (
    <section className="card" aria-label="사다리 타기" style={col}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }} className="grow">사다리 타기</b>
        <button className="mini" type="button" onClick={() => { setDone(data.players.map((_, i) => i)); setRun((r) => r + 1); }}>전체 결과 보기</button>
        {done.length > 0 && <button className="mini" type="button" onClick={() => setDone([])}>처음으로</button>}
      </div>
      <span className="small">이름을 누르면 사다리를 타고 내려가요.</span>
      <div style={{ overflowX: "auto" }}>
        <div style={{ width: W, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, ${COL_W}px)` }}>
            {data.players.map((p, i) => (
              <button key={i} type="button" className={`ladder-name${done.includes(i) ? " on" : ""}${cur === i ? " cur" : ""}`} onClick={() => go(i)} aria-label={`${p} 사다리 타기`}>{p}</button>
            ))}
          </div>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: "block" }}>
            {data.players.map((_, i) => <line key={i} x1={x(i)} y1={TOP} x2={x(i)} y2={H - TOP} className="ladder-pole" />)}
            {rungs.map(([c, r], k) => <line key={k} x1={x(c)} y1={y(r)} x2={x(c + 1)} y2={y(r)} className="ladder-pole" />)}
            {done.map((i) => {
              const pts = ends[i].steps.map(([c, r]) => `${x(c)},${y(r)}`).join(" ");
              const last = i === cur;
              return <polyline key={`${i}-${last ? run : "d"}`} points={pts} pathLength={1} className={`ladder-path${last ? " cur" : ""}`} />;
            })}
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, ${COL_W}px)` }}>
            {data.results.map((r, c) => (
              <span key={c} className={`ladder-res${revealed.has(c) ? " on" : ""}`}>{revealed.has(c) ? r : "?"}</span>
            ))}
          </div>
        </div>
      </div>
      {done.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2, fontSize: fs(14) }} aria-live="polite">
          {done.map((i) => <li key={i}><b>{data.players[i]}</b> → {data.results[ends[i].col] ?? ""}</li>)}
        </ul>
      )}
    </section>
  );
}
