"use client";

import { ActivitySaju } from "@/components/ActivitySaju";
import { use, useCallback, useEffect, useState } from "react";
import { ActivityLiveBox } from "@/components/LiveActivities";
import { useRouter } from "next/navigation";
import { IconLock } from "@/components/Icons";
import { LessonHeader } from "@/components/LessonHeader";
import { Mascot } from "@/components/Mascot";
import { api, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type Data = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  canJoin: boolean;
  canWrite: boolean;
  team: { id: string; name: string; members: string[] } | null;
  openAt: string;
  opened: boolean;
  hasGoal: boolean;
  hasPact: boolean;
  content: null | { goal: string; pacts: string[] };
};

// 타임캡슐: 1년 뒤 목표(나만 볼 수 있어요)와 팀 약속 2가지.
// 열림 일시 전에는 서버가 내용을 내려주지 않으므로, 이 화면에서도 쓴 내용을 다시 볼 수 없다.
export default function CapsulePage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [goal, setGoal] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/capsule/${aid}`);
    if (r.ok) setD(r.data);
    else if (r.status === 401) router.replace("/");
    else setNote({ tone: "bad", text: r.error });
  }, [aid, router]);

  // 진행자가 작성을 열고 닫는 것을 따라가도록 2초마다 확인한다.
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") await load();
      if (!stop) t = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [load]);

  async function save(what: "goal" | "pacts") {
    setBusy(true);
    setNote(null);
    const body = what === "goal" ? { goal } : { pacts: [p1, p2] };
    const r = await api(`/api/capsule/${aid}`, { method: "PUT", body });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: what === "goal" ? "목표를 봉인함에 넣었어요. 열림 전에는 아무도 볼 수 없어요." : "팀 약속을 저장했어요. 팀원 누구나 열림 전까지 고칠 수 있어요." });
    if (what === "goal") setGoal("");
    await load();
  }

  if (!d) return <main className="app">{note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>}</main>;

  const state = d.opened ? { tone: "ok", text: "열렸어요" } : d.canWrite ? { tone: "ok", text: "작성 중" } : { tone: "gray", text: "작성 대기" };
  const done = (d.hasGoal ? 1 : 0) + (d.hasPact ? 1 : 0);

  return (
    <main className="app">
      <LessonHeader href={`/events/${id}`} closeLabel="일정으로 돌아가기" title={d.activity.name} done={d.opened ? undefined : done} total={d.opened ? undefined : 2}
        right={<span className={`chip ${state.tone === "ok" ? "violet" : "line"}`}>{state.text}</span>} />
      {/* 이 활동의 설명·시간·진행 상황(일정의 활동 길에서 아이콘을 눌러 들어옴) */}
      <ActivityLiveBox eventId={id} activityId={aid} />
      {/* 기능 블록: 명리학 사주풀이(넣은 활동이고 여는 시점일 때만 보임) */}
      <ActivitySaju aid={aid} />
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <div className={`fb ${d.opened ? "good" : "info"}`}>
        <span className="ic" aria-hidden="true"><IconLock size={16} /></span>
        <div>
          <b>{d.opened ? "타임캡슐이 열렸어요" : d.openAt ? `${fmtDateTime(d.openAt)}에 열려요` : "열림 날짜가 정해지면 알려 드려요"}</b>
          <span className="t">{d.opened ? "함께 확인해 보세요." : "열리기 전에는 누구도 볼 수 없어요."}</span>
        </div>
      </div>

      {d.team ? (
        <div className="card row" style={{ padding: "10px 12px", gap: 10 }}>
          <Mascot size={32} />
          <div className="grow" style={{ minWidth: 0 }}>
            <b style={{ fontSize: fs(14) }}>{d.team.name}</b>
            <div className="small" style={{ fontSize: fs(12) }}>{d.team.members.join(", ")}</div>
          </div>
          <span className="chip gray num">{d.team.members.length}명</span>
        </div>
      ) : (
        <div className="msg info">아직 팀이 정해지지 않았어요. 팀이 정해지면 팀 약속을 쓸 수 있어요.</div>
      )}

      {!d.canJoin && <div className="msg info">이 활동은 관리자가 선택한 회원만 참여할 수 있어요.</div>}

      {d.opened && d.content && (
        <>
          <section className="lcard" aria-labelledby="c-o1">
            <header className="lcard-h"><h2 id="c-o1">나의 1년 뒤 목표</h2></header>
            <div className="lcard-b"><p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: fs(14), lineHeight: 1.65 }}>{d.content.goal || "작성하지 않았어요."}</p></div>
          </section>
          <section className="lcard" aria-labelledby="c-o2">
            <header className="lcard-h"><h2 id="c-o2">우리 팀 약속</h2></header>
            <div className="lcard-b">
              {d.content.pacts.length === 0 ? <p className="small" style={{ margin: 0 }}>작성하지 않았어요.</p> : <ol style={{ margin: 0, paddingLeft: 20, fontSize: fs(14), lineHeight: 1.65 }}>{d.content.pacts.map((p, i) => <li key={i}>{p}</li>)}</ol>}
            </div>
          </section>
        </>
      )}

      {!d.opened && (
        <>
          {!d.canWrite && d.canJoin && (
            <div className="msg info" role="status">진행자가 “타임캡슐 작성하기”를 열면 쓸 수 있어요. 이 화면을 켜 두세요.</div>
          )}
          {d.content?.goal && <div className="card" style={{ padding: "12px 14px" }}><b style={{ fontSize: fs(14) }}>내가 쓴 목표 <span className="chip gray">관리자가 확인을 허용했어요</span></b><p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0", fontSize: fs(14) }}>{d.content.goal}</p></div>}

          {d.canJoin && (
            <>
              <section className="lcard" aria-labelledby="c-h1" aria-disabled={!d.canWrite}>
                <header className="lcard-h">
                  <h2 id="c-h1">나의 1년 뒤 목표 {d.hasGoal && <span className="chip violet">봉인됨 ✓</span>}</h2>
                  <p>나만 볼 수 있어요. 봉인하면 열림 일시 전에는 나도 다시 볼 수 없어요.{d.hasGoal ? " 다시 쓰면 이전 내용을 대신해요." : ""}</p>
                </header>
                <div className="lcard-b">
                  <div>
                    <label className="l" htmlFor="c-goal">목표</label>
                    <textarea id="c-goal" className="field" rows={4} style={{ padding: 10, fontSize: fs(15) }} maxLength={1000} value={goal} disabled={!d.canWrite} onChange={(e) => setGoal(e.target.value)} />
                  </div>
                </div>
                <div className="lcard-f" style={{ justifyContent: "flex-end" }}>
                  <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 44, fontSize: fs(14) }} disabled={busy || !d.canWrite || !goal.trim()} onClick={() => save("goal")}>목표 봉인하기</button>
                </div>
              </section>
              <section className="lcard" aria-labelledby="c-h2" aria-disabled={!d.canWrite}>
                <header className="lcard-h">
                  <h2 id="c-h2">우리 팀 약속 2가지 {d.hasPact && <span className="chip violet">저장됨 ✓</span>}</h2>
                  <p>{d.team ? "팀원이 함께 정해요. 저장하면 팀 이름과 구성원이 함께 남아요." : "팀이 정해진 뒤에 쓸 수 있어요."}</p>
                </header>
                <div className="lcard-b">
                  <div>
                    <label className="l" htmlFor="c-p1">약속 1</label>
                    <input id="c-p1" className="field" maxLength={200} value={p1} disabled={!d.team || !d.canWrite} onChange={(e) => setP1(e.target.value)} />
                  </div>
                  <div>
                    <label className="l" htmlFor="c-p2">약속 2</label>
                    <input id="c-p2" className="field" maxLength={200} value={p2} disabled={!d.team || !d.canWrite} onChange={(e) => setP2(e.target.value)} />
                  </div>
                </div>
                <div className="lcard-f" style={{ justifyContent: "flex-end" }}>
                  <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 44, fontSize: fs(14) }} disabled={busy || !d.canWrite || !d.team || !p1.trim() || !p2.trim()} onClick={() => save("pacts")}>팀 약속 저장하기</button>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
