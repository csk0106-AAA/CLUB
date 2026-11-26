"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, fmtDateTime, fmtRange } from "@/lib/client";
import { IconChat, IconLock, IconQuestion, IconStar } from "./Icons";
import { fs } from "@/lib/fs";

type Worry = {
  canJoin: boolean; body: string; category: string; orderNo: number; paused: boolean; remainingMs: number;
  timeUp: boolean; nameRevealed: boolean; displayName: string; isMine: boolean; canSelfReveal: boolean;
  tips: string[]; serverNow: number;
};
type Round = {
  id: string;
  canJoin: boolean;
  state: "intro" | "results" | "reveal" | "voting" | "closed" | "answer" | "guess" | "guessed" | "named";
  alias: string;
  isTarget: boolean;
  screen: string;
  nameRevealed: boolean;
  name: string;
  statements: string[];
  voted: boolean;
  myVote: number;
  lieIndex: number;
  correct: boolean | null;
  // 현장 맞히기 흐름에서만
  flow?: boolean;
  profileId?: string;
  introMd?: string;
  candidates?: { id: string; name: string }[];
  myGuess?: string;
  myGuessId?: string;
  guessRight?: boolean | null;
  guessOpen?: boolean;
};
type Award = { score: number; winner: string; winnerId: string; tied: string[] };
type Live = {
  id: string;
  name: string;
  description: string;
  guide?: string[]; // 회원에게 보이는 활동 안내(목록)
  pre: { enabled: boolean; status: string; opensAt: string; closesAt: string };
  guess: { enabled: boolean; status: string; opensAt: string; closesAt: string };
  kind: string;
  participants: string;
  startsAt: string;
  endsAt: string;
  canJoin: boolean;
  live: { active: boolean; stepLabel: string; unlocked: boolean; memberScreen: string };
  stepAllowed?: boolean; // 지금 열린 현장 단계를 내가 할 수 있는지(선택참여 회원은 선별 조건에 있는 단계만)
  round: Round | null;
  worry: Worry | null;
  awards?: { A: Award; B: Award } | null; // 현장 맞히기 흐름의 시상(내 조)
  teamName?: string; // 조별 진행이면 내가 따르는 조
  teamHost?: { name: string; href: string } | null; // 내가 조 진행자면 그 조 진행 화면
};

// 현장 진행 중 회원 휴대폰에 열린 화면별로 "지금 무엇을 하면 되는지"
const SCREEN_NOTE: Record<string, string> = {
  wait: "진행자 안내에 따라 잠시 기다려 주세요.",
  write: "작성 화면이 열렸어요. 이 화면에서 작성해 주세요.",
  vote: "투표 화면이 열렸어요. 이 화면에서 골라 주세요.",
  iam_button: "소개의 주인공이라면 “저예요” 버튼을 눌러 주세요.",
  pick_person: "소개를 읽고 누구인지 골라 주세요.",
  view: "결과를 이 화면에서 볼 수 있어요.",
};

function preBadge(p: Live["pre"]): { tone: string; text: string } {
  if (!p.enabled) return { tone: "warn", text: "현장에서 진행" };
  if (p.status === "open") return { tone: "ok", text: `사전 작성 중 · ${fmtDateTime(p.closesAt)}까지` };
  if (p.status === "before") return { tone: "gray", text: `사전 작성 ${fmtDateTime(p.opensAt)}부터` };
  if (p.status === "closed") return { tone: "gray", text: "사전 작성 마감" };
  return { tone: "gray", text: "사전 작성 · 날짜 미정" };
}

// 활동 길(⑥)의 노드 하나: 색, 아래 설명, 누르면 갈 곳
type Node = { tone: "now" | "done" | "lock"; sub: string; href: string };
function nodeOf(eventId: string, a: Live): Node {
  const page =
    a.kind === "who" ? `/events/${eventId}/who/${a.id}`
    : a.kind === "worry" ? `/events/${eventId}/worry/${a.id}`
    : a.kind === "capsule" ? `/events/${eventId}/capsule/${a.id}`
    : "";
  if (a.participants === "selected" && !a.canJoin) return { tone: "lock", sub: "참여 대상이 아니에요", href: page };
  if (a.live.active || a.round || a.worry) return { tone: "now", sub: "지금 진행 중", href: page };
  if (a.pre.status === "open") return { tone: "now", sub: `작성 중 · ${fmtDateTime(a.pre.closesAt)}까지`, href: page };
  if (a.kind === "who" && a.guess.status === "open") return { tone: "now", sub: `맞히기 · ${fmtDateTime(a.guess.closesAt)}까지`, href: page };
  if (a.pre.status === "closed") return { tone: "done", sub: "사전 작성 마감", href: page };
  return { tone: "lock", sub: preBadge(a.pre).text, href: a.kind === "capsule" ? page : "" };
}
const NODE_ICON: Record<string, React.ReactNode> = {
  who: <IconQuestion />,
  worry: <IconChat />,
  capsule: <IconLock />,
};

