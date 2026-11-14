"use client";

import { useId } from "react";
import { DateField } from "@/components/DateField";
import { DragHandle, useDragSort } from "@/components/DragSort";
import { AGENDA_STATUS, DEFAULT_TEMPLATES, type FeeData, type Form, type MinutesData, type PollData, type QuizData, type SurveyData } from "@/lib/board";
import { won } from "@/lib/client";
import { fs } from "@/lib/fs";

// 양식별 입력칸(글쓰기 화면). data 는 Posts.data 와 같은 모양이다(lib/board.ts).
type Data = Record<string, unknown>;
type P<T> = { data: T; onChange: (d: T) => void };

const col = { display: "flex", flexDirection: "column", gap: 10 } as const;
const sel = { minHeight: 44, padding: "0 8px" } as const;
const addBtn = { width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: fs(15) } as const;

function withDefaults<T>(form: Form, data: Data): T {
  return { ...(DEFAULT_TEMPLATES[form].data as object), ...data } as T;
}

export function FormFields({ form, data, onChange, kinds, positions, agendaLabels }: {
  form: Form;
  data: Data;
  onChange: (d: Data) => void;
  kinds: string[];
  positions: string[];
  agendaLabels: Record<string, string>;
}) {
  const set = (d: unknown) => onChange(d as Data);
  if (form === "fee") return <FeeFields data={withDefaults<FeeData>(form, data)} onChange={set} kinds={kinds} positions={positions} />;
  if (form === "minutes") return <MinutesFields data={withDefaults<MinutesData>(form, data)} onChange={set} labels={agendaLabels} />;
  if (form === "survey") return <SurveyFields data={withDefaults<SurveyData>(form, data)} onChange={set} />;
  if (form === "poll") return <PollFields data={withDefaults<PollData>(form, data)} onChange={set} />;
  if (form === "quiz") return <QuizFields data={withDefaults<QuizData>(form, data)} onChange={set} />;
  return null;
}

