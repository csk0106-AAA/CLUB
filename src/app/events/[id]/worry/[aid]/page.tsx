"use client";

import { ActionNote, type ActionMsg } from "@/components/ActionNote";
import { ActivitySaju } from "@/components/ActivitySaju";
import { use, useCallback, useEffect, useState, useRef } from "react";
import { ActivityLiveBox, PartialWait } from "@/components/LiveActivities";
import { useRouter } from "next/navigation";
import { LessonHeader } from "@/components/LessonHeader";
import { Mascot } from "@/components/Mascot";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type Mine = { id: string; body: string; category: string; anonymous: boolean; drawn: boolean };
type Data = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  pre: { status: string; opensAt: string; closesAt: string };
  max: number;
  categories: string[];
  canJoin: boolean;
  actionOk?: boolean; // 선택참여 회원이 고민 쓰기를 하는지
  mine: Mine[];
};
const WHEN: Record<string, string> = {
  before: "아직 작성 기간이 아니에요.", closed: "작성 기간이 끝났어요.", unknown: "일정 날짜가 정해지면 작성 기간이 열려요.", none: "이 활동에는 사전 작성이 없어요.",
};

// 고민(또는 조언을 구하고 싶은 질문) 작성. 익명/실명은 작성할 때 미리 정한다.
export default function WorryPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<ActionMsg>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // null: 새로 쓰기
  const [body, setBody] = useState("");
  const [cat, setCat] = useState("경영");
  const [anon, setAnon] = useState<boolean | null>(null); // null: 아직 고르지 않음(새 고민은 꼭 골라야 저장)
  // 받아 적은 글 다듬기(AI): 저장을 누르면 먼저 다듬어 보여 주고, 읽어 본 뒤 [이대로 저장]
  const [polishing, setPolishing] = useState(false);
  const [checked, setChecked] = useState(""); // 다듬기를 거친(또는 고칠 것이 없던) 글
  const [before, setBefore] = useState<string | null>(null); // 다듬기 전 글
  const [pmsg, setPmsg] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // 고민 칸: 글이 길어지면 아래로 커진다(화면 높이의 60%까지)
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 4, Math.round(window.innerHeight * 0.6))}px`;
  }, [body]);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/worry/${aid}`);
    if (r.ok) setD(r.data);
    else if (r.status === 401) router.replace("/");
    else setNote({ tone: "bad", text: r.error });
  }, [aid, router]);
  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setEdit(null);
    setBody("");
    setChecked("");
    setBefore(null);
    setPmsg("");
    setCat(d?.categories[0] ?? "경영");
    setAnon(null);
  }

  // 이미 쓴 고민의 실명/익명·카테고리를 카드에서 바로 바꾼다(뽑히기 전까지).
  async function updateWorry(m: Mine, patch: { anonymous?: boolean; category?: string }, done: string) {
    setBusy(true);
    setNote(null);
    const r = await api(`/api/worry/${aid}/${m.id}`, {
      method: "PATCH",
      body: { body: m.body, category: patch.category ?? m.category, anonymous: patch.anonymous ?? m.anonymous },
    });
    setBusy(false);
    setNote(r.ok ? { tone: "info", text: done } : { tone: "bad", text: r.error });
    load();
  }
  const setAnonOf = (m: Mine, anonymous: boolean) =>
    m.anonymous !== anonymous && updateWorry(m, { anonymous }, anonymous ? "이 고민을 익명으로 바꿨어요." : "이 고민을 실명으로 바꿨어요.");
  const setCatOf = (m: Mine, category: string) =>
    m.category !== category && updateWorry(m, { category }, `카테고리를 “${category}”(으)로 바꿨어요.`);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (anon === null) return;
    setBusy(true);
    setNote(null);
    // 아직 다듬기를 거치지 않은 글이면 먼저 다듬어 보여 준다(고칠 것이 없거나 AI를 못 쓰면 바로 저장)
    if (body !== checked) {
      setPolishing(true);
      const p = await api<{ text: string; changed: boolean }>("/api/ai/polish", { body: { text: body, question: "모임에서 함께 이야기 나눌 고민 또는 조언을 구하고 싶은 질문" } });
      setPolishing(false);
      if (p.ok) {
        setChecked(p.data.text);
        if (p.data.changed && p.data.text.length <= 500) {
          setBefore(body);
          setBody(p.data.text);
          setPmsg("문맥에 맞게 오타를 다듬었어요. 한 번 읽어 보고, 고칠 곳은 고친 뒤 [이대로 저장]을 눌러 주세요.");
          return setBusy(false);
        }
      } else setChecked(body);
    }
    const payload = { body, category: cat, anonymous: anon };
    // 고치던 고민이 그새 지워졌으면(목록에 없음) 새 고민으로 저장한다
    const target = edit && d?.mine.some((m) => m.id === edit) ? edit : null;
    const r = target ? await api(`/api/worry/${aid}/${target}`, { method: "PATCH", body: payload }) : await api(`/api/worry/${aid}`, { body: payload });
    setBusy(false);
    // 결과는 저장 버튼 바로 아래에(위쪽에 나오면 눌러도 반응이 없는 것처럼 보인다)
    if (!r.ok) return setNote({ tone: "bad", text: r.error, at: "bottom" });
    setNote({ tone: "info", text: target ? "고쳤어요." : "저장했어요. 뽑히기 전에는 아무에게도 보이지 않아요.", at: "bottom" });
    reset();
    load();
  }

  async function remove(m: Mine) {
    if (!window.confirm("이 고민을 지울까요?")) return;
    const r = await api(`/api/worry/${aid}/${m.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    if (r.ok && edit === m.id) reset(); // 고치던 고민을 지웠으면 입력 칸도 비운다
    load();
  }

  if (!d) return <main className="app">{note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>}</main>;
  const partial = d.canJoin && d.actionOk === false; // 선택참여로 고민 쓰기가 선별 조건에 없음
  const open = d.pre.status === "open" && d.canJoin && !partial;

  return (
    <main className="app">
      <LessonHeader href={`/events/${id}`} closeLabel="일정으로 돌아가기" title={d.activity.name}
        right={d.canJoin ? <span className={`chip ${d.mine.length ? "violet" : "line"}`}>{d.mine.length ? `${d.mine.length}개 작성 ✓` : "아직 없음"}</span> : undefined} />
      {/* 이 활동의 설명·시간·진행 상황(일정의 활동 길에서 아이콘을 눌러 들어옴) */}
      <ActivityLiveBox eventId={id} activityId={aid} />
      {/* 기능 블록: 명리학 사주풀이(넣은 활동이고 여는 시점일 때만 보임) */}
      <ActivitySaju aid={aid} />
      <div className="say">
        <Mascot size={32} />
        <p className="lead">조언을 구하고 싶은 고민을 <b>최대 {d.max}개</b>까지 적어 주세요. 고민마다 <b>실명</b>이나 <b>익명</b>을 고를 수 있어요.</p>
      </div>
      <ActionNote msg={note} />
      {!d.canJoin && <div className="msg info" role="status">이 활동은 관리자가 선택한 회원만 고민을 쓸 수 있어요. 참여 대상이 아니라면 고민은 쓰지 않고, 프로필 북에 실릴 소개만 작성해 주세요.</div>}
      {partial && <PartialWait />}
      {d.canJoin && !partial && !open && <div className="msg info">{WHEN[d.pre.status]}{d.pre.opensAt ? ` 작성 기간은 ${fmtDateTime(d.pre.opensAt)}부터 ${fmtDateTime(d.pre.closesAt)}까지예요.` : ""}</div>}

      {d.mine.length > 0 && (
        <section aria-labelledby="w-mine" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 id="w-mine" className="h3">내가 쓴 고민 {d.mine.length}개 <span className="small" style={{ fontWeight: 400, fontSize: fs(12) }}>최대 {d.max}개</span></h2>
          {/* 한 덩어리 목록 안의 줄(목업 C): 칩 줄 · 본문 · 수정/삭제 */}
          <ul className="rows">
          {d.mine.map((m) => (
            <li key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 12px" }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {open && !m.drawn ? (
                  <select className="field" aria-label="이 고민의 카테고리" value={m.category} disabled={busy}
                    style={{ width: "auto", minHeight: 36, padding: "0 8px", fontSize: fs(13), borderRadius: 6 }}
                    onChange={(e) => setCatOf(m, e.target.value)}>
                    {d.categories.map((c) => <option key={c}>{c}</option>)}
                    {!d.categories.includes(m.category) && <option>{m.category}</option>}
                  </select>
                ) : (
                  <span className="chip violet">{m.category}</span>
                )}
                {open && !m.drawn ? (
                  <div className="seg" role="group" aria-label="이 고민의 이름 공개 방식" style={{ width: 120, flex: "none" }}>
                    <button type="button" aria-pressed={!m.anonymous} disabled={busy} onClick={() => setAnonOf(m, false)} style={{ minHeight: 36, fontSize: fs(13) }}>실명</button>
                    <button type="button" aria-pressed={m.anonymous} disabled={busy} onClick={() => setAnonOf(m, true)} style={{ minHeight: 36, fontSize: fs(13) }}>익명</button>
                  </div>
                ) : (
                  <span className={`chip ${m.anonymous ? "gray" : "violet"}`}>{m.anonymous ? "익명" : "실명"}</span>
                )}
                {m.drawn && <span className="chip warn">이미 뽑혔어요</span>}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: fs(14), lineHeight: 1.6 }}>{m.body}</p>
              {open && !m.drawn && (
                <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                  <button className="mini" type="button" onClick={() => { setEdit(m.id); setBody(m.body); setCat(m.category); setAnon(m.anonymous); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}>수정</button>
                  <button className="mini danger" type="button" onClick={() => remove(m)}>삭제</button>
                </div>
              )}
            </li>
          ))}
          </ul>
        </section>
      )}

      {open && (edit !== null || d.mine.length < d.max) && (
        <form className="lcard" onSubmit={save} aria-labelledby="w-form-h">
          <header className="lcard-h"><h2 id="w-form-h">{edit ? "고민 수정" : "새 고민 쓰기"}</h2></header>
          <div className="lcard-b">
          <div>
            <label className="l" htmlFor="w-body">고민 또는 조언을 구하고 싶은 질문</label>
            <textarea id="w-body" ref={bodyRef} className="field" rows={5} style={{ padding: 10, lineHeight: 1.6, fontSize: fs(16), minHeight: 130, resize: "vertical" }} maxLength={500} value={body} readOnly={polishing} onChange={(e) => setBody(e.target.value)} />
            <span className="hint num" style={{ fontSize: fs(12), display: "block", textAlign: "right" }}>{body.length}/500자</span>
            {(polishing || pmsg) && <p className="small" role="status" style={{ margin: "4px 0 0", color: before !== null ? "var(--accent-ink)" : undefined }}>{polishing ? "AI가 문맥을 보고 오타를 다듬는 중이에요…" : pmsg}</p>}
            {before !== null && <button className="mini" type="button" style={{ marginTop: 6 }} disabled={busy || polishing} onClick={() => { setBody(before); setBefore(null); setPmsg("다듬기 전 글로 되돌렸어요."); }}>다듬기 전으로</button>}
            <span className="hint" style={{ fontSize: fs(12), display: "block", marginTop: 6 }}>키보드의 🎤 버튼으로 말해서 적을 수도 있어요. 큰 화면에 나오니 실명이나 회사 이름은 쓰지 않는 게 좋아요.</span>
          </div>
          <div>
            <label className="l" htmlFor="w-cat">카테고리</label>
            <select id="w-cat" className="field" value={cat} onChange={(e) => setCat(e.target.value)}>
              {d.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="l">이 고민의 이름 공개 방식 (꼭 골라 주세요)</legend>
            <div className="rows">
              <button type="button" className="opt rowopt" aria-pressed={anon === false} onClick={() => setAnon(false)} style={{ padding: "10px 12px" }}>
                <span className="grow"><span className="name" style={{ fontSize: fs(14) }}>실명으로</span><span className="small" style={{ fontSize: fs(12) }}>진행자가 이름을 공개해요</span></span>
                <span className="tick" aria-hidden="true" />
              </button>
              <button type="button" className="opt rowopt" aria-pressed={anon === true} onClick={() => setAnon(true)} style={{ padding: "10px 12px" }}>
                <span className="grow"><span className="name" style={{ fontSize: fs(14) }}>익명으로</span><span className="small" style={{ fontSize: fs(12) }}>“익명”으로 나오고, 원하면 그때 직접 밝힐 수 있어요</span></span>
                <span className="tick" aria-hidden="true" />
              </button>
            </div>
          </fieldset>
          </div>
          <div className="lcard-f" style={{ justifyContent: "flex-end" }}>
            {edit && <button className="btn white" type="button" onClick={reset} style={{ width: "auto", minWidth: 80, minHeight: 44, fontSize: fs(14) }}>취소</button>}
            <button className="btn" type="submit" disabled={busy || polishing || body.trim().length < 2 || anon === null} style={{ width: "auto", minWidth: 120, minHeight: 44, fontSize: fs(14) }}>{polishing ? "다듬는 중…" : before !== null && body === checked ? "이대로 저장" : edit ? "저장" : "저장하기"}</button>
          </div>
        </form>
      )}
      {/* 저장 결과: 저장 버튼 바로 아래(저장하면 입력 칸이 비워지므로 여기서 알려 준다) */}
      <ActionNote msg={note} at="bottom" />

      {/* 다 썼으면 여기서 마무리: 고민은 저장할 때마다 이미 저장돼 있다 */}
      {d.mine.length > 0 && edit === null && (
        <div className="footer-actions">
          <div className="fb good">
            <span className="ic" aria-hidden="true">✓</span>
            <div>
              <b>고민 {d.mine.length}개가 저장돼 있어요</b>
              <span className="t">따로 제출하지 않아도 돼요. {open ? `작성 기간(${fmtDateTime(d.pre.closesAt)}까지)에는 다시 들어와 고치거나 더 쓸 수 있어요.` : "뽑히기 전까지는 아무에게도 보이지 않아요."}</span>
            </div>
          </div>
          <button className="btn" type="button" onClick={() => router.push(`/events/${id}`)}>작성 완료 · 일정으로 돌아가기</button>
        </div>
      )}
    </main>
  );
}
