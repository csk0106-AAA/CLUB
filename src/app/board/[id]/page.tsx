"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconMegaphone, IconPin } from "@/components/Icons";
import { MemberTabs } from "@/components/MemberTabs";
import { Attachments, FeeView, MinutesView, PollBox, QuizBox, RulesView, SurveyBox } from "@/components/board/PostView";
import { PostTalk } from "@/components/board/PostTalk";
import { LadderBox } from "@/components/board/Ladder";
import { EditorsBox } from "@/components/EditorsBox";
import type { PostDetail } from "@/components/board/types";
import { FORM_LABEL, type FeeSnap, type LadderData, type MinutesData, type PollData, type QuizData, type SurveyData } from "@/lib/board";
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
    if (!d || !window.confirm("이 게시글을 삭제할까요? 첨부 파일·응답·댓글도 함께 지워져요.")) return;
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
  // 새로 가입한 회원 알림 처리: add = 공개 대상에 넣기, dismiss = 넣지 않고 알림 끄기
  async function joiners(action: "add" | "dismiss") {
    if (!d) return;
    if (action === "dismiss" && !window.confirm("새로 가입한 회원을 공개 대상에 넣지 않을까요? 이 회원들은 이 글을 볼 수 없어요.")) return;
    const r = await api(`/api/board/${d.post.id}/joiners`, { body: { action } });
    if (!r.ok) return setError(r.error);
    load();
  }

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
          {/* 게시 뒤 새로 가입한 회원 알림(작성자·편집자): 공개 대상에 넣거나, 넣지 않고 알림 끄기 */}
          {d.newJoiners && d.newJoiners.length > 0 && (
            <div className="fb info" role="alert">
              <span className="ic" aria-hidden="true">!</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <b>이 글을 올린 뒤 새로 가입한 회원이 있어요</b>
                <span className="t">{d.newJoiners.map((j) => j.name).join(", ")} 님({d.newJoiners.length}명)은 지금 공개 대상에 없어서 이 글을 볼 수 없어요. 확인하고 게시물을 업데이트해 주세요.</span>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className="btn" style={{ width: "auto", minHeight: 40, fontSize: fs(14) }} onClick={() => joiners("add")}>공개 대상에 넣기</button>
                  {editHref && <Link href={editHref} className="btn white" style={{ width: "auto", minHeight: 40, fontSize: fs(14), textDecoration: "none" }}>수정해서 고르기</Link>}
                  <button type="button" className="btn white" style={{ width: "auto", minHeight: 40, fontSize: fs(14) }} onClick={() => joiners("dismiss")}>넣지 않기</button>
                </div>
              </div>
            </div>
          )}
          {p.body && <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, overflowWrap: "anywhere" }}>{p.body}</p>}

          {p.form === "rules" && d.rules && <RulesView rules={d.rules} />}
          {p.form === "fee" && d.myFee && <FeeView data={p.data as unknown as FeeSnap} myFee={d.myFee} full={d.seeResults} clubJoin={d.clubJoin ?? null} />}
          {p.form === "minutes" && <MinutesView data={p.data as unknown as MinutesData} labels={d.agendaLabels ?? {}} />}
          {p.form === "poll" && <PollBox key={JSON.stringify(d.mine)} id={p.id} data={p.data as unknown as PollData} mine={d.mine as Any} results={d.results as Any} onDone={load} />}
          {p.form === "survey" && <SurveyBox key={JSON.stringify(d.mine)} id={p.id} data={p.data as unknown as SurveyData} mine={d.mine as Any} results={d.results as Any} onDone={load} />}
          {p.form === "ladder" && <LadderBox data={p.data as unknown as LadderData} />}
          {p.form === "quiz" && <QuizBox key={JSON.stringify(d.mine)} id={p.id} data={p.data as unknown as QuizData} mine={d.mine as Any} results={d.results as Any} onDone={load} />}

          <Attachments files={p.files} />

          {(editHref || d.canDelete) && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              {editHref && <Link href={editHref} className="btn white" style={btn}>수정</Link>}
              {d.canDelete && <button className="btn red" type="button" style={btn} onClick={remove}>게시글 삭제</button>}
            </div>
          )}
          {/* 편집자: 작성자(또는 모든권한)가 게시글_글쓰기 권한이 있는 회원 중에서 추가 */}
          {d.canManageEditors && <EditorsBox endpoint={`/api/board/${p.id}/editors`} what="글" need="게시글_글쓰기 권한" />}
          {!d.canManageEditors && (d.editors ?? []).length > 0 && (
            <span className="small">편집자: {(d.editors ?? []).map((e) => e.name).join(", ")}</span>
          )}
          {d.manageHref && (
            <span className="small">
              {p.form === "rules" ? "회칙" : "회비"} 글은 “수정”을 누르면 나오는 관리 화면에서 내용을 고친 뒤 이 글로 다시 올려요.
            </span>
          )}

          {d.talk && <PostTalk key={p.id} postId={p.id} initial={d.talk} />}
        </article>
      )}
      <MemberTabs on="board" />
    </main>
  );
}
