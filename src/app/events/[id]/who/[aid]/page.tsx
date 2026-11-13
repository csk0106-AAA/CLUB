"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconMic } from "@/components/Icons";
import { LessonHeader } from "@/components/LessonHeader";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";
import { useVoice } from "@/lib/voice";

type Msg = { role: "ai" | "me"; text: string; scope?: "intro" | "truthlie" | "none" };
type State = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  pre: { status: string; opensAt: string; closesAt: string };
  guess: { status: string; opensAt: string; closesAt: string };
  aiEnabled: boolean;
  inActivity: boolean; // 이 활동의 참여 대상인지(아니면 프로필 북용 소개만 작성)
  participants: string;
  profile: { alias: string; draftMd: string; introMd: string; introStatus: string };
  interview: { messages: Msg[]; status: string; answered: number; required: number };
  truthLies: { statements: string[]; lieIndex: number; status: string };
};
type Target = { profileId: string; alias: string; introMd: string; myChoice: string };
type Cand = { id: string; name: string; trip: string };
type Note = { tone: "bad" | "info"; text: string } | null;

const WHEN: Record<string, string> = {
  before: "아직 작성 기간이 아니에요.",
  closed: "작성 기간이 끝났어요.",
  unknown: "행사 날짜가 정해지면 작성 기간이 열려요.",
  none: "이 활동에는 사전 작성이 없어요.",
};
// 사전 추측 후보 동그라미 색(돌아가며). 글자색은 globals.css .avatar 의 어두운 색이라 대비 4.5:1 이상.
const AVATAR = ["#1CB0F6", "#FF9600", "#CE82FF", "#FF4B4B", "#58CC02"];

export default function WhoPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [tab, setTab] = useState<"write" | "guess">("write");
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [guessProg, setGuessProg] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    const r = await api<State>(`/api/who/${aid}`);
    if (r.ok) setSt(r.data);
    else if (r.status === 401) router.replace("/");
    else setNote({ tone: "bad", text: r.error });
  }, [aid, router]);
  useEffect(() => {
    load();
  }, [load]);

  if (!st) {
    return (
      <main className="app">
        {note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>}
        <button className="btn white" type="button" onClick={() => router.push(`/events/${id}`)}>‹ 행사로 돌아가기</button>
      </main>
    );
  }

  // 위쪽 진행 막대: 작성 탭은 인터뷰 답변 수, 맞히기 탭은 고른 사람 수
  const iv = st.interview;
  const ivStarted = iv.messages.length > 0;
  const progress =
    tab === "guess" ? guessProg
    : ivStarted ? { done: iv.status === "done" ? Math.max(iv.answered, iv.required) : iv.answered, total: Math.max(1, iv.required) }
    : null;

  return (
    <main className="app">
      <LessonHeader href={`/events/${id}`} closeLabel="행사로 돌아가기" done={progress?.done} total={progress?.total} />
      <h1 className="title" style={{ fontSize: 24 }}>{st.activity.name}</h1>
      <div className="subnav" role="tablist" aria-label="내가 누굴까요? 메뉴" style={{ display: "flex", gap: 6 }}>
        <a href="#" role="tab" aria-selected={tab === "write"} className={tab === "write" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("write"); }}>내 소개 작성</a>
        <a href="#" role="tab" aria-selected={tab === "guess"} className={tab === "guess" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("guess"); }}>누구일까요?</a>
      </div>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      {tab === "write" ? (
        <Write st={st} aid={aid} busy={busy} setBusy={setBusy} setNote={setNote} reload={load} />
      ) : (
        <Guess aid={aid} setNote={setNote} onProgress={setGuessProg} />
      )}
    </main>
  );
}