// 활동 카드. 2초마다 서버 상태를 확인해서 진행자가 버튼을 누르면 회원 화면이 바로 켜진다.
// layout="path" 이면 목업 ⑥처럼 길 모양 노드만 보여 준다. 활동 박스(설명·시간·진행 상황)는 아이콘을 눌러 들어간 활동 화면 맨 위에 보인다(ActivityLiveBox).
export function LiveActivities({ eventId, layout = "cards" }: { eventId: string; layout?: "cards" | "path" }) {
  const [list, setList] = useState<Live[] | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ activities: Live[] }>(`/api/events/${eventId}/live`);
    if (r.ok) {
      setList(r.data.activities);
      setOffline(false);
    } else setOffline(true);
  }, [eventId]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") await load();
      if (!stop) timer = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [load]);

  if (!list) return null;
  if (list.length === 0) {
    return layout === "path" ? <div className="msg info">이 일정에는 아직 활동이 없어요. 정해지면 여기에 나타나요.</div> : null;
  }

  if (layout === "path") {
    const nodes = list.map((a) => ({ a, n: nodeOf(eventId, a) }));
    const firstNow = nodes.findIndex((x) => x.n.tone === "now");
    return (
      <>
        <section aria-label="활동 길" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {offline && <div className="msg info" role="status">연결이 불안정해요. 다시 연결하는 중이에요…</div>}
          <div className="path">
            {nodes.map(({ a, n }, i) => {
              const icon = NODE_ICON[a.kind] ?? <IconStar size={36} />;
              const label = `${a.name} · ${n.sub}`;
              return (
                <div key={a.id} className="nodewrap">
                  <div style={{ position: "relative" }}>
                    {i === firstNow && <span className="start" aria-hidden="true">시작!</span>}
                    {n.href ? (
                      <Link href={n.href} className={`node ${n.tone}`} aria-label={label}>{icon}</Link>
                    ) : (
                      <span className={`node ${n.tone}`} role="img" aria-label={label}>{icon}</span>
                    )}
                  </div>
                  <div className="nl" aria-hidden="true">{a.name}<small>{n.sub}</small></div>
                </div>
              );
            })}
          </div>
        </section>
        <TeamHostLinks list={list} />
      </>
    );
  }

  return (
    <section aria-label="활동" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>활동</b>
      {offline && <div className="msg info" role="status">연결이 불안정해요. 다시 연결하는 중이에요…</div>}
      {list.map((a) => <ActivityCard key={a.id} eventId={eventId} a={a} reload={load} />)}
    </section>
  );
}

// 조 진행자: 맡은 조를 진행하는 화면으로 가는 버튼(조별 진행이 켜진 활동만)
function TeamHostLinks({ list }: { list: Live[] }) {
  const mine = list.filter((a) => a.teamHost);
  if (mine.length === 0) return null;
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      {mine.map((a) => (
        <Link key={a.id} href={a.teamHost!.href} className="btn blue" style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>
          {a.teamHost!.name} 진행하기 · {a.name}
        </Link>
      ))}
    </div>
  );
}

