"use client";

import Link from "next/link";
import { ActivityLiveBox, PartialWait } from "@/components/LiveActivities";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LessonHeader } from "@/components/LessonHeader";
import { sajuTabOn, WhoWrite, type Note, type WhoState as State } from "@/components/WhoWrite";
import { ActivitySaju } from "@/components/ActivitySaju";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type Target = { profileId: string; alias: string; introMd: string; myChoice: string };
type Cand = { id: string; name: string; trip: string };

// 사전 추측 후보 동그라미 색(돌아가며). 글자색은 globals.css .avatar 의 어두운 색이라 대비 4.5:1 이상.
const AVATAR = ["var(--chip)", "var(--red-bg)", "var(--soft)", "var(--line)"];

export default function WhoPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [tab, setTab] = useState<"write" | "saju" | "guess">("write");
  // 알림(새 소개가 올라왔어요)에서 ?tab=guess 로 들어오면 “누구일까요?” 맞히기 탭부터 연다
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "guess" || t === "saju") setTab(t);
  }, []);
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
        <button className="btn white" type="button" onClick={() => router.push(`/events/${id}`)}>‹ 일정으로 돌아가기</button>
      </main>
    );
  }

  // "누구일까요?" 탭: 일정 전 맞히기 기간이 있는 활동만. 현장 맞히기 활동은 위쪽 진행 칸에서 맞히므로 탭이 없다
  const guessTab = st.guess.status !== "none";
  // 위쪽 진행 막대: 작성 탭은 인터뷰 답변 수, 맞히기 탭은 고른 사람 수
  const iv = st.interview;
  const ivStarted = iv.messages.length > 0;
  const progress =
    tab === "guess" && guessTab ? guessProg
    : tab === "saju" ? null
    : ivStarted ? { done: iv.status === "done" ? Math.max(iv.answered, iv.required + (iv.extra ?? 0)) : iv.answered, total: Math.max(1, iv.required + (iv.extra ?? 0)) }
    : null;

  return (
    <main className="app">
      <LessonHeader href={`/events/${id}`} closeLabel="일정으로 돌아가기" title={st.activity.name} done={progress?.done} total={progress?.total} />
      {/* 이 활동의 설명·시간·진행 상황(일정의 활동 길에서 아이콘을 눌러 들어옴) */}
      <ActivityLiveBox eventId={id} activityId={aid} />
      <div className="seg" role="tablist" aria-label="내가 누구일까요? 메뉴">
        <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")} style={{ minHeight: 40, fontSize: fs(13) }}>내 소개(인터뷰)</button>
        {sajuTabOn(st) && <button type="button" role="tab" aria-selected={tab === "saju"} onClick={() => setTab("saju")} style={{ minHeight: 40, fontSize: fs(13) }}>내 소개(명리학)</button>}
        {/* 사전 맞히기가 있는 활동만(현장 맞히기는 이 화면 위쪽 진행 칸에서 한다) */}
        {guessTab && <button type="button" role="tab" aria-selected={tab === "guess"} onClick={() => setTab("guess")} style={{ minHeight: 40, fontSize: fs(13) }}>누구일까요?</button>}
      </div>
      {note && (note.tone === "bad"
        ? <div className="msg bad" role="alert">{note.text}</div>
        : <p className="small" role="status" style={{ margin: 0, color: "var(--accent-ink)", fontWeight: 700 }}>✓ {note.text}</p>)}

      {tab === "guess" && guessTab ? (
        <Guess aid={aid} setNote={setNote} onProgress={setGuessProg} />
      ) : tab === "saju" && st.state === "in" ? (
        <WhoWrite st={st} aid={aid} busy={busy} setBusy={setBusy} setNote={setNote} reload={load} part="saju" />
      ) : tab === "saju" && st.state === "optout" ? (
        <ActivitySaju aid={aid} />
      ) : st.state === "none" ? (
        // 참여 대상이 아니면 프로필 북에서 실명으로 소개를 쓴다
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>이 활동의 참여 대상이 아니에요</b>
          <span className="small">참여 대상으로 선택된 회원만 별칭으로 소개를 쓰고 맞히기에 참여해요. 내 소개는 프로필 북에서 실명으로 작성할 수 있어요.</span>
          <Link className="btn" href="/profiles/write" style={{ textDecoration: "none" }}>프로필 북에서 소개 작성하기</Link>
        </div>
      ) : st.state === "optout" ? (
        // 선택참여: 소개는 쓰지 않고 선별 조건의 액션만(맞히기·투표 등). 사주풀이가 선별 조건에 있으면 여기서 받는다.
        <>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ font: `700 ${fs(16)} var(--display)` }}>선택참여로 함께해요</b>
            <span className="small">이 활동에서는 소개를 쓰지 않아요. 위의 “누구일까요?” 맞히기와 현장 진행 중 열리는 단계 중 선택참여로 정해진 것에 참여할 수 있어요.</span>
          </div>
          <ActivitySaju aid={aid} />
        </>
      ) : st.state === "prompt" ? (
        // 소개를 써야 하는데 프로필 북에 실명 소개가 이미 공개돼 있음: 앱에서 묻지 않고 관리자와 이야기한다
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>관리자에게 문의해 주세요</b>
          <span className="small">프로필 북에 실명 소개가 이미 공개돼 있어서 이 활동에서 별칭 소개를 새로 쓸 수 없어요. 관리자와 이야기해 프로필 북 소개를 내리거나 참여 방식을 바꿔 주세요.</span>
        </div>
      ) : (
        <WhoWrite st={st} aid={aid} busy={busy} setBusy={setBusy} setNote={setNote} reload={load} />
      )}
    </main>
  );
}

