"use client";

import { useEffect, useState } from "react";
import { CommentThread, submitKey, type CommentView } from "./CommentThread";
import { COMMENT_MAX } from "@/lib/board";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 사진 크게 보기 창 아래 댓글(좋아요·답글·고치기·지우기). 사진을 넘기면 그 사진의 댓글을 다시 불러온다.
// canWrite: 참석 신청자·관리자만 쓰기·좋아요·답글(그 밖에는 읽기만)
export function PhotoComments({ eventId, photoId, canWrite = true }: { eventId: string; photoId: string; canWrite?: boolean }) {
  const base = `/api/events/${eventId}/photos/${photoId}/comments`;
  const [list, setList] = useState<CommentView[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let stop = false;
    setList(null);
    setErr("");
    api<{ comments: CommentView[] }>(base).then((r) => {
      if (stop) return;
      if (r.ok) setList(r.data.comments);
      else setErr(r.error);
    });
    return () => { stop = true; };
  }, [base]);

  async function call(key: string, url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(key);
    setErr("");
    const r = await api<{ comments: CommentView[] }>(url, { method, body });
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      return false;
    }
    setList(r.data.comments);
    return true;
  }
  const at = (id: string) => `${base}?cid=${encodeURIComponent(id)}`;

  async function send() {
    if (!draft.trim() || busy) return;
    if (await call("new", base, "POST", { body: draft })) setDraft("");
  }

  return (
    <section aria-label="사진 댓글" className="ph-comments">
      <b style={{ fontSize: fs(14) }}>댓글 {list?.length ?? 0}개</b>
      {list === null && !err && <span className="small">불러오는 중이에요…</span>}
      {list && list.length > 0 && (
        <CommentThread comments={list} busy={busy} compact readOnly={!canWrite}
          onLike={(c) => call(`l:${c.id}`, at(c.id), "PATCH", { like: !c.liked })}
          onReply={(parentId, body) => call("reply", base, "POST", { body, parentId })}
          onEdit={(id, body) => call(`e:${id}`, at(id), "PATCH", { body })}
          onDelete={(c) => { if (window.confirm(c.canEdit ? "이 댓글을 지울까요? 답글이 있으면 함께 지워져요." : "다른 회원의 댓글이에요. 관리자로서 지울까요?")) call(`d:${c.id}`, at(c.id), "DELETE"); }} />
      )}
      {err && <div className="msg bad" role="alert">{err}</div>}
      {!canWrite && <span className="small">참석 신청하면 댓글·좋아요를 남길 수 있어요.</span>}
      {canWrite && <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
        <textarea className="field grow" rows={2} maxLength={COMMENT_MAX} aria-label="사진에 댓글 쓰기" placeholder="이 사진에 한마디 남겨 주세요"
          style={{ padding: 10, minHeight: 44 }} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => submitKey(e, send)} />
        <button type="button" className="btn" style={{ width: "auto", minHeight: 44, padding: "0 16px", fontSize: fs(14), flex: "none" }} disabled={!!busy || !draft.trim()} onClick={send}>
          {busy === "new" ? "등록 중…" : "등록"}
        </button>
      </div>}
    </section>
  );
}