// 일정 화면 맨 위 알림 줄: 현장 진행 중인 활동이 있으면 "들어가기"(누르면 그 활동 화면, 거기서 저예요·투표 등).
//  내 소개 차례에 "저예요" 버튼이 열렸으면 더 눈에 띄게 알려 준다. 10초마다(화면이 보일 때만) 확인한다.
export function LiveNowBanner({ eventId }: { eventId: string }) {
  const [list, setList] = useState<Live[]>([]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") {
        const r = await api<{ activities: Live[] }>(`/api/events/${eventId}/live`);
        if (r.ok && !stop) setList(r.data.activities);
      }
      if (!stop) timer = setTimeout(tick, 10_000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [eventId]);
  const now = list.filter((a) => a.round || a.worry || a.live.active);
  if (now.length === 0) return null;
  return (
    <>
      {now.map((a) => {
        const href = nodeOf(eventId, a).href;
        const mine = !!a.round && a.round.isTarget && a.round.screen === "iam_button" && a.round.state === "reveal" && !a.round.nameRevealed;
        // 현장 맞히기가 열렸으면 바로 맞히기 탭으로
        const pick = a.kind === "who" && a.live.unlocked && a.live.memberScreen === "pick_person" && a.canJoin && a.stepAllowed !== false;
        const to = href;
        const inner = (
          <>
            <span className="ic" aria-hidden="true">{mine ? "!" : "●"}</span>
            <span className="grow">
              <b>{mine ? "내 소개 차례예요! 들어가서 “저예요”를 눌러 주세요" : pick ? `누구일까요? 맞히기가 열렸어요 · ${a.name}` : `지금 현장 진행 중이에요 · ${a.name}`}</b>
              <span className="t">{href ? "들어가기 ›" : "진행자 안내를 기다려 주세요"}</span>
            </span>
          </>
        );
        return to
          ? <Link key={a.id} href={to} className={`fb ${mine ? "bad" : "info"}`} style={{ textDecoration: "none", alignItems: "center" }}>{inner}</Link>
          : <div key={a.id} className="fb info" style={{ alignItems: "center" }}>{inner}</div>;
      })}
    </>
  );
}

// 활동 화면 맨 위 박스: 이 활동의 설명·시간·참여 대상·진행 상황(진행자가 연 화면, 2진실 1거짓 라운드, 뽑힌 고민).
// 일정의 활동 길에서 아이콘을 눌러 들어오면 여기서 본다. 2초마다 진행 상황을 다시 읽는다.
export function ActivityLiveBox({ eventId, activityId }: { eventId: string; activityId: string }) {
  const [a, setA] = useState<Live | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ activities: Live[] }>(`/api/events/${eventId}/live`);
    if (r.ok) setA(r.data.activities.find((x) => x.id === activityId) ?? null);
  }, [eventId, activityId]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") await load();
      if (!stop) timer = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [load]);
  if (!a) return null;
  return <ActivityCard eventId={eventId} a={a} reload={load} inPage />;
}

