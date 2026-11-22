"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import { Mascot } from "@/components/Mascot";
import { SajuPanel, type SajuInfo } from "@/components/SajuPanel";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

// skipped: "답변안함"으로 넘긴 질문
export type Msg = { role: "ai" | "me"; text: string; scope?: "intro" | "truthlie" | "none"; skipped?: boolean };
export type WhoState = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  book: boolean; // 프로필 북의 "소개 작성하기"(2진실 1거짓 없음, 실명 공개)
  blockedBy: { aid: string; eventId: string } | null; // 프로필 북 작성: 참여 중인 '내가 누구일까요?' 활동(그쪽에서 쓴다)
  pre: { status: string; opensAt: string; closesAt: string };
  guess: { status: string; opensAt: string; closesAt: string };
  aiEnabled: boolean;
  state: "none" | "prompt" | "optout" | "in";
  inActivity: boolean; // 게임 참여(별칭·2진실 1거짓)
  participants: string;
  blocks?: { saju: boolean; truthlies: boolean }; // 기능 블록 사주풀이 / 2진실 1거짓(사전 단계)
  sajuWhen?: "interview" | "pre" | "event"; // 사주풀이 여는 시점(활동 설정)
  sajuOpen?: boolean; // 지금 사주풀이를 받을 수 있는지
  revealAt: string; // 프로필 북 실명 공개 시각(ISO)
  profile: {
    alias: string; draftMd: string; introMd: string; introStatus: string;
    readingStatus: string; readingMd: string; traitsMd: string; traitsShown: boolean;
    sajuInfo: SajuInfo | null;
    sajuRedo?: boolean; // 명리 풀이를 다시 받을 수 있는지(모임설정 "한 번만")
  };
  // extra: AI 추가 질문 최대 개수, canSkip: 지금 질문은 답변안함 가능
  interview: {
    messages: Msg[]; status: string; answered: number; required: number; extra?: number; canSkip?: boolean;
    // 공통 질문 뒤 AI 추가 질문: aiPlan(go·none·kept), choose(지금 묻는 것: ai·redo·keep), notice(채팅 끝 안내), stashCount(보관한 이전 AI 답 수)
    aiPlan?: string; choose?: string; notice?: string; stashCount?: number;
  };
  truthLies: { statements: string[]; lieIndex: number; status: string };
};
export type Note = { tone: "bad" | "info"; text: string } | null;

const WHEN: Record<string, string> = {
  before: "아직 작성 기간이 아니에요.",
  closed: "작성 기간이 끝났어요.",
  unknown: "일정 날짜가 정해지면 작성 기간이 열려요.",
  none: "이 활동에는 사전 작성이 없어요.",
};
// AI 질문에서 바로 누를 수 있는 답 읽기: ①②③④ 보기, 또는 질문 끝의 “(예/아니요)”
export function quickAnswers(q: string): string[] {
  const opts = [...q.matchAll(/([①②③④⑤])\s*([^①②③④⑤\n]+)/g)].map((m) => `${m[1]} ${m[2].trim().replace(/[,.·]\s*$/, "")}`);
  if (opts.length >= 2) return opts;
  if (/\(\s*예\s*\/\s*아니요\s*\)/.test(q)) return ["예", "아니요"];
  return [];
}

const RESET_ASK = "기존 내 소개 글은 지워지고 공통 질문부터 다시 해요. 이전 AI 추가 질문 답변은 공통 질문을 마친 뒤 다시 할지, 유지할지 골라요. 새로 진행할까요?";

