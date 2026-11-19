"use client";

import { useEffect, useState } from "react";
import { Popup } from "@/components/Popup";
import { COMMENT_MAX, REACTIONS } from "@/lib/board";
import { api } from "@/lib/client";
import { CommentThread, submitKey } from "@/components/CommentThread";
import { fs } from "@/lib/fs";
import type { PostTalk as Talk } from "./types";

// 게시글 아래 반응(좋아요 등)과 댓글. 관리 화면에서 올린 회칙·회비 글에는 나오지 않는다(talk 가 null).

export function PostTalk({ postId, initial }: { postId: string; initial: Talk }) {
  const [talk, setTalk] = useState<Talk>(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [who, setWho] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const base = `/api/board/${encodeURIComponent(postId)}`;
  // 알림 창의 댓글 알림(…#comments)으로 들어오면 글을 불러온 뒤 댓글로 내려가요
  useEffect(() => {
    if (window.location.hash === "#comments") document.getElementById("comments")?.scrollIntoView({ block: "start" });
  }, []);

  async function call(key: string, path: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(key);
    setErr("");
    const r = await api<Talk>(path, { method, body });
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      return false;
    }
    setTalk({ reactions: r.data.reactions, comments: r.data.comments });
    return true;
  }

  async function react(type: string, label: string, on: boolean) {
    if (await call(`r:${type}`, `${base}/reactions`, "POST", { type })) setNote(on ? `${label} 반응을 취소했어요.` : `${label} 반응을 남겼어요.`);
  }
  async function send() {
    if (!draft.trim() || busy) return;
    if (await call("new", `${base}/comments`, "POST", { body: draft })) {
      setDraft("");
      setNote("댓글을 남겼어요.");
    }
  }
  async function save(id: string, body: string): Promise<boolean> {
    const ok = await call(`e:${id}`, `${base}/comments/${encodeURIComponent(id)}`, "PATCH", { body });
    if (ok) setNote("댓글을 고쳤어요.");
    return ok;
  }
  // 댓글 좋아요 켜고 끄기
  async function like(id: string, on: boolean) {
    if (await call(`l:${id}`, `${base}/comments/${encodeURIComponent(id)}`, "PATCH", { like: on })) setNote(on ? "댓글에 좋아요를 눌렀어요." : "좋아요를 취소했어요.");
  }
  // 답글 달기
  async function reply(parentId: string, body: string): Promise<boolean> {
    const ok = await call("reply", `${base}/comments`, "POST", { body, parentId });
    if (ok) setNote("답글을 남겼어요.");
    return ok;
  }
  async function remove(id: string, own: boolean) {
    if (!window.confirm(own ? "이 댓글을 지울까요? 답글이 있으면 함께 지워져요." : "다른 회원의 댓글이에요. 관리자로서 지울까요? 답글이 있으면 함께 지워져요.")) return;
    if (await call(`d:${id}`, `${base}/comments/${encodeURIComponent(id)}`, "DELETE")) setNote("댓글을 지웠어요.");
  }

  const total = talk.reactions.reduce((n, r) => n + r.count, 0);
  const meta = (key: string) => REACTIONS.find((r) => r.key === key);

  return (
    <section aria-label="반응과 댓글" style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      {/* 반응: 누르면 켜고, 다시 누르면 꺼요 */}
      <div className="row" role="group" aria-label="반응 남기기" style={{ gap: 6, flexWrap: "wrap" }}>
        {talk.reactions.map((r) => {
          const m = meta(r.type);
          if (!m) return null;
          return (
            <button
              key={r.type} type="button" aria-pressed={r.mine} disabled={!!busy}
              aria-label={`${m.label} ${r.count}명${r.mine ? ", 내가 남김" : ""}`}
              onClick={() => react(r.type, m.label, r.mine)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, minHeight: 40, padding: "0 12px", borderRadius: 20, cursor: "pointer",
                font: `500 ${fs(14)} var(--body)`,
                border: `1px solid ${r.mine ? "var(--violet-line)" : "var(--line)"}`,
                background: r.mine ? "var(--violet-bg)" : "var(--card)",
                color: r.mine ? "var(--violet-t)" : "var(--ink)",
              }}
            >
              <span aria-hidden="true">{m.emoji}</span>
              <span>{m.label}</span>
              {r.count > 0 && <b className="num">{r.count}</b>}
            </button>
          );
        })}
        {total > 0 && (
          <button type="button" className="mini" aria-haspopup="dialog" onClick={() => setWho(true)}>
            반응한 사람 보기
          </button>
        )}
      </div>

      {/* 댓글: 오래된 것부터 */}
      <div id="comments" style={{ display: "flex", flexDirection: "column", gap: 10, scrollMarginTop: 16 }}>
        <h2 style={{ font: `700 ${fs(16)} var(--display)`, margin: 0 }}>댓글 {talk.comments.length}개</h2>
        {talk.comments.length === 0 && <span className="small">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</span>}
        {talk.comments.length > 0 && (
          <CommentThread comments={talk.comments} busy={busy}
            onLike={(c) => like(c.id, !c.liked)}
            onReply={(parentId, body) => reply(parentId, body)}
            onEdit={(id, body) => save(id, body)}
            onDelete={(c) => remove(c.id, c.canEdit)} />
        )}

        {err && <div className="msg bad" role="alert">{err}</div>}
        <div role="status" className="sr-only">{note}</div>

        {/* 댓글 쓰기 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="new-comment" className="small" style={{ fontWeight: 700 }}>댓글 쓰기</label>
          <textarea
            id="new-comment" className="field" rows={3} maxLength={COMMENT_MAX} placeholder="따뜻한 한마디를 남겨 주세요"
            style={{ padding: 10 }} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => submitKey(e, send)}
            aria-describedby="new-comment-hint"
          />
          <div className="row" style={{ gap: 8 }}>
            <span id="new-comment-hint" className="hint grow">{draft.length}/{COMMENT_MAX}자 · Ctrl(⌘)+Enter로 바로 등록해요</span>
            <button type="button" className="btn" style={{ width: "auto", minHeight: 44, padding: "0 18px", fontSize: fs(15) }} disabled={!!busy || !draft.trim()} onClick={send}>
              {busy === "new" ? "등록하는 중…" : "등록"}
            </button>
          </div>
        </div>
      </div>

      <Popup id="post-reactors" width={400} title="반응한 사람" open={who} onClose={() => setWho(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {talk.reactions.filter((r) => r.count > 0).map((r) => {
            const m = meta(r.type);
            return (
              <section key={r.type} aria-label={`${m?.label} ${r.count}명`}>
                <b><span aria-hidden="true">{m?.emoji}</span> {m?.label} {r.count}명</b>
                <p style={{ margin: "4px 0 0", lineHeight: 1.6, overflowWrap: "anywhere" }}>{r.names.join(", ")}</p>
              </section>
            );
          })}
          {total === 0 && <span className="small">아직 반응이 없어요.</span>}
        </div>
      </Popup>
    </section>
  );
}