/* ───────────── 내 소개 작성 ───────────── */
function Write(props: {
  st: State; aid: string; busy: boolean; setBusy: (b: boolean) => void; setNote: (n: Note) => void; reload: () => Promise<void>;
}) {
  const { st, aid, busy, setBusy, setNote, reload } = props;
  const open = st.pre.status === "open";
  const approved = st.profile.introStatus === "approved";
  const inAct = st.inActivity;

  const [alias, setAlias] = useState(st.profile.alias);
  const [intro, setIntro] = useState(st.profile.introStatus === "approved" ? st.profile.introMd : st.profile.draftMd);
  const [stmts, setStmts] = useState<string[]>(st.truthLies.statements);
  const [lie, setLie] = useState(st.truthLies.lieIndex);
  const [reviseText, setReviseText] = useState("");
  const [lastReq, setLastReq] = useState(""); // 마지막 수정 요청(말풍선으로 보여 줌)
  const [refusal, setRefusal] = useState(""); // 지침 때문에 반영하지 못한 이유
  const [answer, setAnswer] = useState("");
  const [editAlias, setEditAlias] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [st.interview.messages.length]);

  const voice = useVoice(() => answer, setAnswer);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  // 별칭 바꾸기: 소개 글 초안에 들어 있는 예전 별칭도 서버가 함께 바꿔 준다.
  const saveAlias = () => run(async () => {
    const r = await api<{ alias: string; draftMd: string }>(`/api/who/${aid}/alias`, { body: { alias } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    if (r.data.draftMd) setIntro(r.data.draftMd);
    setEditAlias(false);
    setNote({ tone: "info", text: `별칭을 “${r.data.alias}”(으)로 정했어요. 소개 글 속 별칭도 함께 바꿨어요.` });
    await reload();
  });

  const startInterview = () => run(async () => {
    const r = await api(`/api/who/${aid}/interview`, { body: {} });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    await reload();
  });

  const sendAnswer = () => run(async () => {
    if (voice.listening) voice.toggle();
    const r = await api(`/api/who/${aid}/interview`, { body: { answer } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setAnswer("");
    await reload();
  });

  const makeDraft = () => run(async () => {
    const r = await api<{ mode: string; draftMd: string; statements: string[]; lieIndex: number; leaked: string[]; remaining: string[] }>(`/api/who/${aid}/draft`, { body: {} });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setIntro(r.data.draftMd);
    setStmts(r.data.statements);
    setLie(r.data.lieIndex);
    setNote(
      r.data.mode === "manual"
        ? { tone: "info", text: "AI가 아직 연결되지 않아 내 답변을 모아 초안을 만들었어요. 별칭을 정하고 글을 다듬은 뒤, 2진실 1거짓 문장 3개를 적어 주세요." }
        : r.data.leaked?.length
          ? { tone: "bad", text: `소개 글에 2진실 1거짓 내용(${r.data.leaked.join(", ")})이 남아 있어요. 소개 글에서 지우거나 “다시 만들기”를 눌러 주세요.` }
          : { tone: "info", text: "별칭, 소개 글, 2진실 1거짓을 만들었어요. 2진실 1거짓 내용은 소개 글에 넣지 않았어요. 읽어 보고 고칠 부분을 알려 주세요." },
    );
    await reload();
  });

  const saveDraft = (silent = false) => run(async () => {
    const r = await api(`/api/who/${aid}/draft`, { method: "PUT", body: { introMd: intro, ...(inAct ? { statements: stmts, lieIndex: lie } : {}) } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    if (!silent) setNote({ tone: "info", text: "저장했어요. 승인하기 전에는 다른 회원에게 보이지 않아요." });
    await reload();
  });

  // 수정 요청. 빠른 버튼(더 짧게, 부드럽게)은 정해진 요청문을 그대로 보낸다.
  const revise = (request = reviseText) => run(async () => {
    const req = request.trim();
    if (!req) return;
    setLastReq(req);
    setRefusal("");
    const r = await api<{ introMd: string }>(`/api/who/${aid}/revise`, { body: { request: req, introMd: intro } });
    if (r.ok) {
      setIntro(r.data.introMd);
      if (request === reviseText) setReviseText("");
      return setNote({ tone: "info", text: "요청대로 고쳤어요. 마음에 들면 최종 배포를 눌러 주세요." });
    }
    if (r.status === 422) {
      // 서버 문구: "관리자 지침에 맞지 않아 반영할 수 없습니다. 이유: …" → 이유만 보여 준다.
      const reason = r.error.includes("이유:") ? r.error.split("이유:").slice(1).join("이유:").trim() : r.error;
      return setRefusal(/[.?!요다]$/.test(reason) ? reason : `${reason}.`);
    }
    setNote({ tone: "bad", text: r.error });
  });

  const approve = () => run(async () => {
    const r = await api(`/api/who/${aid}/approve`, { body: { introMd: intro, ...(inAct ? { statements: stmts, lieIndex: lie } : {}) } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: "배포했어요. 이제 다른 회원이 별칭으로 내 소개를 읽을 수 있어요." });
    await reload();
  });

  const unapprove = () => run(async () => {
    const r = await api(`/api/who/${aid}/approve`, { method: "DELETE" });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: "승인을 취소했어요. 다시 고치고 배포할 수 있어요." });
    await reload();
  });

  // 다시 만들기: 2진실 1거짓과 소개 글을 항상 함께 새로 만든다(둘이 겹치지 않게). 별칭은 그대로.
  const redo = () => {
    if (window.confirm(`인터뷰 답변으로 ${inAct ? "2진실 1거짓과 소개 글을" : "소개 글을"} 함께 다시 만들까요? 지금 고친 내용은 새로 만든 내용으로 바뀌어요. 별칭은 그대로예요.`)) makeDraft();
  };
  const tlEmpty = stmts.every((x) => !x.trim());

  if (!open) {
    return (
      <div className="msg info">
        {WHEN[st.pre.status] ?? ""}{st.pre.opensAt ? ` 작성 기간은 ${st.pre.opensAt} ~ ${st.pre.closesAt} 예요.` : ""}
        {approved && " 승인된 소개는 그대로 공개돼 있어요."}
      </div>
    );
  }

  const iv = st.interview;
  const hasAlias = Boolean(st.profile.alias);
  const interviewDone = iv.status === "done";
  const inInterview = !interviewDone && iv.messages.length > 0;
  const hasDraft = st.profile.introStatus === "draft" || approved || intro.trim().length > 0;

  return (
    <>
      {!inAct && (
        <div className="msg info" role="status">이 활동에는 참여하지 않아요(참여 대상으로 선택되지 않았어요). 프로필 북에 실릴 소개만 작성해요. 2진실 1거짓은 필요 없어요.</div>
      )}
      {!st.aiEnabled && (
        <div className="msg info" role="status">AI가 아직 연결되지 않아 정해진 질문으로 진행해요. 소개 글은 내 답변을 모아 초안을 만들고 직접 다듬어요.</div>
      )}

      {/* 1. 인터뷰 (별칭은 인터뷰가 끝난 뒤 AI가 소개 글과 함께 제안한다) */}
      {!interviewDone && (
        <section aria-label="인터뷰" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {iv.messages.length === 0 ? (
            <>
              <div className="msg info">질문에 답하면 소개 글을 만들 수 있어요. 약 10분이면 끝나고, 중간에 나가도 저장돼서 이어서 쓸 수 있어요. 이름과 회사명은 쓰지 않아도 돼요.</div>
              <button className="btn" type="button" disabled={busy} onClick={startInterview}>인터뷰 시작하기</button>
            </>
          ) : (
            <>
              <div role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {iv.messages.map((m, i) =>
                  m.role === "ai" ? (
                    <div key={i} className="say">
                      <Mascot size={56} />
                      <div className="bubble">{m.text}</div>
                    </div>
                  ) : (
                    <div key={i} className="mine">{m.text}</div>
                  ),
                )}
                <div ref={chatEnd} />
              </div>
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label className="l" htmlFor="ans">내 답변</label>
                <textarea id="ans" className="field" rows={3} style={{ padding: 12, lineHeight: 1.5 }} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                <p className="hint" role="status">
                  {voice.note || (voice.supported
                    ? voice.listening ? "듣고 있어요. 말씀이 끝나면 마이크를 한 번 더 눌러 주세요." : "마이크를 누르고 말씀하세요. 말한 내용이 위 입력창에 글자로 나와요. 확인하고 고친 뒤 보내 주세요."
                    : "이 기기에서는 음성 입력을 쓸 수 없어요. 키보드로 입력해 주세요.")}
                </p>
                <div className="row">
                  {voice.supported && (
                    <button type="button" className={`mic ${voice.listening ? "on" : ""}`} aria-label={voice.listening ? "음성 입력 멈추기" : "음성으로 입력"} aria-pressed={voice.listening} onClick={voice.toggle}>
                      <IconMic />
                    </button>
                  )}
                  <button className="btn" type="button" disabled={busy || !answer.trim()} onClick={sendAnswer}>보내기</button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* 2. 초안 만들기: AI가 별칭·소개 글·2진실 1거짓을 함께 만든다 */}
      {interviewDone && !hasDraft && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="msg info">인터뷰를 마쳤어요. 이제 AI가 별칭과 소개 글{inAct ? ", 2진실 1거짓을" : "을"} 만들어요. 만든 뒤에 확인하고 고칠 수 있어요.</div>
          <button className="btn" type="button" disabled={busy} onClick={makeDraft}>{busy ? "만드는 중…" : inAct ? "소개 글과 2진실 1거짓 만들기" : "소개 글 만들기"}</button>
        </section>
      )}

      {/* 3. 미리보기 · 수정 · 승인 */}
      {interviewDone && hasDraft && (
        <section aria-label="미리보기와 승인" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h2 className="title grow" style={{ fontSize: 23, margin: 0 }}>{hasAlias ? `별칭 “${st.profile.alias}”` : "내 소개"}</h2>
            <span className={`pill ${approved ? "ok" : "warn"}`}>{approved ? "배포됨 ✓" : "초안 (나만 보여요)"}</span>
            {!approved && (
              <button className="mini" type="button" disabled={busy} onClick={redo}>{busy ? "만드는 중…" : "다시 만들기"}</button>
            )}
          </div>

          {/* 별칭: AI가 제안한 것을 확인하고, 필요하면 고쳐서 '바꾸기' */}
          {(!hasAlias || editAlias) && !approved ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="l" htmlFor="alias">{hasAlias ? "새 별칭" : "별칭을 정해 주세요"}</label>
              <span className="small">이름과 회사명이 드러나면 안 되고, 다른 회원과 겹치면 안 돼요. 바꾸면 소개 글 속 별칭도 함께 바뀌어요.</span>
              <input id="alias" className="field" value={alias} maxLength={20} onChange={(e) => setAlias(e.target.value)} placeholder="예: 평상 위의 독서가" />
              <div className="row">
                <button className="btn" type="button" disabled={busy || alias.trim().length < 2} style={{ width: "auto", minWidth: 120 }} onClick={saveAlias}>{hasAlias ? "바꾸기" : "정하기"}</button>
                {hasAlias && <button className="btn white" type="button" style={{ width: "auto", minWidth: 100 }} onClick={() => setEditAlias(false)}>취소</button>}
              </div>
            </div>
          ) : (
            <div className="card row" style={{ flexWrap: "wrap" }}>
              <span className="small">{approved ? "내 별칭" : "AI가 제안한 별칭"}</span>
              <b style={{ font: "400 20px var(--display)" }}>{st.profile.alias}</b>
              <span className="grow" />
              {!approved && <button className="mini" type="button" onClick={() => { setAlias(st.profile.alias); setEditAlias(true); }}>바꾸기</button>}
            </div>
          )}
          <label className="l" htmlFor="intro">소개 글 (직접 고칠 수 있어요)</label>
          <textarea id="intro" className="field" rows={10} style={{ padding: 12, lineHeight: 1.6 }} value={intro} disabled={approved} onChange={(e) => setIntro(e.target.value)} />

          {!approved && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="l" id="quick-l">빠르게 고치기</span>
              <div className="quick" role="group" aria-labelledby="quick-l">
                <button className="btn white" type="button" disabled={busy || intro.trim().length < 2} onClick={() => revise("더 짧게 줄여 주세요.")}>더 짧게</button>
                <button className="btn white" type="button" disabled={busy || intro.trim().length < 2} onClick={() => revise("말투를 더 부드럽게 해 주세요.")}>부드럽게</button>
              </div>
              {(lastReq || refusal) && (
                <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {lastReq && <div className="mine">{lastReq}</div>}
                  {refusal && (
                    <div className="fb bad" role="alert">
                      <span className="ic" aria-hidden="true">!</span>
                      <div><b>반영할 수 없어요</b><span className="t">{refusal} 다른 수정은 계속 도와드릴게요.</span></div>
                    </div>
                  )}
                </div>
              )}
              <label className="l" htmlFor="rev">고치고 싶은 점 (예: 취미 이야기를 더 넣어 주세요)</label>
              <input id="rev" className="field" value={reviseText} onChange={(e) => setReviseText(e.target.value)} />
              <button className="btn blue" type="button" disabled={busy || !reviseText.trim()} onClick={() => revise()}>{busy ? "고치는 중…" : "이렇게 고쳐 주세요"}</button>
            </div>
          )}

          {inAct && (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <b className="grow" style={{ font: "400 21px var(--display)" }}>2진실 1거짓</b>
                {!approved && st.aiEnabled && (
                  <button className="mini" type="button" disabled={busy} onClick={redo}>{busy ? "만드는 중…" : "소개 글과 함께 다시 만들기"}</button>
                )}
              </div>
              <span className="small">
                {st.aiEnabled
                  ? "AI가 인터뷰 답변으로 진실 2개와 거짓 1개를 만들고, 소개 글은 이 내용을 빼고 써요(소개 글을 읽고 정답을 알 수 없게). 다시 만들면 소개 글도 함께 바뀌어요. 직접 고칠 때는 진실 내용이 소개 글에 들어가지 않게 해 주세요."
                  : "소개 글에 쓰지 않은 내용으로 문장 3개를 적고, 거짓인 문장 하나를 골라 주세요. 너무 뻔하거나 실례가 되는 거짓은 피해 주세요."}
                {" "}활동이 끝나면 정답과 함께 프로필 북의 내 소개에 실려요.
              </span>
              {!approved && st.aiEnabled && tlEmpty && <div className="msg info" role="status">2진실 1거짓이 비어 있어요. “소개 글과 함께 다시 만들기”를 눌러 주세요.</div>}
              {stmts.map((t, i) => (
                <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, borderColor: lie === i ? "var(--red)" : undefined }}>
                  <label className="l" htmlFor={`st-${i}`}>문장 {i + 1}</label>
                  <input id={`st-${i}`} className="field" value={t} disabled={approved} onChange={(e) => setStmts(stmts.map((x, j) => (j === i ? e.target.value : x)))} />
                  <label className="row" style={{ gap: 8 }}>
                    <input type="radio" name="lie" checked={lie === i} disabled={approved} onChange={() => setLie(i)} style={{ width: 22, height: 22 }} />
                    <span style={{ fontWeight: 700 }}>이 문장이 거짓이에요</span>
                  </label>
                </div>
              ))}
            </>
          )}


          <div className="footer-actions">
            {approved ? (
              <button className="btn white" type="button" disabled={busy} onClick={unapprove}>승인 취소하고 다시 고치기</button>
            ) : (
              <>
                <button className="btn white" type="button" disabled={busy} onClick={() => saveDraft()}>임시 저장</button>
                <button className="btn" type="button" disabled={busy || !hasAlias || intro.trim().length < 20 || (inAct && stmts.some((s) => s.trim().length < 2))} onClick={approve}>최종 배포하겠습니다</button>
                <p className="hint center">승인하기 전에는 다른 회원과 관리자에게 보이지 않아요. 승인 뒤에도 취소하고 다시 고칠 수 있어요.</p>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/* ───────────── 누구일까요? (사전 추측) ───────────── */
function Guess({ aid, setNote, onProgress }: { aid: string; setNote: (n: Note) => void; onProgress: (p: { done: number; total: number } | null) => void }) {
  const [data, setData] = useState<{ guess: { status: string; opensAt: string; closesAt: string }; targets: Target[]; candidates: Cand[]; notJoin?: boolean } | null>(null);
  const [openId, setOpenId] = useState("");

  const load = useCallback(async () => {
    const r = await api<NonNullable<typeof data>>(`/api/who/${aid}/guess`);
    if (r.ok) setData(r.data);
    else setNote({ tone: "bad", text: r.error });
  }, [aid, setNote]);
  useEffect(() => {
    load();
  }, [load]);

  // 위쪽 진행 막대에 "고른 사람 수 / 전체" 를 알린다.
  useEffect(() => {
    if (!data || data.notJoin || data.targets.length === 0) return onProgress(null);
    onProgress({ done: data.targets.filter((t) => t.myChoice).length, total: data.targets.length });
  }, [data, onProgress]);

  async function pick(t: Target, c: Cand) {
    const r = await api(`/api/who/${aid}/guess`, { body: { profileId: t.profileId, chosenMemberId: c.id } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote(null);
    await load();
  }

  if (!data) return <p className="small">불러오는 중이에요…</p>;
  const g = data.guess;
  if (data.notJoin) return <div className="msg info">이 활동의 참여 대상으로 선택되지 않아서 맞히기에는 참여하지 않아요. 프로필 북에서 다른 회원의 소개를 읽어 보세요.</div>;
  if (g.status !== "open" && g.status !== "closed") {
    return <div className="msg info">{g.status === "before" ? `맞히기는 ${g.opensAt}부터 열려요.` : g.status === "unknown" ? "행사 날짜가 정해지면 맞히기가 열려요." : "이 활동에는 사전 맞히기가 없어요."}</div>;
  }
  const done = data.targets.filter((t) => t.myChoice).length;

  return (
    <>
      <div className="msg info">{g.status === "open" ? `${g.closesAt}까지 바꿀 수 있어요.` : "맞히기가 마감됐어요."} · {done}/{data.targets.length} 완료</div>
      {data.targets.length === 0 && <div className="msg info">아직 배포된 소개글이 없어요. 다른 회원이 작성하면 여기에 나타나요.</div>}
      <div className="pick">
        {data.targets.map((t) => {
          const chosen = data.candidates.find((c) => c.id === t.myChoice);
          const expanded = openId === t.profileId;
          return (
            <div key={t.profileId} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" className="opt" style={{ border: 0, padding: 0, minHeight: 0 }} aria-expanded={expanded} onClick={() => setOpenId(expanded ? "" : t.profileId)}>
                <span className="name">“{t.alias}”</span>
                <span className="small">{chosen ? `내 선택: ${chosen.name}` : "아직 고르지 않았어요"} · {expanded ? "접기" : "읽고 고르기"}</span>
              </button>
              {expanded && (
                <>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{t.introMd}</p>
                  <b>이 분은 누구일까요?</b>
                  <div className="pick" role="radiogroup" aria-label={`${t.alias} 추측`}>
                    {data.candidates.map((c, i) => (
                      <button key={c.id} type="button" role="radio" aria-checked={t.myChoice === c.id} className="opt rowopt" aria-pressed={t.myChoice === c.id} disabled={g.status !== "open"} onClick={() => pick(t, c)}>
                        <span className="avatar" style={{ background: AVATAR[i % AVATAR.length] }} aria-hidden="true">{c.name.slice(0, 1)}</span>
                        <span className="grow">
                          <span className="name">{c.name}</span>
                          {c.trip && <span className="pill warn">{c.trip}</span>}
                        </span>
                        <span className="tick" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