// 인터뷰 답변 하나 고치기(타이핑 또는 음성)
// 신원 검사에 걸린 말을 글 안에서 찾아 <mark>로 표시한다(띄어쓰기·대소문자는 무시하고 찾는다)
function hitRegex(hits: string[]): RegExp | null {
  const parts = hits.map((h) => h.replace(/\s+/g, "")).filter(Boolean)
    .map((h) => [...h].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
  return parts.length ? new RegExp(`(${parts.join("|")})`, "gi") : null;
}
function Marked({ text, hits }: { text: string; hits: string[] }) {
  const re = hitRegex(hits);
  if (!re) return <>{text}</>;
  return <>{text.split(re).map((p, i) => (i % 2 === 1 ? <mark key={i} className="id-hit">{p}</mark> : p))}</>;
}
const hasHit = (text: string, hits: string[]) => { const re = hitRegex(hits); return !!re && re.test(text); };

function AnswerEdit({ idx, q, value, skipped, onChange }: { idx: number; q: string; value: string; skipped?: boolean; onChange: (v: string) => void }) {
  return (
    <li className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="say" style={{ alignItems: "flex-start" }}>
        <Mascot size={28} />
        <div className="bubble" style={{ fontSize: fs(14) }}>{q}</div>
      </div>
      <label className="l" htmlFor={`ea-${idx}`} style={{ margin: 0 }}>내 답변 {idx + 1}{skipped ? " · 답변안함으로 넘겼어요" : ""}</label>
      <textarea id={`ea-${idx}`} className="field" rows={3} maxLength={2000} style={{ padding: 10, lineHeight: 1.5, fontSize: fs(15) }} value={value}
        placeholder={skipped ? "비워 두면 계속 답변안함이에요. 적으면 답한 것으로 바뀌어요." : undefined} onChange={(e) => onChange(e.target.value)} />
      <span className="small">답변 칸을 누르면 나오는 키보드의 🎤(마이크) 버튼을 누르고 말씀하시면 글자로 받아 적어요.</span>
    </li>
  );
}

/* ───────────── 내 소개 작성(활동·프로필 북 공통) ───────────── */
export function WhoWrite(props: {
  st: WhoState; aid: string; busy: boolean; setBusy: (b: boolean) => void; setNote: (n: Note) => void; reload: () => Promise<void>;
}) {
  const { st, aid, busy, setBusy, setNote, reload } = props;
  const open = st.pre.status === "open";
  const approved = st.profile.introStatus === "approved";
  const inAct = st.inActivity;
  // 기능 블록: 2진실 1거짓(게임 참여 회원만) / 사주풀이(AI 연결 시). 예전 응답(blocks 없음)은 모두 켠 것으로 본다.
  const tlOn = inAct && st.blocks?.truthlies !== false;
  const sajuOn = st.aiEnabled && st.blocks?.saju !== false;
  const sajuAfterIv = sajuOn && (st.sajuWhen ?? "interview") === "interview"; // 인터뷰 뒤(소개 글 만들기 전에 고른다)

  const [alias, setAlias] = useState(st.profile.alias);
  const [aliasIdeas, setAliasIdeas] = useState<string[]>([]); // AI 별칭 추천 후보
  const [aliasBusy, setAliasBusy] = useState(false);
  async function suggestAlias() {
    setAliasBusy(true);
    const r = await api<{ aliases: string[] }>(`/api/who/${aid}/alias`, { method: "PUT", body: {} });
    setAliasBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setAliasIdeas(r.data.aliases);
  }
  const [intro, setIntro] = useState(st.profile.introStatus === "approved" ? st.profile.introMd : st.profile.draftMd);
  const [stmts, setStmts] = useState<string[]>(st.truthLies.statements);
  const [lie, setLie] = useState(st.truthLies.lieIndex);
  const [reviseText, setReviseText] = useState("");
  const [lastReq, setLastReq] = useState(""); // 마지막 수정 요청(말풍선으로 보여 줌)
  const [refusal, setRefusal] = useState(""); // 지침 때문에 반영하지 못한 이유
  const [approveErr, setApproveErr] = useState(""); // 최종 배포가 막힌 이유(버튼 위에 보여 줌)
  const [hits, setHits] = useState<string[]>([]); // 신원 검사에 걸린 말(글 안에 표시)
  const [answer, setAnswer] = useState("");
  const [editAlias, setEditAlias] = useState(false);
  // 기존 인터뷰 수정하기: 질문별 답변 고치기
  const [editing, setEditing] = useState<{ q: string; a: string; skipped?: boolean }[] | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  // 인터뷰 중 앞 답 다시 쓰기: 몇 번째 내 답(0부터)과 고치는 글
  const [reAns, setReAns] = useState<{ k: number; text: string; q?: string; before?: string; checked?: string; msg?: string } | null>(null);
  const reRef = useRef<HTMLTextAreaElement>(null);
  // 다시 쓰기 칸도 글이 길어지면 커진다(답변 칸과 같게)
  useEffect(() => {
    const el = reRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 4, Math.round(window.innerHeight * 0.6))}px`;
  }, [reAns?.text, reAns?.k]);

  // 다시 불러오면(새 초안·배포) 화면 값도 맞춘다
  useEffect(() => {
    setIntro(st.profile.introStatus === "approved" ? st.profile.introMd : st.profile.draftMd);
    setAlias(st.profile.alias);
    setStmts(st.truthLies.statements);
    setLie(st.truthLies.lieIndex);
  }, [st.profile.introStatus, st.profile.introMd, st.profile.draftMd, st.profile.alias, st.truthLies.statements, st.truthLies.lieIndex]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [st.interview.messages.length]);

  // 답변 칸: 글이 길어지면 아래로 커진다. 화면 높이의 60%까지(폰 키보드가 올라와도 쓴 글이 잘 보이게).
  const ansRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ansRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 4, Math.round(window.innerHeight * 0.6))}px`;
  }, [answer]);
  // 오타 다듬기(AI): [보내기]를 누르면 먼저 문맥에 맞게 다듬어 칸에 보여 주고, 읽어 본 뒤 [이대로 보내기]로 보낸다.
  //  키보드 마이크(STT)로 받아 적은 글이든 직접 쓴 글이든 똑같이. checked: 다듬기를 거친(또는 고칠 것이 없던) 글
  const [polishing, setPolishing] = useState(false);
  const [polished, setPolished] = useState<{ before: string } | null>(null);
  const [polishMsg, setPolishMsg] = useState("");
  const [checked, setChecked] = useState("");
  const lastQ = [...st.interview.messages].reverse().find((m) => m.role === "ai")?.text ?? "";
  // 다듬기: 바뀐 것이 있으면 칸에 넣고 true(읽어 보게), 없거나 실패하면 false
  const polish = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim() || !st.aiEnabled) return false;
    setPolishing(true);
    setPolishMsg("");
    const r = await api<{ text: string; changed: boolean }>(`/api/who/${aid}/polish`, { body: { text, question: lastQ } });
    setPolishing(false);
    if (!r.ok) { setPolishMsg(`${r.error} 그대로 보내도 돼요.`); setChecked(text); return false; }
    setChecked(r.data.text);
    if (!r.data.changed) return false;
    setPolished({ before: text });
    setAnswer(r.data.text);
    setPolishMsg("문맥에 맞게 오타를 다듬었어요. 한 번 읽어 보고, 고칠 곳은 고친 뒤 [이대로 보내기]를 눌러 주세요.");
    return true;
  }, [aid, lastQ, st.aiEnabled]);
  const reviewing = !!polished && answer === checked;

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

  // 공통 질문 뒤 채팅으로 묻는 것에 답하기(AI 추가 질문 진행·이전 답 유지 등)
  const choose = (choice: "go" | "none" | "no" | "keep" | "drop") => run(async () => {
    const r = await api(`/api/who/${aid}/interview`, { body: { choice } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    await reload();
  });

  // 답변안함: 이 질문을 넘긴다(템플릿에서 허용한 질문만)
  const skipQuestion = () => run(async () => {
    const r = await api(`/api/who/${aid}/interview`, { body: { skip: true } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setAnswer("");
    await reload();
  });

  const sendAnswer = () => run(async () => {
    // 아직 다듬기를 거치지 않은 글이면 먼저 다듬어 보여 준다(고칠 것이 없으면 바로 보낸다)
    if (st.aiEnabled && answer.trim() !== checked.trim() && answer !== checked && (await polish(answer))) return;
    const r = await api(`/api/who/${aid}/interview`, { body: { answer } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setAnswer("");
    setPolished(null);
    setPolishMsg("");
    setChecked("");
    await reload();
  });

  // 보기·예/아니요 버튼으로 바로 답하기(짧은 답이라 AI 다듬기 없이 보낸다)
  const quickSend = (text: string) => run(async () => {
    const r = await api(`/api/who/${aid}/interview`, { body: { answer: text } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setAnswer("");
    setPolished(null);
    setPolishMsg("");
    setChecked("");
    await reload();
  });

  // 인터뷰 중 앞 질문의 답을 다시 쓴다(다음 질문은 그대로 이어서). 빈칸이면 "답변안함"으로 둔다.
  const saveRedo = () => run(async () => {
    if (!reAns) return;
    const text = reAns.text.trim();
    if (st.aiEnabled && text && reAns.text !== reAns.checked) {
      setPolishing(true);
      const p = await api<{ text: string; changed: boolean }>(`/api/who/${aid}/polish`, { body: { text, question: reAns.q ?? "" } });
      setPolishing(false);
      if (!p.ok) return setReAns({ ...reAns, checked: reAns.text, msg: `${p.error} 그대로 저장해도 돼요.` });
      if (p.data.changed) return setReAns({ ...reAns, text: p.data.text, before: reAns.text, checked: p.data.text, msg: "문맥에 맞게 오타를 다듬었어요. 한 번 읽어 보고, 고칠 곳은 고친 뒤 [이대로 저장]을 눌러 주세요." });
    }
    const mine = st.interview.messages.filter((m) => m.role === "me");
    const answers = mine.map((m, i) => (i === reAns.k ? reAns.text.trim() : m.skipped ? "" : m.text));
    if (!answers[reAns.k] && !mine[reAns.k]?.skipped) return setNote({ tone: "bad", text: "답을 적어 주세요." });
    const r = await api(`/api/who/${aid}/interview`, { method: "PUT", body: { answers } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setReAns(null);
    setNote({ tone: "info", text: "답을 고쳤어요. 이어서 다음 질문에 답해 주세요." });
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
        ? { tone: "info", text: tlOn ? "AI가 아직 연결되지 않아 내 답변을 모아 초안을 만들었어요. 별칭을 정하고 글을 다듬은 뒤, 2진실 1거짓 문장 3개를 적어 주세요." : inAct ? "AI가 아직 연결되지 않아 내 답변을 모아 초안을 만들었어요. 별칭을 정하고 글을 다듬어 주세요." : "AI가 아직 연결되지 않아 내 답변을 모아 초안을 만들었어요. 글을 다듬어 주세요." }
        : r.data.leaked?.length
          ? { tone: "bad", text: `소개 글에 2진실 1거짓 내용(${r.data.leaked.join(", ")})이 남아 있어요. 소개 글에서 지우거나 “다시 만들기”를 눌러 주세요.` }
          : { tone: "info", text: tlOn ? "별칭, 소개 글, 2진실 1거짓을 만들었어요. 2진실 1거짓 내용은 소개 글에 넣지 않았어요. 읽어 보고 고칠 부분을 알려 주세요." : inAct ? "별칭과 소개 글을 만들었어요. 읽어 보고 고칠 부분을 알려 주세요." : "소개 글을 만들었어요. 읽어 보고 고칠 부분을 알려 주세요." },
    );
    await reload();
  });

  const saveDraft = (silent = false) => run(async () => {
    const r = await api(`/api/who/${aid}/draft`, { method: "PUT", body: { introMd: intro, ...(tlOn ? { statements: stmts, lieIndex: lie } : {}) } });
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
    setApproveErr("");
    setHits([]);
    const r = await api(`/api/who/${aid}/approve`, { body: { introMd: intro, ...(tlOn ? { statements: stmts, lieIndex: lie } : {}) } });
    // 배포가 막히면 이유를 버튼 바로 위에도 보여 준다(맨 위 안내는 화면 밖이라 안 보일 수 있다)
    if (!r.ok) {
      setApproveErr(r.error);
      setHits(r.hits ?? []);
      return setNote({ tone: "bad", text: r.error });
    }
    setNote({
      tone: "info",
      text: inAct
        ? `배포했어요. 다른 회원은 별칭으로 내 소개를 읽어요${st.revealAt ? `(${fmtDateTime(st.revealAt)}부터 실명)` : ""}.`
        : "배포했어요. 프로필 북에 내 이름과 소개가 보여요.",
    });
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
    if (window.confirm(`인터뷰 답변으로 ${tlOn ? "2진실 1거짓과 소개 글을" : "소개 글을"} 함께 다시 만들까요? 지금 고친 내용은 새로 만든 내용으로 바뀌어요.${inAct ? " 별칭은 그대로예요." : ""}`)) makeDraft();
  };

  // 기존 인터뷰 수정하기: 질문과 내 답변을 짝지어 보여 준다
  const startEdit = () => {
    const ms = st.interview.messages;
    const pairs = ms.flatMap((m, i) => (m.role === "me" ? [{ q: ms[i - 1]?.role === "ai" ? ms[i - 1].text : "", a: m.skipped ? "" : m.text, skipped: !!m.skipped }] : []));
    setEditing(pairs);
    setNote(null);
  };
  // 고친 답변 저장 → 소개 글(과 2진실 1거짓) 다시 만들기
  const saveEdit = () => run(async () => {
    if (!editing) return;
    if (editing.some((p) => !p.a.trim() && !p.skipped)) return setNote({ tone: "bad", text: "빈 답변이 있어요. 답변을 적어 주세요." });
    const r = await api(`/api/who/${aid}/interview`, { method: "PUT", body: { answers: editing.map((p) => p.a.trim()) } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setEditing(null);
    const d = await api<{ draftMd: string; statements: string[]; lieIndex: number }>(`/api/who/${aid}/draft`, { body: {} });
    if (!d.ok) {
      setNote({ tone: "bad", text: `답변은 저장했어요. 소개 글을 다시 만들지 못했어요: ${d.error}` });
    } else {
      setIntro(d.data.draftMd);
      setStmts(d.data.statements);
      setLie(d.data.lieIndex);
      setNote({ tone: "info", text: "고친 답변으로 소개 글을 다시 만들었어요. 확인하고 최종 배포를 눌러 주세요." });
    }
    await reload();
  });
  // AI 인터뷰 다시 하기: 기존 내 소개를 지우고 처음부터
  const restart = () => {
    if (!window.confirm(RESET_ASK)) return;
    run(async () => {
      const r = await api(`/api/who/${aid}/interview`, { method: "DELETE" });
      if (!r.ok) return setNote({ tone: "bad", text: r.error });
      setIntro("");
      const s = await api(`/api/who/${aid}/interview`, { body: {} });
      if (!s.ok) setNote({ tone: "bad", text: s.error });
      else setNote({ tone: "info", text: "기존 내 소개를 지웠어요. 공통 질문부터 다시 시작해요." });
      await reload();
    });
  };
  const tlEmpty = stmts.every((x) => !x.trim());

  if (!open) {
    return (
      <div className="msg info">
        {WHEN[st.pre.status] ?? ""}{st.pre.opensAt ? ` 작성 기간은 ${fmtDateTime(st.pre.opensAt)} ~ ${fmtDateTime(st.pre.closesAt)} 예요.` : ""}
        {approved && " 승인된 소개는 그대로 공개돼 있어요."}
      </div>
    );
  }

  const iv = st.interview;
  const hasAlias = Boolean(st.profile.alias);
  const interviewDone = iv.status === "done";
  const hasDraft = st.profile.introStatus === "draft" || approved || intro.trim().length > 0;
  const reading = {
    canRedo: st.profile.sajuRedo,
    readingStatus: st.profile.readingStatus, readingMd: st.profile.readingMd,
    traitsMd: st.profile.traitsMd, traitsShown: st.profile.traitsShown, sajuInfo: st.profile.sajuInfo,
  };
  const readingChosen = st.profile.readingStatus === "done" || st.profile.readingStatus === "skipped";
  // 인터뷰 없이 이미 공개된 소개가 있는 경우(예전 방식): 다시 하기만 할 수 있다
  const introOnly = approved && iv.messages.length === 0;

  // 기존 인터뷰 수정 화면
  if (editing) {
    return (
      <section aria-label="기존 인터뷰 수정하기" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="msg info">질문별 내 답변을 고쳐 주세요. 키보드로 고치거나 마이크로 말해서 덧붙일 수 있어요. 저장하면 고친 답변으로 소개 글{tlOn ? "과 2진실 1거짓" : ""}을 다시 만들어요{approved ? "(다시 배포할 때까지 지금 공개된 소개는 숨겨져요)" : ""}.</div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {editing.map((p, i) => (
            <AnswerEdit key={i} idx={i} q={p.q} value={p.a} skipped={p.skipped} onChange={(v) => setEditing((cur) => cur?.map((x, j) => (j === i ? { ...x, a: v } : x)) ?? cur)} />
          ))}
        </ol>
        <div className="footer-actions">
          <button className="btn" type="button" disabled={busy} onClick={saveEdit}>{busy ? "저장하고 다시 만드는 중…" : "저장하고 소개 글 다시 만들기"}</button>
          <button className="btn white" type="button" disabled={busy} onClick={() => setEditing(null)}>취소</button>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* 내 소개 작성 안내: 펼쳐서 읽고 접은 뒤 인터뷰를 시작한다 */}
      <details className="card who-guide">
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: fs(14) }}>내 소개 작성 안내 <span className="small">(눌러서 펼치기·접기)</span></summary>
        {!st.aiEnabled && <div className="msg info" style={{ marginTop: 8 }}>AI가 아직 연결되지 않아 정해진 질문으로 진행해요. 소개 글은 내 답변을 모아 초안을 만들고 직접 다듬어요.</div>}
        <ol className="who-guide-list" style={{ margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: fs(14), lineHeight: 1.6 }}>
          {inAct && <li>프로필 북에는 실명 대신 별칭 <b>“{st.profile.alias}”</b>(으)로 보여요.</li>}
          {inAct && <li>활동이 끝나면{st.revealAt ? `(${fmtDateTime(st.revealAt)})` : ""} 실명과 내 소개가 프로필 북에 공개돼요.</li>}
          <li>질문에 답하면 소개 글을 만들 수 있어요. 음성으로 답하면 AI가 오타·오류를 다듬고, 회원님이 확인한 뒤 답변을 올려요.</li>
          <li>공통 질문 <b>{iv.required}개</b>를 진행하고{(iv.extra ?? 0) > 0 ? <>, 답변한 내용을 바탕으로 AI가 추가 질문 <b>최대 {iv.extra}개</b>를 이어서 해요</> : null}. <b>약 {iv.required + (iv.extra ?? 0)}분</b> 걸려요.</li>
          <li>중간에 나가도(위쪽 X) 저장돼요. 다시 들어와서 이어서 하면 돼요.</li>
          {inAct && <li>이름과 회사명은 쓰지 말아 주세요.</li>}
          <li>모든 질문은 “답변안함”으로 넘길 수 있어요. 다만 활동 진행과 프로필 북 소개를 위해 <b>공통 질문 5개 정도는 답해 주시길</b> 권해요.</li>
          {sajuOn && <li>AI 인터뷰가 끝나면 <b>명리학 사주풀이</b>를 해 드려요. 생년월일과 성별만 넣으면, 나만 볼 수 있는 자세한 풀이를 받아 볼 수 있어요.</li>}
          {sajuOn && <li>명리학으로 본 나의 성격과 성향을 내 소개에 더할 수 있어요. 회원들이 호감을 가질 수 있게 AI가 정성껏 써 드려요.</li>}
          <li>모든 소개 글은 수정 요청·직접 수정·삭제를 할 수 있어요. 인터뷰 중에도 내 답 옆 “다시 쓰기”를 누르면 다시 답할 수 있어요.</li>
        </ol>
      </details>

      {/* 단계: ① 공통 질문 ② AI 추가 질문 ③ 명리학 사주풀이 */}
      {iv.messages.length > 0 && !introOnly && (() => {
        const extra = iv.extra ?? 0;
        const commonDone = iv.answered >= iv.required;
        const aiState = !extra ? "" : iv.aiPlan === "none" ? "안 함" : interviewDone ? "완료" : commonDone ? "진행 중" : "대기";
        const sajuState = !sajuOn ? "" : readingChosen ? (st.profile.readingStatus === "done" ? "완료" : "안 함") : interviewDone ? "진행 중" : "대기";
        const steps = [
          { t: "공통 질문", s: commonDone ? "완료" : "진행 중" },
          ...(aiState ? [{ t: "AI 추가 질문", s: aiState }] : []),
          ...(sajuState ? [{ t: "명리학 사주풀이", s: sajuState }] : []),
        ];
        return (
          <div className="row" role="list" aria-label="인터뷰 단계" style={{ gap: 6, flexWrap: "wrap" }}>
            {steps.map((x, i) => (
              <span key={x.t} role="listitem" className={`pill ${x.s === "진행 중" ? "blue" : x.s === "완료" ? "ok" : "gray"}`} style={{ fontSize: fs(13) }}>
                {"①②③"[i]} {x.t} · {x.s}
              </span>
            ))}
          </div>
        );
      })()}

      {/* 인터뷰를 마친 뒤: 기존 인터뷰 수정하기 / AI 인터뷰 다시 하기 */}
      {(interviewDone || introOnly) && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {interviewDone && <button className="btn white" type="button" style={{ flex: "1 1 160px" }} disabled={busy} onClick={startEdit}>기존 인터뷰 수정하기</button>}
          <button className="btn white" type="button" style={{ flex: "1 1 160px" }} disabled={busy} onClick={restart}>AI 인터뷰 다시 하기</button>
        </div>
      )}

      {/* 1. 인터뷰 (별칭은 인터뷰가 끝난 뒤 AI가 소개 글과 함께 제안한다) */}
      {!interviewDone && !introOnly && (
        <section aria-label="인터뷰" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {iv.messages.length === 0 ? (
            <>
              <button className="btn" type="button" disabled={busy} onClick={startInterview}>인터뷰 시작하기</button>
            </>
          ) : (
            <>
              <div role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {iv.messages.map((m, i) => {
                  // 구분선: 첫 질문 앞 "공통 질문", 공통 질문을 다 마친 뒤 첫 AI 질문 앞 "AI 추가 질문"
                  const before = iv.messages.slice(0, i).filter((x) => x.role === "me").length;
                  const divider = m.role === "ai" && (i === 0 || (before === iv.required && iv.messages[i - 1]?.role === "me"))
                    ? <div className="small" style={{ textAlign: "center", fontWeight: 700, color: "var(--sub)", margin: "4px 0" }}>— {i === 0 ? `① 공통 질문 ${iv.required}개` : "② AI 추가 질문"} —</div>
                    : null;
                  if (m.role === "ai") return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {divider}
                      <div className="say">
                        <Mascot size={32} />
                        <div className="bubble">{m.text}</div>
                      </div>
                    </div>
                  );
                  // 몇 번째 내 답인지(다시 쓰기에 쓴다)
                  const k = iv.messages.slice(0, i).filter((x) => x.role === "me").length;
                  if (reAns?.k === k) return (
                    <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, alignSelf: "stretch" }}>
                      <label className="l" htmlFor={`redo-${k}`} style={{ margin: 0 }}>이 질문의 답 다시 쓰기</label>
                      <textarea id={`redo-${k}`} ref={reRef} className="field" rows={3} style={{ padding: 10, lineHeight: 1.6, fontSize: fs(16), minHeight: 110, resize: "vertical" }} value={reAns.text} readOnly={polishing} onChange={(e) => setReAns({ ...reAns, text: e.target.value })} />
                      {(polishing || reAns.msg) && <p className="small" role="status" style={{ margin: 0, color: reAns.before !== undefined ? "var(--accent-ink)" : undefined }}>{polishing ? "AI가 문맥을 보고 오타를 다듬는 중이에요…" : reAns.msg}</p>}
                      {reAns.before !== undefined && (
                        <button className="mini" type="button" style={{ alignSelf: "flex-start" }} disabled={busy || polishing} onClick={() => setReAns({ ...reAns, text: reAns.before ?? "", before: undefined, msg: "다듬기 전 글로 되돌렸어요." })}>다듬기 전으로</button>
                      )}
                      <span className="hint" style={{ fontSize: fs(12) }}>답변 칸을 누르면 나오는 키보드의 🎤(마이크) 버튼을 누르고 말씀하시면 글자로 받아 적어요.{st.aiEnabled ? " [저장]을 누르면 AI가 오타를 먼저 다듬어 보여 드려요." : ""}</span>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn" type="button" style={{ flex: 1 }} disabled={busy || polishing} onClick={saveRedo}>{polishing ? "다듬는 중…" : reAns.before !== undefined && reAns.text === reAns.checked ? "이대로 저장" : "고친 답 저장"}</button>
                        <button className="btn white" type="button" style={{ flex: 1 }} disabled={busy} onClick={() => setReAns(null)}>취소</button>
                      </div>
                    </div>
                  );
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <div className="mine" style={m.skipped ? { opacity: 0.6, fontStyle: "italic" } : undefined}>{m.skipped ? "답변안함" : m.text}</div>
                      <button type="button" className="mini" style={{ minHeight: 28, padding: "0 8px", fontSize: fs(12) }} disabled={busy || !!reAns} onClick={() => setReAns({ k, text: m.skipped ? "" : m.text, q: iv.messages[i - 1]?.role === "ai" ? iv.messages[i - 1].text : "" })} aria-label={`${k + 1}번째 답 다시 쓰기`}>{m.skipped ? "답하기" : "다시 쓰기"}</button>
                    </div>
                  );
                })}
                {iv.choose && (
                  <div className="say">
                    <Mascot size={32} />
                    <div className="bubble" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {iv.choose === "ai" && (
                        <>
                          <span>공통 질문을 모두 마쳤어요. 답변을 바탕으로 AI가 추가 질문을 <b>최대 {iv.extra ?? 0}개</b> 더 드릴 수 있어요. 진행할까요?</span>
                          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <button className="btn" type="button" disabled={busy} style={{ width: "auto" }} onClick={() => choose("go")}>AI 추가 질문 진행</button>
                            <button className="btn white" type="button" disabled={busy} style={{ width: "auto" }} onClick={() => choose("none")}>안 하고 마치기</button>
                          </div>
                        </>
                      )}
                      {iv.choose === "redo" && (
                        <>
                          <span>공통 질문을 다시 마쳤어요. 이전에 답한 AI 추가 질문이 <b>{iv.stashCount ?? 0}개</b> 있어요. AI 추가 질문도 다시 진행할까요?</span>
                          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <button className="btn" type="button" disabled={busy} style={{ width: "auto" }} onClick={() => choose("go")}>다시 진행 (이전 답은 지워요)</button>
                            <button className="btn white" type="button" disabled={busy} style={{ width: "auto" }} onClick={() => choose("no")}>다시 진행 안 함</button>
                          </div>
                        </>
                      )}
                      {iv.choose === "keep" && (
                        <>
                          <span>이전 AI 추가 질문 답변을 유지할까요? 유지하면 <b>바뀐 공통 답변과 맞지 않게 된 답변은 지워요.</b></span>
                          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <button className="btn" type="button" disabled={busy} style={{ width: "auto" }} onClick={() => choose("keep")}>{busy ? "확인하는 중…" : "유지하기"}</button>
                            <button className="btn white" type="button" disabled={busy} style={{ width: "auto" }} onClick={() => choose("drop")}>모두 지우고 마치기</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              {!iv.choose && <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* 진행 상황: 공통 질문 n/N · AI 추가 질문 n/M · 남은 시간 */}
                {(() => {
                  const extra = iv.extra ?? 0;
                  const common = Math.min(iv.answered, iv.required);
                  const ai = Math.max(0, iv.answered - iv.required);
                  const left = Math.max(0, iv.required - common) + Math.max(0, extra - ai);
                  return (
                    <div className="row" role="status" style={{ gap: 6, flexWrap: "wrap", fontSize: fs(13) }}>
                      <span className={`pill ${common < iv.required ? "blue" : "ok"}`}>공통 질문 {common}/{iv.required}</span>
                      {extra > 0 && <span className={`pill ${iv.answered < iv.required ? "gray" : "blue"}`}>AI 추가 질문 {ai}/{extra}</span>}
                      <span className="small">{left > 0 ? `남은 질문 약 ${left}개 · 약 ${left}분` : "거의 끝났어요"}</span>
                    </div>
                  );
                })()}
                {/* 지금 질문에 보기(①②③)나 (예/아니요)가 있으면 눌러서 바로 답한다 */}
                {(() => {
                  const last = iv.messages[iv.messages.length - 1];
                  const qa = last?.role === "ai" ? quickAnswers(last.text) : [];
                  if (!qa.length) return null;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span className="l" style={{ margin: 0 }}>눌러서 바로 답하기</span>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        {qa.map((t) => (
                          <button key={t} type="button" className="btn white" disabled={busy || polishing} style={{ width: "auto", minHeight: 44, textAlign: "left" }} onClick={() => quickSend(t)}>{t}</button>
                        ))}
                      </div>
                      <span className="small">맞는 답이 없으면 아래에 직접 적어도 돼요.</span>
                    </div>
                  );
                })()}
                <label className="l" htmlFor="ans">내 답변</label>
                <textarea id="ans" ref={ansRef} className="field" rows={3} style={{ padding: 10, lineHeight: 1.6, fontSize: fs(16), minHeight: 110, resize: "vertical" }} value={answer} onChange={(e) => setAnswer(e.target.value)} readOnly={polishing} />
                {/* AI 오타 다듬기: 상태·되돌리기·다시 다듬기 */}
                {(polishing || polishMsg) && <p className="small" role="status" style={{ margin: 0, color: polished ? "var(--accent-ink)" : undefined }}>{polishing ? "AI가 문맥을 보고 오타를 다듬는 중이에요…" : polishMsg}</p>}
                {polished && (
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {polished && <button className="mini" type="button" disabled={busy || polishing} onClick={() => { setAnswer(polished.before); setPolished(null); setPolishMsg("다듬기 전 글로 되돌렸어요."); }}>다듬기 전으로</button>}
                  </div>
                )}
                <p className="hint" style={{ fontSize: fs(12) }}>
                  답변 칸을 누르면 나오는 키보드의 🎤(마이크) 버튼을 누르고 말씀하시면 글자로 받아 적어요.{st.aiEnabled ? " [보내기]를 누르면 AI가 문맥에 맞게 오타를 먼저 다듬어 보여 드려요. 읽어 보고 보내 주세요." : " 받아 적은 글을 읽어 보고 고친 뒤 보내 주세요."}
                </p>
                <button className="btn" type="button" disabled={busy || polishing || !answer.trim()} onClick={sendAnswer}>{polishing ? "다듬는 중…" : reviewing ? "이대로 보내기" : "보내기"}</button>
                {iv.canSkip && (
                  <button className="btn white" type="button" disabled={busy} onClick={skipQuestion}>답변안함 (이 질문 넘기기)</button>
                )}
              </div>}
            </>
          )}
        </section>
      )}

      {/* 인터뷰 마지막 단계: 명리학 사주 보기 / 안 보기 (고르기 전에는 소개 글 만들기를 보여 주지 않는다) */}
      {interviewDone && iv.notice && !hasDraft && (
        <div className="say"><Mascot size={32} /><div className="bubble">{iv.notice}</div></div>
      )}
      {interviewDone && !hasDraft && sajuAfterIv && (
        <SajuPanel aid={aid} r={reading} canWrite={open} onChanged={reload} />
      )}
      {/* 여는 시점이 사전 작성 기간·일정 당일이면 그때 따로 보여 준다(소개 글 만들기와 상관없이) */}
      {sajuOn && !sajuAfterIv && !hasDraft && (st.sajuOpen || readingChosen) && (
        <SajuPanel aid={aid} r={reading} canWrite={!!st.sajuOpen} onChanged={reload} />
      )}

      {/* 2. 초안 만들기 */}
      {interviewDone && !hasDraft && (!sajuAfterIv || readingChosen) && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="msg info">인터뷰를 마쳤어요. 이제 AI가 {tlOn ? "별칭과 소개 글, 2진실 1거짓을" : inAct ? "별칭과 소개 글을" : "소개 글을"} 만들어요. 만든 뒤에 확인하고 고칠 수 있어요.</div>
          <button className="btn" type="button" disabled={busy} onClick={makeDraft}>{busy ? "만드는 중…" : tlOn ? "소개 글과 2진실 1거짓 만들기" : "소개 글 만들기"}</button>
        </section>
      )}

      {/* 3. 미리보기 · 수정 · 승인 */}
      {(interviewDone || introOnly) && hasDraft && (
        <section aria-label="미리보기와 승인" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h2 className="h3 grow">{inAct && hasAlias ? `별칭 “${st.profile.alias}”` : "내 소개"}</h2>
            <span className={`chip ${approved ? "violet" : "gray"}`}>{approved ? "배포됨 ✓" : "초안 · 나만 보여요"}</span>
            {!approved && interviewDone && (
              <button className="mini" type="button" disabled={busy} onClick={redo}>{busy ? "만드는 중…" : "다시 만들기"}</button>
            )}
          </div>

          {/* 별칭(게임 참여일 때만): 랜덤으로 정해진 별칭을 확인하고, 필요하면 고쳐서 '바꾸기' */}
          {inAct && ((!hasAlias || editAlias) && !approved ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="l" htmlFor="alias">{hasAlias ? "새 별칭" : "별칭을 정해 주세요"}</label>
              <span className="small">이름과 회사명이 드러나면 안 되고, 다른 회원과 겹치면 안 돼요. 바꾸면 소개 글 속 별칭도 함께 바뀌어요.</span>
              <input id="alias" className="field" value={alias} maxLength={20} onChange={(e) => setAlias(e.target.value)} placeholder="예: 평상 위의 독서가" />
              {/* 한 줄: [AI 추천 받기] [바꾸기] [취소]. AI 추천 후보는 그 아래, 누르면 칸에 채워짐(“바꾸기”를 눌러야 저장) */}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn white" type="button" disabled={aliasBusy || busy} style={{ width: "auto", minWidth: 120 }} onClick={suggestAlias}>{aliasBusy ? "추천 만드는 중…" : aliasIdeas.length ? "AI 추천 다시 받기" : "AI 추천 받기"}</button>
                <button className="btn" type="button" disabled={busy || alias.trim().length < 2} style={{ width: "auto", minWidth: 120 }} onClick={saveAlias}>{hasAlias ? "바꾸기" : "정하기"}</button>
                {hasAlias && <button className="btn white" type="button" style={{ width: "auto", minWidth: 100 }} onClick={() => setEditAlias(false)}>취소</button>}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {aliasIdeas.map((a) => (
                  <button key={a} type="button" className={`chip ${alias === a ? "violet" : "line"}`} style={{ cursor: "pointer" }} onClick={() => setAlias(a)}>{a}</button>
                ))}
              </div>
              {aliasIdeas.length > 0 && <span className="small">마음에 드는 별칭을 누르면 칸에 들어가요. “{hasAlias ? "바꾸기" : "정하기"}”를 눌러야 저장돼요.</span>}
            </div>
          ) : (
            <div className="card row" style={{ flexWrap: "wrap" }}>
              <span className="small">내 별칭</span>
              <b style={{ font: `700 ${fs(15)} var(--display)` }}>{st.profile.alias}</b>
              <span className="grow" />
              {!approved && <button className="mini" type="button" onClick={() => { setAlias(st.profile.alias); setEditAlias(true); }}>바꾸기</button>}
            </div>
          ))}
          <label className="l" htmlFor="intro">{approved ? "소개 글 (고치려면 아래 “승인 취소하고 다시 고치기”를 눌러 주세요)" : "소개 글 (직접 고칠 수 있어요)"}</label>
          <textarea id="intro" className="field" rows={10} style={{ padding: 12, lineHeight: 1.65, fontSize: fs(15), marginTop: -6 }} value={intro} disabled={approved} onChange={(e) => setIntro(e.target.value)} />
          {!approved && hits.length > 0 && hasHit(intro, hits) && (
            <div className="id-hit-box" role="note" aria-label="신원이 드러나는 말 표시">
              <span className="small"><b>빨갛게 표시한 말</b>을 지우거나 일반적인 표현으로 바꿔 주세요.</span>
              <p><Marked text={intro} hits={hits} /></p>
            </div>
          )}

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

          {tlOn && (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <h3 className="h3 grow">2진실 1거짓</h3>
                {!approved && st.aiEnabled && (
                  <button className="mini" type="button" disabled={busy} onClick={redo}>{busy ? "만드는 중…" : "소개 글과 함께 다시 만들기"}</button>
                )}
              </div>
              <span className="small" style={{ fontSize: fs(12), marginTop: -6 }}>
                {st.aiEnabled
                  ? "AI가 인터뷰 답변으로 진실 2개와 거짓 1개를 만들고, 소개 글은 이 내용을 빼고 써요(소개 글을 읽고 정답을 알 수 없게). 다시 만들면 소개 글도 함께 바뀌어요. 직접 고칠 때는 진실 내용이 소개 글에 들어가지 않게 해 주세요."
                  : "소개 글에 쓰지 않은 내용으로 문장 3개를 적고, 거짓인 문장 하나를 골라 주세요. 너무 뻔하거나 실례가 되는 거짓은 피해 주세요."}
                {" "}활동이 끝나면 정답과 함께 프로필 북의 내 소개에 실려요.
              </span>
              {!approved && st.aiEnabled && tlEmpty && <div className="msg info" role="status">2진실 1거짓이 비어 있어요. “소개 글과 함께 다시 만들기”를 눌러 주세요.</div>}
              <ul className="rows">
                {stmts.map((t, i) => (
                  <li key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: lie === i ? "var(--red-bg)" : undefined }}>
                    <div className="row" style={{ gap: 8 }}>
                      <label className="l grow" htmlFor={`st-${i}`} style={{ margin: 0 }}>문장 {i + 1}</label>
                      {lie === i && <span className="chip red">거짓</span>}
                    </div>
                    <input id={`st-${i}`} className="field" style={{ minHeight: 44, fontSize: fs(15) }} value={t} disabled={approved} onChange={(e) => setStmts(stmts.map((x, j) => (j === i ? e.target.value : x)))} />
                    {!approved && hits.length > 0 && hasHit(t, hits) && <div className="id-hit-box"><p><Marked text={t} hits={hits} /></p></div>}
                    <label className="row" style={{ gap: 8, minHeight: 32, fontSize: fs(13), cursor: approved ? "default" : "pointer" }}>
                      <input type="radio" name="lie" checked={lie === i} disabled={approved} onChange={() => setLie(i)} style={{ width: 18, height: 18 }} />
                      <span>이 문장이 거짓이에요</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* 명리학: 성격·성향(소개 페이지 맨 끝에 공개, 뺄 수 있음) + 생애주기 풀이(나만) */}
          {sajuOn && (sajuAfterIv || st.sajuOpen || readingChosen) && <SajuPanel aid={aid} r={reading} canWrite={sajuAfterIv ? open : !!st.sajuOpen} published={approved} onChanged={reload} />}

          {approveErr && !approved && (
            <div className="msg bad" role="alert">
              {hits.length > 0 ? <>신원이 드러나는 말이 있어 배포할 수 없어요: {hits.map((h, i) => <span key={h}>{i ? ", " : ""}<mark className="id-hit">{h}</mark></span>)}. 위 글에 빨갛게 표시했어요.</> : approveErr}
            </div>
          )}
          <div className="footer-actions">
            {approved ? (
              <button className="btn white" type="button" disabled={busy} onClick={unapprove}>승인 취소하고 다시 고치기</button>
            ) : (
              <>
                {/* 임시 저장 · 최종 배포를 한 줄로 같은 크기(1:1) */}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn white" type="button" disabled={busy} style={{ flex: "1 1 0", minWidth: 0 }} onClick={() => saveDraft()}>임시 저장</button>
                  <button className="btn" type="button" disabled={busy || (inAct && !hasAlias) || intro.trim().length < 20 || (inAct && stmts.some((s) => s.trim().length < 2))} style={{ flex: "1 1 0", minWidth: 0 }} onClick={approve}>최종 배포</button>
                </div>
                <p className="hint center">승인하기 전에는 다른 회원과 관리자에게 보이지 않아요. 승인 뒤에도 취소하고 다시 고칠 수 있어요.</p>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