/* ───────────── 누구일까요? (사전 추측) ───────────── */
function Guess({ aid, setNote, onProgress }: { aid: string; setNote: (n: Note) => void; onProgress: (p: { done: number; total: number } | null) => void }) {
  // onsite: 현장 맞히기(진행자가 열면 고를 수 있고 첫 소개를 열면 닫힌다), team: 같은 조원만
  const [data, setData] = useState<{ guess: { status: string; opensAt: string; closesAt: string }; onsite?: boolean; team?: boolean; targets: Target[]; candidates: Cand[]; notJoin?: boolean; notAllowed?: boolean } | null>(null);
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
  if (data.notAllowed) return <PartialWait />;
  if (data.notJoin) return <div className="msg info">이 활동의 참여 대상으로 선택되지 않아서 맞히기에는 참여하지 않아요. 프로필 북에서 다른 회원의 소개를 읽어 보세요.</div>;
  if (data.onsite) {
    return <div className="msg info" role="status">누구일까요? 맞히기는 현장에서 해요. 진행자가 조원 소개를 한 명씩 열면 이 화면 위의 진행 칸에서 누구인지 골라요. 모두 맞힌 뒤 한 명씩 “저예요”로 이름이 공개되고, 그다음 진실과 거짓을 해요.</div>;
  }
  if (g.status !== "open" && g.status !== "closed") {
    return <div className="msg info">{g.status === "before" ? `맞히기는 ${fmtDateTime(g.opensAt)}부터 열려요.` : g.status === "unknown" ? "일정 날짜가 정해지면 맞히기가 열려요." : "이 활동에는 사전 맞히기가 없어요."}</div>;
  }
  const done = data.targets.filter((t) => t.myChoice).length;

  return (
    <>
      <div className="row" style={{ gap: 8, fontSize: fs(13), color: "var(--sub)" }}>
        <span className="grow">{g.status === "open" ? (data.onsite ? `${data.team ? "우리 조원" : "참여자"} 소개를 읽고 골라 주세요. 진행자가 소개를 열기 전까지 바꿀 수 있어요.` : `${fmtDateTime(g.closesAt)}까지 바꿀 수 있어요.`) : "맞히기가 마감됐어요."}</span>
        <span className="chip violet num">{done}/{data.targets.length} 완료</span>
      </div>
      {data.targets.length === 0 && <div className="msg info">아직 공개된 소개글이 없어요. 다른 회원이 작성하면 여기에 나타나요.</div>}
      {/* 소개 목록(목업 C): 한 덩어리 안의 줄. 누르면 그 줄 아래로 소개 글과 후보가 펼쳐진다 */}
      {data.targets.length > 0 && (
        <ul className="rows">
          {data.targets.map((t) => {
            const chosen = data.candidates.find((c) => c.id === t.myChoice);
            const expanded = openId === t.profileId;
            return (
              <li key={t.profileId}>
                <button type="button" className="opt rowopt" aria-expanded={expanded} onClick={() => setOpenId(expanded ? "" : t.profileId)} style={{ minHeight: 56, padding: "10px 12px" }}>
                  <span className="grow">
                    <span className="name" style={{ fontSize: fs(15) }}>“{t.alias}”</span>
                    <span className="small" style={{ fontSize: fs(12) }}>{chosen ? `내 선택: ${chosen.name}` : "아직 고르지 않았어요"}</span>
                  </span>
                  <span className={`chip ${chosen ? "violet" : "line"}`}>{chosen ? "고름" : "미선택"}</span>
                  <span aria-hidden="true" style={{ color: "var(--dis)", transform: expanded ? "rotate(90deg)" : undefined, display: "inline-block" }}>›</span>
                </button>
                {expanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 12px 14px", borderTop: "1px solid var(--line2)" }}>
                    <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: fs(14) }}>{t.introMd}</p>
                    <h3 className="h3" style={{ fontSize: fs(14) }}>이 분은 누구일까요?</h3>
                    <div className="rows" role="radiogroup" aria-label={`${t.alias} 추측`}>
                      {data.candidates.map((c, i) => (
                        <button key={c.id} type="button" role="radio" aria-checked={t.myChoice === c.id} className="opt rowopt" disabled={g.status !== "open"} onClick={() => pick(t, c)}
                          style={{ minHeight: 48, padding: "8px 12px", ...(t.myChoice === c.id ? { background: "var(--violet-bg)" } : {}) }}>
                          <span className="avatar" style={{ background: AVATAR[i % AVATAR.length], width: 30, height: 30, borderRadius: 8, fontSize: fs(13) }} aria-hidden="true">{c.name.slice(0, 1)}</span>
                          <span className="grow" style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                            <span style={{ fontSize: fs(14), fontWeight: t.myChoice === c.id ? 700 : 500, color: t.myChoice === c.id ? "var(--violet-t)" : undefined }}>{c.name}</span>
                            {c.trip && <span className="chip gray">{c.trip}</span>}
                          </span>
                          <span className="tick" aria-hidden="true" style={t.myChoice === c.id ? { background: "var(--violet)", borderColor: "var(--violet)" } : undefined}>{t.myChoice === c.id ? "✓" : ""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
