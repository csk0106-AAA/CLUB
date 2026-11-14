"use client";

import { useState } from "react";
import { fmtSize, isClosed, type FeeData, type FileMeta, type MinutesData, type PollData, type QuizData, type SurveyData } from "@/lib/board";
import { api, fmtDate, fmtDateTime, won } from "@/lib/client";
import { agendaTone } from "./FormFields";
import { fileUrl, type PostDetail } from "./types";

const col = { display: "flex", flexDirection: "column", gap: 10 } as const;
const Err = ({ text }: { text: string }) => (text ? <div className="msg bad" role="alert">{text}</div> : null);

// 결과 막대
function Bar({ label, n, total, mine }: { label: string; n: number; total: number; mine?: boolean }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{label}{mine ? " ✓" : ""}</span>
        <span className="small num" style={{ flex: "none" }}>{n}명 · {pct}%</span>
      </div>
      <div role="img" aria-label={`${label} ${n}명 ${pct}%`} style={{ height: 12, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: mine ? "var(--blue)" : "var(--blue-t)", opacity: mine ? 1 : 0.55 }} />
      </div>
    </div>
  );
}

export function Attachments({ files }: { files: FileMeta[] }) {
  const images = files.filter((f) => f.image);
  const docs = files.filter((f) => !f.image);
  if (!files.length) return null;
  return (
    <>
      {images.map((f) => (
        <a key={f.id} href={fileUrl(f.id)} target="_blank" rel="noopener" aria-label={`${f.name} 크게 보기`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(f.id)} alt={f.name} loading="lazy" style={{ display: "block", maxWidth: "100%", borderRadius: 14, border: "2px solid var(--line)" }} />
        </a>
      ))}
      {docs.length > 0 && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <b>첨부 파일 {docs.length}개</b>
          {docs.map((f) => (
            <a key={f.id} href={fileUrl(f.id)} download={f.name} style={{ color: "var(--blue-t)", fontWeight: 700, overflowWrap: "anywhere" }}>
              📎 {f.name} <span className="small">({fmtSize(f.size)})</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

/* ───── 회칙 ───── */
export function RulesView({ rules }: { rules: NonNullable<PostDetail["rules"]> }) {
  if (rules.length === 0) return <div className="msg info">확정된 회칙이 아직 없어요.</div>;
  const chapters: [string, typeof rules][] = [];
  for (const r of rules) {
    const last = chapters[chapters.length - 1];
    if (last && last[0] === r.chapter) last[1].push(r);
    else chapters.push([r.chapter, [r]]);
  }
  return (
    <>
      {chapters.map(([ch, list]) => (
        <section key={ch} className="card" aria-label={ch} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: "400 19px var(--display)" }}>{ch}</b>
          {list.map((r) => (
            <div key={r.id}>
              {r.article && <b>{r.article}</b>}
              <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{r.body}</p>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

/* ───── 연회비 ───── */
export function FeeView({ data, myFee, full }: { data: FeeData; myFee: NonNullable<PostDetail["myFee"]>; full: boolean }) {
  const [copied, setCopied] = useState(false);
  const has = Number(myFee.amount) > 0;
  const who = [myFee.kind, myFee.position].filter(Boolean).join(" · ");
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* 길게 눌러 복사 */ }
  }
  return (
    <>
      <div className="card center">
        <span className="small">내 연회비{who ? ` (${who})` : ""}</span>
        <div className="title num" style={{ fontSize: 36 }}>{has ? won(myFee.amount) : "없어요"}</div>
      </div>
      {has && (
        <div className="card">
          <span className="small">입금 계좌</span>
          <div className="num" style={{ font: "700 19px var(--body)", overflowWrap: "anywhere" }}>{data.account || "계좌가 정해지면 알려 드려요"}</div>
          <div className="small">{data.accountHolder ? `예금주 ${data.accountHolder} · ` : ""}입금자명은 본인 이름으로 보내 주세요.</div>
          {data.account && <button className="mini" type="button" style={{ marginTop: 8 }} onClick={copy}>{copied ? "복사했어요 ✓" : "계좌번호 복사"}</button>}
        </div>
      )}
      {has && data.deadline && <div className="card"><span className="small">납부기한</span><div style={{ font: "700 19px var(--body)" }}>{fmtDate(data.deadline)}까지</div></div>}
      {full && (
        <details className="card">
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>전체 금액표 (작성자·관리자만 보여요)</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>기본: {data.defaultAmount ? won(data.defaultAmount) : "없음"}</li>
            {(data.rules ?? []).map((r, i) => <li key={i}>{[r.kind, r.position].filter(Boolean).join(" · ") || "전체"}: {won(r.amount)}</li>)}
          </ul>
        </details>
      )}
    </>
  );
}

/* ───── 회의록 ───── */
export function MinutesView({ data, labels }: { data: MinutesData; labels: Record<string, string> }) {
  const rows: [string, string][] = [["일시", fmtDateTime(data.heldAt ?? "")], ["장소", data.place ?? ""], ["참석자", data.attendees ?? ""]];
  return (
    <>
      <dl className="card" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px" }}>
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}><dt className="small" style={{ fontWeight: 700 }}>{k}</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{v}</dd></div>
        ))}
      </dl>
      {(data.agenda ?? []).filter((a) => a.title || a.note).map((a, i) => (
        <section key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b>안건 {i + 1}. {a.title}</b><span className={`pill ${agendaTone(a.status)}`}>{labels[a.status] || a.status}</span></div>
          {a.note && <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{a.note}</p>}
        </section>
      ))}
      {data.followUp && <div className="card"><b>후속 조치</b><p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{data.followUp}</p></div>}
    </>
  );
}

/* ───── 투표 ───── */
type PollResults = { counts: number[]; total: number; voters: { name: string; choices: number[] }[] | null } | null;
export function PollBox({ id, data, mine, results, onDone }: { id: string; data: PollData; mine: { choices: number[] } | null; results: PollResults; onDone: () => void }) {
  const closed = isClosed(data.deadline ?? "");
  const [pick, setPick] = useState<number[]>(mine?.choices ?? []);
  const [again, setAgain] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const voting = !closed && (!mine || again);
  const toggle = (i: number) => setPick((p) => (data.multi ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i]));
  async function vote() {
    setBusy(true);
    setErr("");
    const r = await api(`/api/board/${id}/respond`, { body: { choices: pick } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setAgain(false);
    onDone();
  }
  return (
    <section className="card" aria-label="투표" style={col}>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <b style={{ font: "400 19px var(--display)" }}>투표</b>
        <span className="pill gray">{data.multi ? "여러 개 고르기" : "하나만 고르기"}</span>
        {data.anonymous && <span className="pill gray">익명</span>}
        {data.deadline && <span className={`pill ${closed ? "bad" : "warn"}`}>{closed ? "마감됨" : `${fmtDateTime(data.deadline)} 마감`}</span>}
      </div>
      {voting ? (
        <>
          <div className="pick" role={data.multi ? "group" : "radiogroup"} aria-label="투표 보기">
            {data.options.map((o, i) => (
              <button key={i} type="button" className="opt rowopt" role={data.multi ? "checkbox" : "radio"} aria-checked={pick.includes(i)} aria-pressed={pick.includes(i)} onClick={() => toggle(i)} style={{ minHeight: 50 }}>
                <span className="tick" aria-hidden="true" />
                <span className="grow">{o}</span>
              </button>
            ))}
          </div>
          <Err text={err} />
          <div className="row">
            <button className="btn" type="button" disabled={busy || pick.length === 0} onClick={vote}>{busy ? "보내는 중…" : mine ? "다시 투표하기" : "투표하기"}</button>
            {again && <button className="btn white" type="button" onClick={() => { setAgain(false); setPick(mine?.choices ?? []); }}>취소</button>}
          </div>
        </>
      ) : null}
      {results && !voting && (
        <>
          {results.counts.map((n, i) => <Bar key={i} label={data.options[i] ?? `보기 ${i + 1}`} n={n} total={results.total} mine={mine?.choices.includes(i)} />)}
          <span className="small">{results.total}명이 투표했어요.{data.multi ? " (여러 개를 고를 수 있어서 합이 100%를 넘을 수 있어요)" : ""}</span>
          {results.voters && results.voters.length > 0 && (
            <details>
              <summary className="small" style={{ cursor: "pointer" }}>누가 무엇을 골랐나요 (작성자·관리자만)</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {results.voters.map((v, i) => <li key={i} className="small">{v.name}: {v.choices.map((c) => data.options[c]).join(", ")}</li>)}
              </ul>
            </details>
          )}
          {mine && !closed && <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setAgain(true)}>다시 고르기</button>}
        </>
      )}
      {!voting && !results && closed && <span className="small">마감된 투표예요.</span>}
    </section>
  );
}

/* ───── 설문 ───── */
type SurveyResults = {
  total: number;
  questions: { id: string; counts: number[] | null; texts: { name: string; text: string }[] | null }[];
  people: { name: string; at: string; answers: Record<string, string | number[]> }[];
} | null;
export function SurveyBox({ id, data, mine, results, onDone }: { id: string; data: SurveyData; mine: { answers: Record<string, string | number[]> } | null; results: SurveyResults; onDone: () => void }) {
  const closed = isClosed(data.deadline ?? "");
  const [ans, setAns] = useState<Record<string, string | number[]>>(mine?.answers ?? {});
  const [edit, setEdit] = useState(!mine);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const show = (q: SurveyData["questions"][number], a: string | number[] | undefined) =>
    q.type === "text" ? String(a ?? "") || "(빈칸)" : Array.isArray(a) ? a.map((i) => q.options[i]).join(", ") : "";
  async function send() {
    setBusy(true);
    setErr("");
    const r = await api(`/api/board/${id}/respond`, { body: { answers: ans } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setEdit(false);
    onDone();
  }
  return (
    <>
      <section className="card" aria-label="설문" style={col}>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <b style={{ font: "400 19px var(--display)" }}>{mine && !edit ? "내 답" : "설문"}</b>
          {data.deadline && <span className={`pill ${closed ? "bad" : "warn"}`}>{closed ? "마감됨" : `${fmtDateTime(data.deadline)} 마감`}</span>}
          {mine && <span className="pill ok">답했어요 ✓</span>}
        </div>
        {data.questions.map((q, qi) => {
          const a = ans[q.id];
          const arr = Array.isArray(a) ? a : [];
          if (!edit || closed) {
            return <div key={q.id}><b>{qi + 1}. {q.q}</b><p style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{mine ? show(q, mine.answers[q.id]) : "—"}</p></div>;
          }
          return (
            <fieldset key={q.id} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <legend style={{ fontWeight: 700, marginBottom: 6 }}>{qi + 1}. {q.q}{q.type === "multi" ? " (여러 개 고를 수 있어요)" : ""}</legend>
              {q.type === "text" ? (
                <textarea className="field" rows={3} maxLength={1000} style={{ padding: 10 }} aria-label={q.q} value={typeof a === "string" ? a : ""} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })} />
              ) : (
                <div className="pick">
                  {q.options.map((o, i) => (
                    <button key={i} type="button" className="opt rowopt" style={{ minHeight: 48 }} role={q.type === "multi" ? "checkbox" : "radio"} aria-checked={arr.includes(i)} aria-pressed={arr.includes(i)}
                      onClick={() => setAns({ ...ans, [q.id]: q.type === "multi" ? (arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i]) : [i] })}>
                      <span className="tick" aria-hidden="true" /><span className="grow">{o}</span>
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
        <Err text={err} />
        {edit && !closed && <button className="btn" type="button" disabled={busy} onClick={send}>{busy ? "보내는 중…" : mine ? "답 고치기" : "답 보내기"}</button>}
        {!edit && !closed && <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setEdit(true)}>답 고치기</button>}
        {closed && !mine && <span className="small">마감된 설문이에요.</span>}
      </section>
      {results && (
        <section className="card" aria-label="설문 결과" style={col}>
          <b style={{ font: "400 19px var(--display)" }}>결과 · {results.total}명 응답 (작성자·관리자만)</b>
          {data.questions.map((q, qi) => {
            const r = results.questions.find((x) => x.id === q.id);
            return (
              <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <b>{qi + 1}. {q.q}</b>
                {r?.counts && r.counts.map((n, i) => <Bar key={i} label={q.options[i]} n={n} total={results.total} />)}
                {r?.texts && (r.texts.length ? <ul style={{ margin: 0, paddingLeft: 20 }}>{r.texts.map((x, i) => <li key={i} style={{ whiteSpace: "pre-wrap" }}><span className="small">{x.name}:</span> {x.text}</li>)}</ul> : <span className="small">아직 답이 없어요.</span>)}
              </div>
            );
          })}
          {results.people.length > 0 && (
            <details>
              <summary className="small" style={{ cursor: "pointer" }}>사람별 답 보기</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {results.people.map((p, i) => (
                  <div key={i} className="card" style={{ background: "var(--soft)" }}>
                    <b>{p.name}</b> <span className="small">{fmtDateTime(p.at)}</span>
                    {data.questions.map((q, qi) => <div key={q.id} className="small">{qi + 1}. {show(q, p.answers[q.id])}</div>)}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
    </>
  );
}

/* ───── 퀴즈 (OX) ───── */
type QuizResults = { total: number; items: number; avg: number; perItem: number[]; people: { name: string; score: number }[] } | null;
export function QuizBox({ id, data, mine, results, onDone }: { id: string; data: QuizData; mine: { answers: ("O" | "X")[] } | null; results: QuizResults; onDone: () => void }) {
  const [ans, setAns] = useState<("O" | "X" | "")[]>(() => data.items.map(() => ""));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    setErr("");
    const r = await api(`/api/board/${id}/respond`, { body: { answers: ans } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onDone();
  }
  const score = mine ? data.items.filter((it, i) => mine.answers[i] === it.answer).length : 0;
  return (
    <>
      <section className="card" aria-label="OX 퀴즈" style={col}>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <b style={{ font: "400 19px var(--display)" }}>OX 퀴즈</b>
          {mine && <span className="pill ok">{data.items.length}문제 중 {score}개 맞혔어요</span>}
        </div>
        {data.items.map((it, i) => {
          const my = mine?.answers[i];
          const right = mine ? my === it.answer : false;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: i ? "2px solid var(--line)" : 0, paddingTop: i ? 10 : 0 }}>
              <b>{i + 1}. {it.q}</b>
              {mine ? (
                <>
                  <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                    <span className={`pill ${right ? "ok" : "bad"}`}>{right ? "정답 ✓" : "오답"}</span>
                    <span className="small">내 답 {my} · 정답 {it.answer}</span>
                  </div>
                  {it.explain && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{it.explain}</p>}
                </>
              ) : (
                <div className="row" role="radiogroup" aria-label={`${i + 1}번 문제 답`}>
                  {(["O", "X"] as const).map((v) => (
                    <button key={v} type="button" className="opt" role="radio" aria-checked={ans[i] === v} aria-pressed={ans[i] === v}
                      style={{ alignItems: "center", minHeight: 56, font: "400 28px var(--display)" }} onClick={() => setAns(ans.map((x, j) => (j === i ? v : x)))}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <Err text={err} />
        {!mine && <button className="btn" type="button" disabled={busy || ans.some((a) => !a)} onClick={send}>{busy ? "채점하는 중…" : "답 내고 채점하기"}</button>}
        {!mine && <span className="hint">한 번만 풀 수 있어요.</span>}
      </section>
      {results && (
        <section className="card" aria-label="퀴즈 결과" style={col}>
          <b style={{ font: "400 19px var(--display)" }}>점수 요약 (작성자·관리자만)</b>
          <span>{results.total}명이 풀었어요 · 평균 {results.avg}점 / {results.items}점</span>
          {results.perItem.map((n, i) => <Bar key={i} label={`${i + 1}번 정답`} n={n} total={results.total} />)}
          {results.people.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20 }}>{results.people.map((p, i) => <li key={i} className="small">{p.name}: {p.score}/{results.items}</li>)}</ul>
          )}
        </section>
      )}
    </>
  );
}
