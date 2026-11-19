"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatars";
import type { AvatarView } from "@/lib/avatar";
import { COMMENT_MAX } from "@/lib/board";
import { fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

// 댓글 목록 공통(게시글 댓글 · 사진 댓글): 좋아요, 답글(한 단계), 고치기, 지우기.
// 목록은 서버가 "원댓글 → 그 답글들" 순서로 준다(lib/comments.ts threadOrder).
export type CommentView = {
  id: string; name: string; avatar: AvatarView | null; body: string; createdAt: string;
  edited: boolean; canEdit: boolean; canDelete: boolean; likes: number; liked: boolean; parentId: string;
};

// "방금" / "3분 전" / 그 밖에는 "YYYY/MM/DD HH:mm"
export function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return "방금";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
  return fmtDateTime(iso);
}

export const submitKey = (e: React.KeyboardEvent, go: () => void) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    go();
  }
};

export function CommentThread({ comments, busy, onLike, onReply, onEdit, onDelete, compact, readOnly }: {
  comments: CommentView[];
  busy: string;
  onLike: (c: CommentView) => void;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (c: CommentView) => void;
  compact?: boolean; // 사진 창처럼 좁은 곳: 아바타를 작게
  readOnly?: boolean; // 읽기만(좋아요·답글 끔 — 예: 참석 신청 전 사진 댓글)
}) {
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [replying, setReplying] = useState<{ id: string; body: string } | null>(null); // 답글 쓰는 원댓글
  const size = compact ? 28 : 36;

  async function saveEdit() {
    if (!editing || !editing.body.trim() || busy) return;
    if (await onEdit(editing.id, editing.body)) setEditing(null);
  }
  async function sendReply() {
    if (!replying || !replying.body.trim() || busy) return;
    if (await onReply(replying.id, replying.body)) setReplying(null);
  }

  const one = (c: CommentView) => {
    const isEditing = editing?.id === c.id;
    const top = !c.parentId;
    return (
      <li key={c.id} className={`cm-item${top ? "" : " reply"}`}>
        <Avatar member={{ name: c.name, avatar: c.avatar ?? undefined }} size={top ? size : size - 6} />
        <div className="cm-body">
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <b>{c.name}</b>
            <time className="small" dateTime={c.createdAt} title={fmtDateTime(c.createdAt)}>{ago(c.createdAt)}</time>
            {c.edited && <span className="small">· 수정됨</span>}
          </div>
          {isEditing ? (
            <>
              <textarea className="field" rows={3} maxLength={COMMENT_MAX} aria-label="댓글 고치기" autoFocus style={{ padding: 10 }} value={editing.body}
                onChange={(e) => setEditing({ id: c.id, body: e.target.value })} onKeyDown={(e) => submitKey(e, saveEdit)} />
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="mini" disabled={!!busy || !editing.body.trim()} onClick={saveEdit}>저장</button>
                <button type="button" className="mini" onClick={() => setEditing(null)}>취소</button>
              </div>
            </>
          ) : (
            <p className="cm-text">{c.body}</p>
          )}
          {!isEditing && (
            <div className="cm-acts">
              <button type="button" className={`cm-act${c.liked ? " on" : ""}`} disabled={!!busy || readOnly} aria-pressed={c.liked}
                aria-label={`${c.name} 님 댓글 좋아요 ${c.likes}개${c.liked ? ", 누름" : ""}`} onClick={() => onLike(c)}>
                <span aria-hidden="true">{c.liked ? "♥" : "♡"}</span>{c.likes > 0 && <span>{c.likes}</span>}
              </button>
              {!readOnly && <button type="button" className="cm-act" disabled={!!busy} onClick={() => setReplying({ id: c.parentId || c.id, body: replying?.id === (c.parentId || c.id) ? replying.body : "" })}
                aria-label={`${c.name} 님 댓글에 답글 쓰기`}>답글</button>}
              {c.canEdit && <button type="button" className="cm-act" disabled={!!busy} onClick={() => setEditing({ id: c.id, body: c.body })} aria-label={`${c.name} 님 댓글 수정`}>수정</button>}
              {c.canDelete && <button type="button" className="cm-act" disabled={!!busy} onClick={() => onDelete(c)} aria-label={`${c.name} 님 댓글 삭제`}>삭제</button>}
            </div>
          )}
        </div>
      </li>
    );
  };

  // 원댓글마다: 원댓글 → 답글들 → (답글 쓰는 중이면) 답글 칸
  const tops = comments.filter((c) => !c.parentId || !comments.some((x) => x.id === c.parentId));
  return (
    <ul className="cm-list">
      {tops.map((t) => (
        <li key={t.id} className="cm-thread">
          <ul className="cm-list">
            {one(t)}
            {comments.filter((c) => c.parentId === t.id).map(one)}
          </ul>
          {replying?.id === t.id && (
            <div className="cm-reply-box">
              <textarea className="field" rows={2} maxLength={COMMENT_MAX} autoFocus aria-label={`${t.name} 님 댓글에 답글`} placeholder={`${t.name} 님에게 답글`}
                style={{ padding: 10 }} value={replying.body} onChange={(e) => setReplying({ id: t.id, body: e.target.value })} onKeyDown={(e) => submitKey(e, sendReply)} />
              <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                <button type="button" className="mini" onClick={() => setReplying(null)}>취소</button>
                <button type="button" className="mini" disabled={!!busy || !replying.body.trim()} onClick={sendReply} style={{ fontSize: fs(13) }}>답글 등록</button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
