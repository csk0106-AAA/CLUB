"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconClip, IconMegaphone, IconPin } from "@/components/Icons";
import { MemberTabs } from "@/components/MemberTabs";
import { Popup } from "@/components/Popup";
import { PostEditor } from "@/components/board/PostEditor";
import { fileUrl, type BoardMe, type PostSummary } from "@/components/board/types";
import { FORM_LABEL, RESPONSE_FORMS } from "@/lib/board";
import { api, fmtDate } from "@/lib/client";

// 게시글 목록: 고정 글 먼저, 그다음 최신 글. 나에게 공개된 글만 보인다.
export default function BoardPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [me, setMe] = useState<BoardMe | null>(null);
  const [error, setError] = useState("");
  // 글쓰기 창
  const [writing, setWriting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    api<{ posts: PostSummary[]; me: BoardMe }>("/api/board").then((r) => {
      if (r.ok) { setPosts(r.data.posts); setMe(r.data.me); }
      else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
  }, [router]);
  useEffect(() => {
    load();
  }, [load]);
  const closeWriter = useCallback(() => {
    setWriting(false);
    setDirty(false);
    load();
  }, [load]);

  return (
    <main className="app with-tabs">
      <div className="row">
        <h1 className="title grow">게시글</h1>
        {me?.canWrite && (
          <a
            href="/board/new" className="btn" aria-haspopup="dialog" style={{ width: "auto", minHeight: 46, fontSize: 18, textDecoration: "none" }}
            onClick={(e) => {
              // 새 탭·창으로 열기(Ctrl/⌘/Shift/가운데 버튼)는 그대로 글쓰기 화면으로
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setWriting(true);
            }}
          >
            + 글쓰기
          </a>
        )}
      </div>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!posts && !error && <p className="small">불러오는 중이에요…</p>}
      {posts && posts.length === 0 && <div className="msg info">아직 올라온 글이 없어요.</div>}
      <ul className="pick" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {posts?.map((p) => (
          <li key={p.id}>
            <Link href={`/board/${p.id}`} className="opt rowopt" style={{ textDecoration: "none", alignItems: "flex-start", ...(p.pinned ? { borderColor: "var(--blue)" } : {}) }}>
              <span className="grow">
                <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {p.pinned && <span className="pill blue" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><IconPin size={13} />고정</span>}
                  {p.notice && <span className="pill warn" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><IconMegaphone size={14} />공지</span>}
                  {p.form !== "general" && <span className="pill gray">{FORM_LABEL[p.form]}</span>}
                  {RESPONSE_FORMS.includes(p.form) && (p.responded ? <span className="pill ok">참여 ✓</span> : p.closed ? <span className="pill gray">마감</span> : <span className="pill bad">참여 전</span>)}
                </span>
                <span className="name" style={{ overflowWrap: "anywhere" }}>{p.title}</span>
                {p.excerpt && <span className="small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.excerpt}</span>}
                <span className="small" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  {p.authorName || "운영진"} · {fmtDate(p.createdAt)}
                  {p.fileCount > 0 && <><span aria-hidden="true">·</span><IconClip size={14} /><span>{p.fileCount}<span className="sr-only">개 첨부</span></span></>}
                  {p.audienceText !== "전체 회원" && <> · {p.audienceText}</>}
                </span>
              </span>
              {p.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(p.thumb)} alt="" loading="lazy" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flex: "none", border: "2px solid var(--line)" }} />
              )}
            </Link>
          </li>
        ))}
      </ul>
      <Popup id="post-editor" width={760} title="글쓰기" open={writing} onClose={closeWriter} dirty={dirty}>
        <PostEditor
          onDirty={setDirty}
          onCancel={closeWriter}
          onDone={(id) => {
            setWriting(false);
            setDirty(false);
            router.push(`/board/${id}`);
          }}
        />
      </Popup>
      <MemberTabs on="board" />
    </main>
  );
}