/* ───── 연회비 안내 ───── */
function FeeFields({ data, onChange, kinds, positions }: P<FeeData> & { kinds: string[]; positions: string[] }) {
  const id = useId();
  const rules = data.rules ?? [];
  const setRules = (r: FeeData["rules"]) => onChange({ ...data, rules: r });
  return (
    <section className="card" aria-label="연회비" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>연회비</b>
      <div className="msg info">기본 금액과 조건별 금액을 모두 비워 두면 관리자 › 회원관리 › 모임회비관리의 회비·계좌·납부 안내를 그대로 보여 줘요. 이 글에만 다른 금액을 쓰려면 아래에 적어 주세요.</div>
      <span className="small">기본 금액 위에 회원구분·직책별 금액을 줄로 더할 수 있어요. 회원에게 맞는 줄 중 <b>조건이 가장 많이 맞는 줄</b>의 금액을 쓰고, 맞는 줄이 없으면 기본 금액을 써요. 직책의 “일반회원”은 직책이 없는 회원이에요. 회원에게는 <b>본인 연회비만</b> 보여요.</span>
      <div>
        <label className="l" htmlFor={`${id}-def`}>기본 금액(원) — 비우면 연회비 없음</label>
        <input id={`${id}-def`} className="field" inputMode="numeric" value={data.defaultAmount} onChange={(e) => onChange({ ...data, defaultAmount: e.target.value.replace(/\D/g, "").slice(0, 9) })} />
        {data.defaultAmount && <span className="hint">{won(data.defaultAmount)}</span>}
      </div>
      {rules.length > 0 && (
        <div className="tblw">
          <table className="tbl" style={{ minWidth: 480 }}>
            <thead><tr><th>회원구분</th><th>직책</th><th>금액(원)</th><th><span className="sr-only">삭제</span></th></tr></thead>
            <tbody>
              {rules.map((r, i) => {
                const upd = (patch: Partial<FeeData["rules"][number]>) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <tr key={i}>
                    <td>
                      <select className="field" style={sel} aria-label={`${i + 1}번째 줄 회원구분`} value={r.kind} onChange={(e) => upd({ kind: e.target.value })}>
                        <option value="">전체</option>
                        {[...new Set([...kinds, ...(r.kind ? [r.kind] : [])])].map((k) => <option key={k}>{k}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="field" style={sel} aria-label={`${i + 1}번째 줄 직책`} value={r.position} onChange={(e) => upd({ position: e.target.value })}>
                        <option value="">전체</option>
                        {[...new Set([...positions, ...(r.position ? [r.position] : [])])].map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </td>
                    <td><input className="field" style={sel} inputMode="numeric" aria-label={`${i + 1}번째 줄 금액`} value={r.amount} onChange={(e) => upd({ amount: e.target.value.replace(/\D/g, "").slice(0, 9) })} /></td>
                    <td><button className="mini danger" type="button" aria-label={`${i + 1}번째 줄 삭제`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>삭제</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn white" type="button" style={addBtn} onClick={() => setRules([...rules, { kind: "", position: "", amount: "" }])}>+ 조건별 금액 줄 추가</button>
      {rules.some((r) => !r.amount) && <span className="small" style={{ color: "var(--red-t)" }}>금액이 빈 줄이 있어요. 금액을 넣거나 줄을 삭제해 주세요.</span>}
      <div className="grid2">
        <div><label className="l" htmlFor={`${id}-dl`}>납부기한</label><DateField id={`${id}-dl`} mode="date" value={data.deadline} onChange={(v) => onChange({ ...data, deadline: v })} /></div>
        <div><label className="l" htmlFor={`${id}-acc`}>계좌</label><input id={`${id}-acc`} className="field" maxLength={100} placeholder="예: ○○은행 000-0000-0000" value={data.account} onChange={(e) => onChange({ ...data, account: e.target.value })} /></div>
        <div><label className="l" htmlFor={`${id}-hd`}>예금주</label><input id={`${id}-hd`} className="field" maxLength={40} value={data.accountHolder} onChange={(e) => onChange({ ...data, accountHolder: e.target.value })} /></div>
      </div>
    </section>
  );
}

/* ───── 회의록 ───── */
const statusTone = (s: string) => (s === "논의 전" || s === "보류·삭제" ? "gray" : s === "확정·실행완료" ? "ok" : s === "새로운 안건" ? "blue" : "warn");
export const agendaTone = statusTone;

function MinutesFields({ data, onChange, labels }: P<MinutesData> & { labels: Record<string, string> }) {
  const id = useId();
  const agenda = data.agenda ?? [];
  const setA = (i: number, patch: Partial<MinutesData["agenda"][number]>) => onChange({ ...data, agenda: agenda.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <section className="card" aria-label="회의록" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>회의 정보</b>
      <div className="grid2">
        <div><label className="l" htmlFor={`${id}-at`}>일시</label><DateField id={`${id}-at`} mode="datetime" value={data.heldAt} onChange={(v) => onChange({ ...data, heldAt: v })} /></div>
        <div><label className="l" htmlFor={`${id}-pl`}>장소</label><input id={`${id}-pl`} className="field" maxLength={100} value={data.place} onChange={(e) => onChange({ ...data, place: e.target.value })} /></div>
      </div>
      <div><label className="l" htmlFor={`${id}-who`}>참석자</label><textarea id={`${id}-who`} className="field" rows={2} maxLength={1000} style={{ padding: 10 }} value={data.attendees} onChange={(e) => onChange({ ...data, attendees: e.target.value })} /></div>
      <b>안건과 내용</b>
      {agenda.map((a, i) => (
        <div key={i} className="card" style={{ ...col, gap: 8, background: "var(--soft)" }}>
          <div className="row">
            <input aria-label={`${i + 1}번째 안건`} className="field" placeholder="안건" maxLength={200} value={a.title} onChange={(e) => setA(i, { title: e.target.value })} />
            <button className="mini danger" type="button" style={{ minHeight: 46 }} aria-label={`${i + 1}번째 안건 지우기`} onClick={() => onChange({ ...data, agenda: agenda.filter((_, j) => j !== i) })}>지우기</button>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="l" style={{ margin: 0 }} htmlFor={`${id}-st-${i}`}>상태</label>
            <select id={`${id}-st-${i}`} className="field" style={{ ...sel, width: 180 }} value={a.status} onChange={(e) => setA(i, { status: e.target.value as MinutesData["agenda"][number]["status"] })}>
              {AGENDA_STATUS.map((s) => <option key={s} value={s}>{labels[s] || s}</option>)}
            </select>
            <span className={`pill ${statusTone(a.status)}`}>{labels[a.status] || a.status}</span>
          </div>
          <textarea aria-label={`${i + 1}번째 안건 내용`} className="field" rows={3} maxLength={4000} style={{ padding: 10 }} placeholder="논의한 내용" value={a.note} onChange={(e) => setA(i, { note: e.target.value })} />
        </div>
      ))}
      <button className="btn white" type="button" style={addBtn} onClick={() => onChange({ ...data, agenda: [...agenda, { title: "", status: "논의 전", note: "" }] })}>+ 안건 추가</button>
      <div><label className="l" htmlFor={`${id}-fu`}>후속 조치</label><textarea id={`${id}-fu`} className="field" rows={3} maxLength={2000} style={{ padding: 10 }} value={data.followUp} onChange={(e) => onChange({ ...data, followUp: e.target.value })} /></div>
    </section>
  );
}

/* ───── 마감 ───── */
function Deadline({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const id = useId();
  return (
    <div>
      <label className="l" htmlFor={id}>{label} (선택)</label>
      <div className="row">
        <div className="grow"><DateField id={id} mode="datetime" value={value} onChange={onChange} /></div>
        {value && <button className="mini" type="button" onClick={() => onChange("")}>마감 없애기</button>}
      </div>
    </div>
  );
}

/* ───── 보기 목록 ───── */
function Options({ list, onChange, label }: { list: string[]; onChange: (l: string[]) => void; label: string }) {
  return (
    <div style={{ ...col, gap: 6 }}>
      {list.map((o, i) => (
        <div key={i} className="row">
          <input className="field" style={{ minHeight: 44 }} aria-label={`${label} ${i + 1}`} placeholder={`보기 ${i + 1}`} maxLength={100} value={o} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="mini danger" type="button" aria-label={`${label} ${i + 1} 지우기`} disabled={list.length <= 2} onClick={() => onChange(list.filter((_, j) => j !== i))}>지우기</button>
        </div>
      ))}
      {list.length < 20 && <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...list, ""])}>+ 보기 추가</button>}
    </div>
  );
}

/* ───── 설문 ───── */
const Q_TYPES = [{ k: "single", l: "하나 고르기" }, { k: "multi", l: "여러 개 고르기" }, { k: "text", l: "주관식" }] as const;

function SurveyFields({ data, onChange }: P<SurveyData>) {
  const qs = data.questions ?? [];
  const setQ = (i: number, patch: Partial<SurveyData["questions"][number]>) => onChange({ ...data, questions: qs.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const ds = useDragSort(qs, (next) => onChange({ ...data, questions: next }));
  return (
    <section className="card" aria-label="설문 질문" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>설문 질문</b>
      {qs.length > 1 && <span className="small">⠿ 손잡이를 끌어서 질문 순서를 바꿔요.</span>}
      {qs.map((q, i) => {
        const row = ds.item(i);
        return (
        <div key={q.id} ref={row.ref} className="card" style={{ ...col, gap: 8, background: "var(--soft)", ...row.style }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <DragHandle {...ds.handle(i, `질문 ${i + 1}`)} />
            <b>질문 {i + 1}</b>
            <span className="grow" />
            <button className="mini danger" type="button" disabled={qs.length <= 1} onClick={() => onChange({ ...data, questions: qs.filter((_, j) => j !== i) })}>질문 지우기</button>
          </div>
          <input className="field" aria-label={`질문 ${i + 1} 내용`} placeholder="질문" maxLength={300} value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} />
          <div className="checks" role="radiogroup" aria-label={`질문 ${i + 1} 답 방식`}>
            {Q_TYPES.map((t) => (
              <label key={t.k}>
                <input type="radio" name={`qt-${q.id}`} checked={q.type === t.k} onChange={() => setQ(i, { type: t.k, options: t.k === "text" ? [] : q.options.length >= 2 ? q.options : ["", ""] })} />
                {t.l}
              </label>
            ))}
          </div>
          {q.type !== "text" && <Options label={`질문 ${i + 1} 보기`} list={q.options} onChange={(o) => setQ(i, { options: o })} />}
        </div>
        );
      })}
      {qs.length < 30 && (
        <button className="btn white" type="button" style={addBtn} onClick={() => onChange({ ...data, questions: [...qs, { id: `q${Date.now().toString(36)}`, type: "single", q: "", options: ["", ""] }] })}>+ 질문 추가</button>
      )}
      <Deadline label="마감 일시" value={data.deadline} onChange={(v) => onChange({ ...data, deadline: v })} />
      <span className="hint">마감 전까지는 회원이 답을 고칠 수 있어요. 결과는 작성자와 관리자만 볼 수 있어요.</span>
    </section>
  );
}

/* ───── 투표 ───── */
function PollFields({ data, onChange }: P<PollData>) {
  return (
    <section className="card" aria-label="투표" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>투표 보기</b>
      <Options label="투표 보기" list={data.options ?? []} onChange={(o) => onChange({ ...data, options: o })} />
      <div className="checks">
        <label><input type="radio" name="poll-multi" checked={!data.multi} onChange={() => onChange({ ...data, multi: false })} />하나만 고르기</label>
        <label><input type="radio" name="poll-multi" checked={data.multi} onChange={() => onChange({ ...data, multi: true })} />여러 개 고르기</label>
      </div>
      <div className="checks"><label><input type="checkbox" checked={data.anonymous} onChange={(e) => onChange({ ...data, anonymous: e.target.checked })} />익명 투표 (누가 골랐는지 아무도 볼 수 없어요)</label></div>
      <Deadline label="마감 일시" value={data.deadline} onChange={(v) => onChange({ ...data, deadline: v })} />
      <span className="hint">회원은 투표한 뒤에 결과를 볼 수 있어요. 마감 전까지는 다시 고를 수 있어요.</span>
    </section>
  );
}

/* ───── 퀴즈 (OX) ───── */
function QuizFields({ data, onChange }: P<QuizData>) {
  const items = data.items ?? [];
  const setI = (i: number, patch: Partial<QuizData["items"][number]>) => onChange({ ...data, items: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <section className="card" aria-label="OX 퀴즈 문제" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>OX 문제</b>
      {items.map((it, i) => (
        <div key={i} className="card" style={{ ...col, gap: 8, background: "var(--soft)" }}>
          <div className="row">
            <b>문제 {i + 1}</b>
            <span className="grow" />
            <button className="mini danger" type="button" disabled={items.length <= 1} onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })}>문제 지우기</button>
          </div>
          <input className="field" aria-label={`문제 ${i + 1}`} placeholder="문장 (예: 우리 원우회는 2020년에 만들어졌다)" maxLength={300} value={it.q} onChange={(e) => setI(i, { q: e.target.value })} />
          <div className="checks" role="radiogroup" aria-label={`문제 ${i + 1} 정답`}>
            <span className="l" style={{ margin: 0, alignSelf: "center" }}>정답</span>
            {(["O", "X"] as const).map((v) => (
              <label key={v}><input type="radio" name={`qa-${i}`} checked={it.answer === v} onChange={() => setI(i, { answer: v })} />{v}</label>
            ))}
          </div>
          <textarea className="field" rows={2} aria-label={`문제 ${i + 1} 해설`} placeholder="해설 (선택)" maxLength={1000} style={{ padding: 10 }} value={it.explain} onChange={(e) => setI(i, { explain: e.target.value })} />
        </div>
      ))}
      {items.length < 30 && <button className="btn white" type="button" style={addBtn} onClick={() => onChange({ ...data, items: [...items, { q: "", answer: "O", explain: "" }] })}>+ 문제 추가</button>}
      <span className="hint">회원은 한 번 풀 수 있고, 다 풀면 정답과 해설이 보여요.</span>
    </section>
  );
}