// 활동 박스. inPage: 그 활동 화면 안에서 보일 때(같은 화면으로 가는 버튼은 빼고 내용만)
function ActivityCard({ eventId, a, reload: load, inPage }: { eventId: string; a: Live; reload: () => Promise<void>; inPage?: boolean }) {
        const b = preBadge(a.pre);
        return (
          <div key={a.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <b style={{ font: `700 ${fs(17)} var(--display)` }}>{a.name}</b>
              <span className={`pill ${b.tone}`}>{b.text}</span>
            </div>
            {/* 활동 안내: 접어 두고 펼쳐서 읽는다(쉬운 말 목록) */}
            {(a.guide?.length ?? 0) > 0 ? (
              <details>
                <summary className="small" style={{ cursor: "pointer", fontWeight: 700 }}>활동 안내 보기</summary>
                <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4, fontSize: fs(13), lineHeight: 1.6 }}>
                  {a.guide!.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              </details>
            ) : a.description && <span className="small">{a.description}</span>}
            {a.startsAt && (
              <span className="small">
                활동 시간: {fmtRange(a.startsAt, a.endsAt)}
              </span>
            )}
            {(a.teamName || (a.teamHost && !inPage)) && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {a.teamName && <span className="pill blue">조별 진행 · 내 조 {a.teamName}</span>}
                {/* 조 진행자 바로가기는 일정 화면(주요 활동 아래)에만. 활동 화면 안에서는 회원으로 참여한다 */}
                {a.teamHost && !inPage && (
                  <Link href={a.teamHost.href} className="btn blue" style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>{a.teamHost.name} 진행하기</Link>
                )}
              </div>
            )}
            {a.participants === "selected" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                <span className="pill warn">관리자가 선택한 회원만 참여</span>
                {!a.canJoin && <span className="small">이 활동에는 참여 대상으로 선택되지 않았어요. 관리자에게 문의해 주세요.</span>}
              </div>
            )}
            {!inPage && a.kind === "worry" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {a.pre.status === "open" ? (
                  <Link href={`/events/${eventId}/worry/${a.id}`} className="btn" style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>고민 작성하기</Link>
                ) : (
                  <Link href={`/events/${eventId}/worry/${a.id}`} className="btn white" style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>내 고민 보기</Link>
                )}
              </div>
            )}
            {!inPage && a.kind === "capsule" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                <Link href={`/events/${eventId}/capsule/${a.id}`} className={`btn ${a.live.unlocked && a.live.memberScreen === "write" && a.canJoin && a.stepAllowed !== false ? "" : "white"}`} style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>
                  {a.live.unlocked && a.live.memberScreen === "write" && a.canJoin && a.stepAllowed !== false ? "타임캡슐 작성하기" : "내 타임캡슐 보기"}
                </Link>
              </div>
            )}
            {!inPage && a.kind === "who" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {a.live.unlocked && a.live.memberScreen === "pick_person" && a.canJoin && a.stepAllowed !== false ? (
                  <Link href={`/events/${eventId}/who/${a.id}`} className="btn" style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>누구일까요? 맞히기</Link>
                ) : a.pre.status === "open" || a.guess.status === "open" || a.pre.status === "closed" ? (
                  <Link href={`/events/${eventId}/who/${a.id}`} className="btn" style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>
                    {a.pre.status === "open" ? "소개 작성하기" : a.guess.status === "open" ? "누구일까요? 맞히기" : "내 소개 보기"}
                  </Link>
                ) : (
                  <span className="small">작성 기간이 되면 여기에서 시작할 수 있어요.</span>
                )}
                {a.pre.status === "open" && a.guess.status === "open" && (
                  <Link href={`/events/${eventId}/who/${a.id}`} className="btn white" style={{ width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" }}>누구일까요?</Link>
                )}
              </div>
            )}
            {a.live.active && a.canJoin && a.stepAllowed === false ? (
              // 선택참여 회원: 지금 단계가 선별 조건에 없으면 기다림 안내. 할 수 있는 단계가 열리면(2초마다 확인) 바로 원래 화면으로 돌아간다.
              <PartialWait stepLabel={a.live.stepLabel} />
            ) : a.awards ? (
              <AwardsPanel awards={a.awards} teamName={a.teamName} />
            ) : a.round ? (
              <RoundPanel aid={a.id} round={a.round} reload={load} />
            ) : a.worry ? (
              <WorryPanel aid={a.id} w={a.worry} reload={load} />
            ) : (
              a.live.active && (
                <div className={`msg ${a.live.unlocked ? "" : "info"}`} role="status" style={a.live.unlocked ? { background: "var(--green-bg)", color: "var(--green-t)" } : undefined}>
                  지금 현장 진행 중이에요 · <b>{a.live.stepLabel}</b> 차례예요.{" "}
                  {a.live.unlocked ? SCREEN_NOTE[a.live.memberScreen] ?? "휴대폰 화면이 열렸어요." : "진행자가 열면 휴대폰 화면이 바뀌어요."}
                </div>
              )
            )}
          </div>
        );
}

// 선택참여 회원에게 허용되지 않은 단계가 열렸을 때의 차분한 기다림 카드(서버 lib/participants.ts PARTIAL_WAIT 와 같은 문구)
export function PartialWait({ stepLabel }: { stepLabel?: string }) {
  return (
    <div className="card" role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", textAlign: "center", padding: "18px 14px" }}>
      {stepLabel && <span className="pill gray">지금 단계 · {stepLabel}</span>}
      <b style={{ font: `700 ${fs(16)} var(--display)` }}>이번 단계는 전체참여 회원만 해요.</b>
      <span className="small">잠시 기다려 주세요. 참여할 수 있는 단계가 열리면 화면이 저절로 바뀌어요.</span>
    </div>
  );
}

