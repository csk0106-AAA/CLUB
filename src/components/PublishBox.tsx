"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { AudiencePicker } from "@/components/AudiencePicker";
import { DateField } from "@/components/DateField";
import type { PostDetail } from "@/components/board/types";
import type { Audience } from "@/lib/audience";
import { api, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

// 관리 화면(회비관리·회칙·클럽 회비)의 "게시글 업로드": 저장된 내용을 게시판 글로 올린다.
//  - 새 게시글로 올리기 / 기존 게시글 수정(업데이트) — 기존 글은 같은 종류의 글 중에서 고른다(처음에는 지금 연결된 글).
//  - 공지·상단 고정·공개 대상은 게시판 글쓰기와 같은 칸이다.
//  - 올리면 그 순간의 내용이 글에 담기고, 글에는 "업데이트 시각 · 올린 사람"이 보인다.
export type PubPost = { id: string; title: string; updatedAt: string };
type Note = { tone: "bad" | "info"; text: string } | null;

export function PublishBox({ what, endpoint, posts, linked, defaultTitle, defaultBody, defaultAudience, titleHint, beforePublish, onDone, membersOnly }: {
  membersOnly?: boolean; // 공개 대상에서 "보여 줄 회원"만(회원 선택·일정·클럽 고르기 숨김)
  what: string; // "회비 글", "회칙 글" …
  endpoint: string;
  posts: PubPost[];
  linked: string;
  defaultTitle: string;
  defaultBody: string;
  defaultAudience: Audience;
  titleHint?: string;
  // 올리기 전에 할 일(예: 바꾼 설정 저장). false 면 올리지 않는다.
  beforePublish?: () => Promise<boolean>;
  onDone?: () => void;
}) {
  const uid = useId();
  const [mode, setMode] = useState<"new" | "update">(posts.length ? "update" : "new");
  const [postId, setPostId] = useState(linked || posts[0]?.id || "");
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [audience, setAudience] = useState<Audience>(defaultAudience);
  const [notice, setNotice] = useState(true);
  const [pinned, setPinned] = useState(true);
  // 게시 기간: 계속 게시 / 기간 설정(시작 ~ 종료). 기존 글은 그 글의 기간을 불러온다(비어 있으면 계속 게시)
  const [periodOn, setPeriodOn] = useState(false);
  const [postFrom, setPostFrom] = useState("");
  const [postUntil, setPostUntil] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [doneId, setDoneId] = useState("");
  // 고른 글을 올린 뒤 새로 가입했는데 공개 대상에 없는 회원(업데이트하면 사라진다)
  const [joiners, setJoiners] = useState<{ id: string; name: string }[]>([]);

  // 기존 글을 고르면 그 글의 제목·내용·공지·고정·공개 대상을 불러온다. 새 글이면 기본값.
  useEffect(() => {
    setJoiners([]);
    if (mode === "new" || !postId) {
      setTitle(defaultTitle);
      setBody(defaultBody);
      setAudience(defaultAudience);
      setNotice(true);
      setPinned(true);
      setPeriodOn(false); setPostFrom(""); setPostUntil("");
      return;
    }
    let stop = false;
    setLoading(true);
    api<PostDetail>(`/api/board/${encodeURIComponent(postId)}`).then((r) => {
      if (stop) return;
      setLoading(false);
      if (!r.ok) return setNote({ tone: "bad", text: r.error });
      setTitle(r.data.post.title);
      setBody(r.data.post.body);
      setAudience(r.data.post.audience);
      setNotice(r.data.post.notice);
      setPinned(r.data.post.pinned);
      setPostFrom(r.data.post.postFrom ?? ""); setPostUntil(r.data.post.postUntil ?? "");
      setPeriodOn(!!(r.data.post.postFrom || r.data.post.postUntil));
      setJoiners(r.data.newJoiners ?? []);
    });
    return () => { stop = true; };
    // 기본값(defaultTitle 등)이 바뀔 때마다 고친 칸을 덮어쓰지 않도록 mode·postId 만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, postId]);

  async function go() {
    setNote(null);
    setDoneId("");
    if (mode === "update" && !postId) return setNote({ tone: "bad", text: "고칠 글을 골라 주세요." });
    if (periodOn && !postUntil) return setNote({ tone: "bad", text: "게시 기간의 종료 일시를 정해 주세요." });
    if (!window.confirm(mode === "new" ? `지금 저장된 내용으로 새 ${what}을 올릴까요?` : `고른 ${what}을 지금 저장된 내용으로 바꿀까요?`)) return;
    setBusy(true);
    if (beforePublish && !(await beforePublish())) return setBusy(false);
    const r = await api<{ id: string }>(endpoint, { body: { mode, postId: mode === "update" ? postId : "", title, body, audience, notice, pinned, postFrom: periodOn ? postFrom : "", postUntil: periodOn ? postUntil : "" } });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setJoiners([]); // 업데이트했으니 새 회원 안내는 지운다
    setDoneId(r.data.id);
    setNote({ tone: "info", text: mode === "new" ? `새 ${what}을 올렸어요.` : `${what}을 업데이트했어요.` });
    setMode("update");
    setPostId(r.data.id);
    onDone?.();
  }

  return (
    <section className="lcard" aria-labelledby={`${uid}-h`}>
      <header className="lcard-h">
        <h2 id={`${uid}-h`}>게시글 업로드</h2>
        <p>저장된 내용을 게시판 글로 올려요. 올린 그때의 내용이 글에 담기고, 나중에 내용을 바꾸면 여기서 다시 올려 주세요.</p>
      </header>
      <div className="lcard-b">
      <div className="seg" role="group" aria-label="올리는 방법">
        <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")} style={{ minHeight: 40, fontSize: fs(13) }}>새 게시글로</button>
        <button type="button" aria-pressed={mode === "update"} disabled={posts.length === 0} onClick={() => setMode("update")} style={{ minHeight: 40, fontSize: fs(13) }}>기존 글 업데이트</button>
      </div>
      {posts.length === 0 && <span className="small" style={{ fontSize: fs(12), marginTop: -6 }}>아직 올린 {what}이 없어요.</span>}
      {mode === "update" && posts.length > 0 && (
        <div>
          <label className="l" htmlFor={`${uid}-post`}>고칠 글</label>
          <select id={`${uid}-post`} className="field" value={postId} onChange={(e) => setPostId(e.target.value)}>
            {posts.map((p) => (
              <option key={p.id} value={p.id}>{p.title} · {fmtDateTime(p.updatedAt)}{p.id === linked ? " (지금 연결된 글)" : ""}</option>
            ))}
          </select>
        </div>
      )}
      {loading ? <p className="small">글을 불러오는 중이에요…</p> : (
        <>
          <div>
            <label className="l" htmlFor={`${uid}-t`}>제목</label>
            <input id={`${uid}-t`} className="field" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
            {titleHint && <span className="hint">{titleHint}</span>}
          </div>
          <div>
            <label className="l" htmlFor={`${uid}-b`}>안내 문구</label>
            <textarea id={`${uid}-b`} className="field" rows={4} maxLength={10000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {/* 게시 기간 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="l" style={{ margin: 0 }}>게시 기간</span>
            <div className="seg" role="group" aria-label="게시 기간" style={{ alignSelf: "flex-start" }}>
              <button type="button" aria-pressed={!periodOn} onClick={() => setPeriodOn(false)} style={{ minHeight: 38, padding: "0 14px", fontSize: fs(13) }}>계속 게시</button>
              <button type="button" aria-pressed={periodOn} onClick={() => setPeriodOn(true)} style={{ minHeight: 38, padding: "0 14px", fontSize: fs(13) }}>기간 설정</button>
            </div>
            {periodOn && (
              <div className="cp-range">
                <div><DateField id={`${uid}-pf`} mode="datetime" ariaLabel="게시 시작" value={postFrom} onChange={setPostFrom} /></div>
                <span aria-hidden="true">~</span>
                <div><DateField id={`${uid}-pu`} mode="datetime" ariaLabel="게시 종료" value={postUntil} onChange={setPostUntil} /></div>
              </div>
            )}
            <span className="small" style={{ fontSize: fs(12) }}>{periodOn ? "시작을 비우면 올리는 순간부터예요. 종료 일시가 지나면 회원 게시판에서 보이지 않고, 관리자 › 게시글관리에서 볼 수 있어요." : "기간 없이 계속 게시해요."}</span>
          </div>
          <div className="checks" role="group" aria-label="게시 옵션">
            <label><input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} />공지 (목록에 공지 표시)</label>
            <label><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />상단 고정</label>
          </div>
          <AudiencePicker value={audience} onChange={setAudience} membersOnly={membersOnly} />
        </>
      )}
      {note && (
        <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>
          {note.text}
          {doneId && <> <Link href={`/board/${doneId}`} style={{ fontWeight: 700 }}>올린 글 보기 ›</Link></>}
        </div>
      )}
      </div>
      <div className="lcard-f" style={{ justifyContent: "flex-end" }}>
        <button className="btn" type="button" disabled={busy || loading || !title.trim()} style={{ width: "auto", minWidth: 160, minHeight: 44, fontSize: fs(14) }} onClick={go}>
          {busy ? "올리는 중…" : mode === "new" ? "새 게시글로 올리기" : "게시글 업데이트"}
        </button>
      </div>
      {/* 게시 뒤 새로 가입한 회원 안내: 공개 대상을 확인하고 "게시글 업데이트"를 누르면 사라진다 */}
      {mode === "update" && joiners.length > 0 && (
        <div className="fb info" role="alert" style={{ margin: "0 16px 16px" }}>
          <span className="ic" aria-hidden="true">!</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <b>신규 회원이 가입했어요. 확인 후 게시글 업데이트가 필요해요</b>
            <span className="t">이 글을 올린 뒤 가입한 {joiners.map((x) => x.name).join(", ")} 님({joiners.length}명)은 지금 공개 대상에 없어서 이 글을 볼 수 없어요. 위 공개 대상을 확인하고 “게시글 업데이트”를 눌러 주세요.</span>
          </div>
        </div>
      )}
    </section>
  );
}
