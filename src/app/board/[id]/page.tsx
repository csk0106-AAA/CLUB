"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconMegaphone, IconPin } from "@/components/Icons";
import { MemberTabs } from "@/components/MemberTabs";
import { Attachments, FeeView, MinutesView, PollBox, QuizBox, RulesView, SurveyBox } from "@/components/board/PostView";
import type { PostDetail } from "@/components/board/types";
import { FORM_LABEL, type FeeSnap, type MinutesData, type PollData, type QuizData, type SurveyData } from "@/lib/board";
import { api, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type Any = never;

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<PostDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await api<PostDetail>(`/api/board/${encodeURIComponent(id)}`);
    if (r.ok) setD(r.data);
    else if (r.status === 401) router.replace("/");
    else setError(r.error);
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    if (!d || !window.confirm("이 게시글을 삭제할까요? 첨부 파일과 응답도 함께 지워져요.")) return;
    const r = await api(`/api/board/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) return setError(r.error);
    router.replace("/board");
  }

  const p = d?.post;
  // 회칙·회비 글은 올릴 때마다 "업데이트 시각 · 올린 사람", 일반 글은 고친 적이 있으면 업데이트 시각
  const edited = !!p && !!p.updatedAt && (p.updatedAt !== p.createdAt || p.form === "fee" || p.form === "rules");
  // 수정 버튼: 회칙·회비 글은 그 관리 화면으로, 일반 글은 게시판 수정 화면으로
  const editHref = d ? (d.manageHref || (d.canEdit ? `/board/${d.post.id}/edit` : "")) : "";
  const btn = { width: "auto", minHeight: 46, fontSize: fs(15), textDecoration: "none" } as const;

  return (
    <main className="app with-tabs">
      <Link href="/board" className="mini" style={{ alignSelf: "flex-start", textDecoration: "none" }}>‹ 홈</Link>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!d && !error && <p className="small">불러오는 중이에요…</p>}
      {d && p && (
        <article style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {p.pinned && <span className="pill red" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><IconPin size={13} />고정</span>}
            {p.notice && <span className="pill red" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><IconMegaphone size={13} />공지</span>}
            <span className="pill gray">{FORM_LABEL[p.form]}</span>
          </div>
          <h1 className="title" style={{ overflowWrap: "anywhere" }}>{p.title}</h1>
          <span className="small">
            {edited ? "업데이트" : "작성"} {fmtDateTime(edited ? p.updatedAt : p.createdAt)} · {p.authorName || "운영진"}
            {p.audienceText !== "전체 회원" ? ` · 공개: ${p.audienceText}` : ""}
          </span>
          {p.body && <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, overflowWrap: "anywhere" }}>{p.body}</p>}

          {p.form === "rules" && d.rules && <RulesView rules={d.rules} />}
          {p.form === "fee" && d.myFee && <FeeView data={p.data as unknown as FeeSnap} myFee={d.myFee} full={d.seeResults} />}
          {p.form === "minutes" && <MinutesView data={p.data as unknown as MinutesData} labels={d.agendaLabels ?? {}} />}
          {p.form === "poll" && <PollBox key={JSON.stringify(d.mine)} id={p.id} data={p.data as unknown as PollData} mine={d.mine as Any} results={d.results as Any} onDone={load} />}
          {p.form === "survey" && <SurveyBox key={JSON.stringify(d.mine)} id={p.id} data={p.data as unknown as SurveyData} mine={d.mine as Any} results={d.results as Any} onDone={load} />}
          {p.form === "quiz" && <QuizBox key={JSON.stringify(d.mine)} id={p.id} data={p.data as unknown as QuizData} mine={d.mine as Any} results={d.results as Any} onDone={load} />}

          <Attachments files={p.files} />

          {(editHref || d.canDelete) && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              {editHref && <Link href={editHref} className="btn white" style={btn}>수정</Link>}
              {d.canDelete && <button className="btn red" type="button" style={btn} onClick={remove}>게시글 삭제</button>}
            </div>
          )}
          {d.manageHref && (
            <span className="small">
              {p.form === "rules" ? "회칙" : "회비"} 글은 “수정”을 누르면 나오는 관리 화면에서 내용을 고친 뒤 이 글로 다시 올려요.
            </span>
          )}
        </article>
      )}
      <MemberTabs on="board" />
    </main>
  );
}