/* ───── 나의 고민은?: 지금 뽑힌 고민 (회원 휴대폰) ───── */
function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function WorryPanel({ aid, w, reload }: { aid: string; w: Worry; reload: () => Promise<void> }) {
  const [now, setNow] = useState(() => Date.now());
  const [recvAt, setRecvAt] = useState(() => Date.now());
  const [err, setErr] = useState("");
  // 서버가 계산한 남은 시간을 받은 시점을 기억해 두고, 그 뒤로 흐른 시간만큼 화면에서 줄여 간다.
  // (휴대폰 시계가 서버와 달라도 영향이 없다.)
  useEffect(() => {
    setRecvAt(Date.now());
  }, [w.serverNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = w.paused || w.timeUp ? 0 : Math.max(0, now - recvAt);
  const remaining = Math.max(0, w.remainingMs - elapsed);

  async function selfReveal() {
    setErr("");
    const r = await api(`/api/worry/${aid}/reveal-self`, { body: {} });
    if (!r.ok) setErr(r.error);
    await reload();
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className="pill blue">{w.orderNo}번째 고민 · {w.category}</span>
        {w.isMine && <span className="pill warn">내 고민이에요</span>}
      </div>
      {!w.canJoin && <div className="msg info" role="status">이 활동의 참여 대상으로 선택되지 않았어요. 진행 모습은 큰 화면에서 볼 수 있어요.</div>}
      <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.7 }}>{w.body}</p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b className="num" style={{ font: `700 ${fs(28)} var(--display)` }} aria-label="남은 시간">{w.timeUp ? "00:00" : fmt(remaining)}</b>
        <span className="small">{w.timeUp ? "대화 시간이 끝났어요" : w.paused ? "일시정지 중" : "대화 중"}</span>
      </div>
      {w.nameRevealed && <div className="msg info" role="status">작성자: <b>{w.displayName}</b></div>}
      {w.tips.length > 0 && (
        <div className="card"><b>대화를 시작하는 관점</b><ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>{w.tips.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
      )}
      {err && <div className="msg bad" role="alert">{err}</div>}
      {w.canSelfReveal && <button className="btn white" type="button" onClick={selfReveal}>제가 쓴 고민이에요 (이름 밝히기)</button>}
    </div>
  );
}

/* ───── 현장 진행: 회원 휴대폰 화면 (진행자 버튼에 따라 바뀐다) ───── */
const STMT_COLOR = ["var(--red-bg)", "var(--chip)", "var(--soft)"];

function RoundPanel({ aid, round, reload }: { aid: string; round: Round; reload: () => Promise<void> }) {
  const [sel, setSel] = useState(-1);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 라운드가 바뀌면 선택을 비운다
  useEffect(() => {
    setSel(-1);
    setErr("");
  }, [round.id]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setErr("");
    const r = await api(path, { body });
    setBusy(false);
    if (!r.ok) setErr(r.error);
    await reload();
  }

  const votingOpen = round.screen === "vote" && round.state === "voting";
  const status =
    votingOpen ? { tone: "ok", text: "투표 중" }
    : round.state === "closed" || round.state === "answer" ? { tone: "gray", text: "마감" }
    : { tone: "warn", text: "대기 중" };

  const head = (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <span className="pill blue">지금 소개</span>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>“{round.alias}”</b>
      {round.nameRevealed && round.name && <span className="pill ok">{round.name} 님</span>}
      <span className="grow" />
      {round.canJoin && <span className={`pill ${status.tone}`} role="status">{status.text}</span>}
    </div>
  );

  // 문장 목록(번호 동그라미: 1 파랑, 2 노랑, 3 보라). pick 이 없으면 고를 수 없는 미리보기로 보여 준다.
  const stmtList = (pressed: number, pick?: (i: number) => void) => (
    <div className="pick" role={pick ? "radiogroup" : undefined} aria-label="거짓인 문장 고르기">
      {round.statements.map((t, i) => (
        <button
          key={i}
          type="button"
          className={`opt rowopt ${pick ? "" : "preview"}`}
          role={pick ? "radio" : undefined}
          aria-checked={pick ? pressed === i : undefined}
          aria-pressed={pressed === i}
          disabled={!pick || busy}
          onClick={pick ? () => pick(i) : undefined}
          style={{ minHeight: 72 }}
        >
          <span className="avatar" style={{ background: STMT_COLOR[i % 3] }}>{i + 1}</span>
          <span className="grow">{t}</span>
        </button>
      ))}
    </div>
  );

  // 현장 맞히기: 고르면 바로 저장(마감 전까지 바꿀 수 있다)
  async function guess(chosenMemberId: string) {
    await post(`/api/who/${aid}/guess`, { profileId: round.profileId, chosenMemberId });
  }
  const myGuessLine = round.myGuess ? <div className="msg info" role="status">내 선택: <b>{round.myGuess}</b></div> : null;

  let body: React.ReactNode;
  if (!round.canJoin) {
    body = <div className="msg info" role="status">이 활동은 관리자가 선택한 회원만 참여할 수 있어요. 진행 모습은 큰 화면에서 볼 수 있어요.</div>;
  } else if (round.flow && round.state === "guess") {
    body = round.isTarget ? (
      <div className="msg info" role="status">내 소개예요! 다른 조원들이 누구인지 맞히고 있어요. 들키지 않게 조용히 기다려 주세요.</div>
    ) : (
      <>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: fs(15) }}>{round.introMd}</p>
        <b style={{ font: `700 ${fs(18)} var(--display)` }}>이 분은 누구일까요?</b>
        <span className="small">{round.guessOpen ? "골라 주세요. 진행자가 마감하기 전까지 바꿀 수 있어요." : "진행자가 열면 고를 수 있어요."}</span>
        <div className="rows" role="radiogroup" aria-label={`${round.alias} 맞히기`}>
          {(round.candidates ?? []).map((c) => {
            const on = round.myGuessId === c.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} className="opt rowopt" disabled={busy || !round.guessOpen} onClick={() => guess(c.id)}
                style={{ minHeight: 52, padding: "8px 12px", ...(on ? { background: "var(--violet-bg)" } : {}) }}>
                <span className="grow" style={{ fontSize: fs(15), fontWeight: on ? 700 : 500, color: on ? "var(--violet-t)" : undefined }}>{c.name}</span>
                <span className="tick" aria-hidden="true" style={on ? { background: "var(--violet)", borderColor: "var(--violet)" } : undefined}>{on ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (round.flow && round.state === "guessed") {
    body = <>{!round.isTarget && myGuessLine}<div className="msg info" role="status">맞히기를 마감했어요. 다음 소개를 기다려 주세요. 정답은 모두 맞힌 뒤 “저예요”에서 공개돼요.</div></>;
  } else if (round.flow && round.state === "reveal" && !round.isTarget) {
    body = <>{myGuessLine}<div className="msg info" role="status">“{round.alias}”의 주인공은 누구일까요? 곧 “저예요”로 밝혀져요.</div></>;
  } else if (round.flow && round.state === "named") {
    body = round.isTarget ? (
      <div className="msg info" role="status">이름이 공개됐어요. 다음 차례를 기다려 주세요.</div>
    ) : (
      <>
        <div className="msg info" role="status">정답은 <b>{round.name}</b> 님이에요.</div>
        {round.guessRight === true ? (
          <div className="msg info" style={{ background: "var(--green-bg)", color: "var(--green-t)" }} role="status">맞혔어요! 🎉</div>
        ) : round.guessRight === false ? (
          <div className="msg info" role="status">아쉬워요. 내 선택은 {round.myGuess} 님이었어요.</div>
        ) : (
          <div className="msg info" role="status">이 소개는 고르지 않았어요.</div>
        )}
      </>
    );
  } else if (round.screen === "iam_button" && round.isTarget && round.state === "reveal") {
    body = (
      <>
        <div className="msg info">내 소개예요! 준비가 되면 아래 버튼을 눌러 주세요.</div>
        <button className="btn" type="button" disabled={busy || round.nameRevealed} onClick={() => post(`/api/who/${aid}/iam`, {})}>
          {round.nameRevealed ? "이름이 공개됐어요 ✓" : "저예요"}
        </button>
      </>
    );
  } else if (votingOpen) {
    body = round.isTarget ? (
      <div className="msg info">내 차례예요. 다른 분들이 투표하고 있어요. 투표는 하지 않아요.</div>
    ) : (
      <>
        <b style={{ font: `700 ${fs(18)} var(--display)` }}>거짓은 어느 것일까요?</b>
        <span className="small">두 개는 진실, 한 개는 거짓이에요. 한 번만 투표할 수 있어요.</span>
        {round.voted ? stmtList(round.myVote) : stmtList(sel, setSel)}
        {round.voted ? (
          <div className="msg info" role="status">{round.myVote + 1}번에 투표했어요. 결과를 기다려 주세요.</div>
        ) : (
          <button className="btn" type="button" disabled={busy || sel < 0} onClick={() => post(`/api/who/${aid}/vote`, { chosenIndex: sel })}>확인</button>
        )}
      </>
    );
  } else if (round.state === "voting" && round.statements.length > 0 && !round.isTarget) {
    // 문장은 내려왔지만 진행자가 아직 회원 화면의 투표를 켜지 않은 경우: 미리 읽기만 할 수 있다.
    body = (
      <>
        <b style={{ font: `700 ${fs(18)} var(--display)` }}>거짓은 어느 것일까요?</b>
        <span className="small">두 개는 진실, 한 개는 거짓이에요.</span>
        {stmtList(-1)}
        <button className="btn" type="button" disabled>확인</button>
        <p className="hint center" role="status">진행자가 투표를 열면 선택할 수 있어요.</p>
      </>
    );
  } else if (round.state === "closed") {
    body = (
      <>
        {round.statements.length > 0 && !round.isTarget && stmtList(round.voted ? round.myVote : -1)}
        <div className="msg info" role="status">투표가 마감됐어요. 정답 공개를 기다려 주세요.{round.voted ? ` (내 선택: ${round.myVote + 1}번)` : ""}</div>
      </>
    );
  } else if (round.state === "answer" && round.lieIndex >= 0) {
    body = (
      <>
        <div className="pick">
          {round.statements.map((t, i) => (
            <div key={i} className="card row" style={{ alignItems: "flex-start", ...(i === round.lieIndex ? { borderColor: "var(--green)", background: "var(--green-bg)" } : round.myVote === i ? { borderColor: "var(--red)" } : {}) }}>
              <span className="avatar" style={{ background: STMT_COLOR[i % 3] }}>{i + 1}</span>
              <div className="grow">
              <b>{t}</b>
              <div className="small">{i === round.lieIndex ? "거짓이었어요!" : "진실이에요"}{round.myVote === i ? " · 내 선택" : ""}</div>
              </div>
            </div>
          ))}
        </div>
        {round.isTarget ? null : round.correct === true ? (
          <div className="msg info" style={{ background: "var(--green-bg)", color: "var(--green-t)" }} role="status">맞혔어요! 🎉</div>
        ) : round.voted ? (
          <div className="msg info" role="status">아쉬워요. 다음에는 맞힐 수 있어요.</div>
        ) : (
          <div className="msg info" role="status">투표하지 않았어요.</div>
        )}
      </>
    );
  } else {
    body = <div className="msg info" role="status">진행자가 진행하고 있어요. 화면을 켜 두고 기다려 주세요.</div>;
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      {head}
      {err && <div className="msg bad" role="alert">{err}</div>}
      {body}
    </div>
  );
}

/* ───── 현장 맞히기 흐름: 시상(내 조의 추측왕·직감왕) ───── */
function AwardsPanel({ awards, teamName }: { awards: { A: Award; B: Award }; teamName?: string }) {
  const one = (title: string, what: string, unit: string, a: Award) => (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", textAlign: "center", padding: "14px 12px" }}>
      <span className="small">{what}</span>
      <b style={{ font: `800 ${fs(20)} var(--display)` }}>{title}</b>
      {a.score === 0 ? (
        <span className="small">맞힌 분이 없어요.</span>
      ) : a.winner ? (
        <>
          <span aria-hidden="true" style={{ fontSize: fs(32) }}>🏆</span>
          <b style={{ font: `800 ${fs(22)} var(--display)` }}>{a.winner} 님</b>
          <span className="small num">{a.score}{unit} 맞혔어요</span>
        </>
      ) : (
        <span className="small">{a.score}{unit}로 동점이에요({a.tied.join(", ")}). 진행자가 룰렛을 돌리고 있어요.</span>
      )}
    </div>
  );
  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>{teamName ? `${teamName} 시상` : "시상"}</b>
      {one("추측왕", "누구인지 가장 많이 맞힌 사람", "명", awards.A)}
      {one("직감왕", "거짓을 가장 많이 맞힌 사람", "개", awards.B)}
    </div>
  );
}
