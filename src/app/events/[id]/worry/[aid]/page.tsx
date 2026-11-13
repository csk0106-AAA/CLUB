"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LessonHeader } from "@/components/LessonHeader";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";

type Mine = { id: string; body: string; category: string; anonymous: boolean; drawn: boolean };
type Data = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  pre: { status: string; opensAt: string; closesAt: string };
  max: number;
  categories: string[];
  canJoin: boolean;
  mine: Mine[];
};
const WHEN: Record<string, string> = {
  before: "아직 작성 기간이 아니에요.", closed: "작성 기간이 끝났어요.", unknown: "행사 날짜가 정해지면 작성 기간이 열려요.", none: "이 활동에는 사전 작성이 없어요.",
};

// 고민(또는 조언을 구하고 싶은 질문) 작성. 익명/실명은 작성할 때 미리 정한다.
export default function WorryPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // null: 새로 쓰기
  const [body, setBody] = useState("");
  const [cat, setCat] = useState("경영");
  const [anon, setAnon] = useState<boolean | null>(null); // null: 아직 고르지 않음(새 고민은 꼭 골라야 저장)

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
    const payload = { body, category: cat, anonymous: anon };
    const r = edit ? await api(`/api/worry/${aid}/${edit}`, { method: "PATCH", body: payload }) : await api(`/api/worry/${aid}`, { body: payload });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: edit ? "고쳤어요." : "저장했어요. 뽑히기 전에는 아무에게도 보이지 않아요." });
    reset();
    load();
  }

  async function remove(m: Mine) {
    if (!window.confirm("이 고민을 지울까요?")) return;
    const r = await api(`/api/worry/${aid}/${m.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!d) return <main className="app">{note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>}</main>;
  const open = d.pre.status === "open" && d.canJoin;

  return (
    <main className="app">
      <LessonHeader href={`/events/${id}`} closeLabel="행사로 돌아가기"
        right={d.canJoin ? <span className={`pill ${d.mine.length ? "ok" : "gray"}`}>{d.mine.length ? `${d.mine.length}개 작성 ✓` : "아직 없음"}</span> : undefined} />
      <div className="row"><Mascot size={52} /><h1 className="title" style={{ fontSize: 24 }}>{d.activity.name}</h1></div>
      <p className="small" style={{ margin: 0 }}>고민이나 조언을 구하고 싶은 질문을 <b>1개 이상, 최대 {d.max}개</b>까지 적어 주세요. 꼭 {d.max}개를 다 쓰지 않아도 돼요. 고민마다 <b>실명</b>과 <b>익명</b>을 따로 고를 수 있어요. 행사에서 뽑힌 고민은 큰 화면에 내용만 먼저 나오고, 실명 고민은 사회자가 이름을 공개해요. 익명 고민은 “익명”으로 나오고, 원하면 그때 직접 밝힐 수 있어요.</p>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {!d.canJoin && <div className="msg info" role="status">이 활동은 관리자가 선택한 회원만 고민을 쓸 수 있어요. 참여 대상이 아니라면 고민은 쓰지 않고, 프로필 북에 실릴 소개만 작성해 주세요.</div>}
      {d.canJoin && !open && <div className="msg info">{WHEN[d.pre.status]}{d.pre.opensAt ? ` 작성 기간은 ${d.pre.opensAt} ~ ${d.pre.closesAt} 예요.` : ""}</div>}

      {d.mine.length > 0 && (
        <section aria-label="내 고민" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: "400 20px var(--display)" }}>내가 쓴 고민 {d.mine.length}개 <span className="small">(최대 {d.max}개)</span></b>
          {d.mine.map((m) => (
            <div key={m.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {open && !m.drawn ? (
                  <select className="field" aria-label="이 고민의 카테고리" value={m.category} disabled={busy}
                    style={{ width: "auto", minHeight: 40, padding: "0 10px", fontSize: 16, borderRadius: 12 }}
                    onChange={(e) => setCatOf(m, e.target.value)}>
                    {d.categories.map((c) => <option key={c}>{c}</option>)}
                    {!d.categories.includes(m.category) && <option>{m.category}</option>}
                  </select>
                ) : (
                  <span className="pill blue">{m.category}</span>
                )}
                {open && !m.drawn ? (
                  <span className="row" role="group" aria-label="이 고민의 이름 공개 방식" style={{ gap: 6 }}>
                    <button type="button" className="mini" aria-pressed={!m.anonymous} disabled={busy} onClick={() => setAnonOf(m, false)}
                      style={!m.anonymous ? { borderColor: "var(--green)", background: "var(--green-bg)", color: "var(--green-t)" } : undefined}>
                      {!m.anonymous ? "✓ " : ""}실명
                    </button>
                    <button type="button" className="mini" aria-pressed={m.anonymous} disabled={busy} onClick={() => setAnonOf(m, true)}
                      style={m.anonymous ? { borderColor: "var(--blue)", background: "var(--blue-bg)", color: "var(--blue-t)" } : undefined}>
                      {m.anonymous ? "✓ " : ""}익명
                    </button>
                  </span>
                ) : (
                  <span className={`pill ${m.anonymous ? "gray" : "ok"}`}>{m.anonymous ? "익명" : "실명"}</span>
                )}
                {m.drawn && <span className="pill warn">이미 뽑혔어요</span>}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.body}</p>
              {open && !m.drawn && (
                <div className="row">
                  <button className="mini" type="button" onClick={() => { setEdit(m.id); setBody(m.body); setCat(m.category); setAnon(m.anonymous); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}>수정</button>
                  <button className="mini danger" type="button" onClick={() => remove(m)}>삭제</button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {open && (edit !== null || d.mine.length < d.max) && (
        <form className="card" onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <b style={{ font: "400 20px var(--display)" }}>{edit ? "고민 수정" : "새 고민 쓰기"}</b>
          <div>
            <label className="l" htmlFor="w-body">고민 또는 조언을 구하고 싶은 질문</label>
            <textarea id="w-body" className="field" rows={5} style={{ padding: 12, lineHeight: 1.6 }} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
            <span className="hint">{body.length}/500자</span>
          </div>
          <div>
            <label className="l" htmlFor="w-cat">카테고리</label>
            <select id="w-cat" className="field" value={cat} onChange={(e) => setCat(e.target.value)}>
              {d.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="l">이 고민의 이름 공개 방식 (꼭 골라 주세요)</legend>
            <div className="pick">
              <button type="button" className="opt" aria-pressed={anon === false} onClick={() => setAnon(false)}><span className="name">{anon === false ? "✓ " : ""}실명으로</span><span className="small">사회자가 이름을 공개해요</span></button>
              <button type="button" className="opt" aria-pressed={anon === true} onClick={() => setAnon(true)}><span className="name">{anon === true ? "✓ " : ""}익명으로</span><span className="small">“익명”으로 나오고, 원하면 그때 직접 밝힐 수 있어요</span></button>
            </div>
          </fieldset>
          <div className="row">
            <button className="btn" type="submit" disabled={busy || body.trim().length < 2 || anon === null}>{edit ? "저장" : "저장하기"}</button>
            {edit && <button className="btn white" type="button" onClick={reset}>취소</button>}
          </div>
        </form>
      )}

      {/* 다 썼으면 여기서 마무리: 고민은 저장할 때마다 이미 저장돼 있다 */}
      {d.mine.length > 0 && edit === null && (
        <div className="footer-actions">
          <div className="fb good">
            <span className="ic" aria-hidden="true">✓</span>
            <div>
              <b>고민 {d.mine.length}개가 저장돼 있어요</b>
              <span className="t">따로 제출하지 않아도 돼요. {open ? `작성 기간(${d.pre.closesAt}까지)에는 다시 들어와 고치거나 더 쓸 수 있어요.` : "뽑히기 전까지는 아무에게도 보이지 않아요."}</span>
            </div>
          </div>
          <button className="btn" type="button" onClick={() => router.push(`/events/${id}`)}>작성 완료 · 행사로 돌아가기</button>
        </div>
      )}
    </main>
  );
}
