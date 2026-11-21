"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplyNotice } from "@/components/ApplyNotice";
import { ConsentSheet } from "@/components/ConsentSheet";
import { EventRail } from "@/components/EventRail";
import { FreshChip } from "@/components/FreshChip";
import { IconMegaphone, IconPin } from "@/components/Icons";
import { type AvatarView } from "@/components/Avatars";
import { MainHeader } from "@/components/MainHeader";
import { MemberTabs } from "@/components/MemberTabs";
import { Popup } from "@/components/Popup";
import { PostEditor } from "@/components/board/PostEditor";
import { fileUrl, type BoardMe, type PostSummary } from "@/components/board/types";
import { FORM_LABEL, RESPONSE_FORMS } from "@/lib/board";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";
import { BookGuide } from "@/components/BookGuide";


type Me = { name: string; consent: boolean; avatar: AvatarView; bookGuide?: boolean };

// 마감 일시 짧게: "2026-11-30T18:00" → "11/30 18:00", "2026-11-30" → "11/30"
function deadlineText(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(d);
  if (!m) return d;
  return `${Number(m[2])}/${Number(m[3])}${m[4] ? ` ${m[4]}` : ""}`;
}

// 홈(로그인 다음 화면): 인사 + 로그아웃·알림 아이콘, 다가오는 나의 일정 카드(참석 신청한 일정, 가까운 순 3개, 롤링), 그 아래 게시글 목록(고정 글 먼저, 그다음 최신 글. 나에게 공개된 글만).
export default function BoardPage() {
  const router = useRouter();
  const [who, setWho] = useState<Me | null>(null);
  // 알림 창을 처음부터 열지(관리자 › 처리할 일에서 /board?alerts=1 로 들어올 때)
  const [alertsOpen, setAlertsOpen] = useState(false);
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
    // 관리자 › 회원관리의 "처리할 일"에서 들어오면 알림 창을 바로 연다(/board?alerts=1)
    if (new URLSearchParams(window.location.search).get("alerts") === "1") setAlertsOpen(true);
    api<Me>("/api/me").then((r) => r.ok && setWho(r.data));
  }, [load]);
  const closeWriter = useCallback(() => {
    setWriting(false);
    setDirty(false);
    load();
  }, [load]);

  const pinned = posts?.filter((p) => p.pinned) ?? [];
  const rest = posts?.filter((p) => !p.pinned) ?? [];
  // 종 아이콘 숫자에 센 글: 새로 올라온 글은 NEW, 바뀐 글은 UP(알림 창을 열면 사라져요)
  const freshChip = (p: PostSummary) => <FreshChip fresh={p.fresh} />;
  // 반응·댓글 수(하나라도 있는 글만): "👍 3 · 💬 2"
  const talkCounts = (p: PostSummary) => {
    if (!p.reactions && !p.comments) return null;
    const parts = [p.reactions ? `👍 ${p.reactions}` : "", p.comments ? `💬 ${p.comments}` : ""].filter(Boolean).join(" · ");
    const label = [p.reactions ? `반응 ${p.reactions}개` : "", p.comments ? `댓글 ${p.comments}개` : ""].filter(Boolean).join(", ");
    return (
      <span className="small num" style={{ fontSize: fs(12), flex: "none" }}>
        <span aria-hidden="true">{parts}</span><span className="sr-only">{label}</span>
      </span>
    );
  };
  const responseChip = (p: PostSummary) =>
    p.responded ? <span className="chip violet">참여 ✓</span> : p.closed ? <span className="chip gray">마감</span> : <span className="chip red">참여 전</span>;

  return (
    <main className="app with-tabs" style={{ gap: 8 }}>
      {/* 윗줄: 홈·일정·프로필 북 공통(프로필 + 모임 이름·회원 이름 + 알림·조직도·로그아웃) */}
      <MainHeader openAlerts={alertsOpen} onAlertsClosed={() => { setAlertsOpen(false); load(); }} />
      {/* 다가오는 나의 일정 카드(참석 신청한 일정, 가까운 순 3개, 옆으로 넘기기·자동 넘김). 일정이 없으면 그리지 않는다 */}
      <EventRail />
      <div className="row" style={{ marginTop: 4 }}>
        <h1 className="title grow">게시글</h1>
        {me?.canWrite && (
          <a
            href="/board/new" className="btn" aria-haspopup="dialog" style={{ width: "auto", minHeight: 36, padding: "0 12px", gap: 4, fontSize: fs(13), fontWeight: 500, textDecoration: "none" }}
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
      {/* 내가 올린(또는 편집자인) 글 중 게시 뒤 새로 가입한 회원이 공개 대상에 없는 글 */}
      {posts && posts.some((p) => (p.newJoiners ?? 0) > 0) && (
        <div className="fb info" role="alert">
          <span className="ic" aria-hidden="true">!</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <b>새로 가입한 회원이 있어요. 게시물을 확인해 주세요</b>
            <span className="t">아래 글은 공개 대상을 골라 올려서, 그 뒤 가입한 회원이 볼 수 없어요.</span>
            {posts.filter((p) => (p.newJoiners ?? 0) > 0).map((p) => (
              <Link key={p.id} href={`/board/${p.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>· {p.title} (새 회원 {p.newJoiners}명) ›</Link>
            ))}
          </div>
        </div>
      )}
      {/* 고정 글: 한 줄씩 짧게(칩 + 제목 + "고정") */}
      {pinned.length > 0 && (
        <ul className="rows bleed" aria-label="상단 고정 글">
          {pinned.map((p) => (
            <li key={p.id}>
              <Link href={`/board/${p.id}`} className="pinrow">
                {p.notice
                  ? <span className="chip red"><IconMegaphone size={12} />공지</span>
                  : <span className="chip line">{FORM_LABEL[p.form]}</span>}
                <span className="t">{p.title}</span>
                {talkCounts(p)}
                {freshChip(p)}
                {RESPONSE_FORMS.includes(p.form) && responseChip(p)}
                <span className="small" style={{ fontSize: fs(12), flex: "none", display: "inline-flex", alignItems: "center", gap: 2 }}><IconPin size={12} />고정</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {/* 최근 글: 글쓴이·시각 → 제목 → 공개 대상(전체 회원이 아닐 때) */}
      {rest.length > 0 && (
        <ul className="rows bleed" aria-label="게시글 목록">
          {rest.map((p) => (
            <li key={p.id}>
              <Link href={`/board/${p.id}`} className="post">
                <span className="meta">
                  {/* 공지는 상단 고정 글처럼 맨 앞에 */}
                  {p.notice && <span className="chip red"><IconMegaphone size={12} />공지</span>}
                  <b>{p.authorName || "운영진"}</b><span>· {fmtDate(p.updatedAt || p.createdAt)}</span>
                  {freshChip(p)}
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
                    {RESPONSE_FORMS.includes(p.form) && responseChip(p)}
                    <span className="chip line">{FORM_LABEL[p.form]}</span>
                  </span>
                </span>
                <span style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <h2>{p.title}</h2>
                  </span>
                  {p.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(p.thumb)} alt="" loading="lazy" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flex: "none", border: "1px solid var(--line)" }} />
                  )}
                </span>
                {/* 제목 아래에는 공개 대상만(전체 회원 공개 글은 줄 없음). 내용 요약·반응·댓글·첨부 수는 목록에서 보이지 않는다 */}
                {p.vote ? (
                  // 투표·설문: 대상 인원 중 참여 인원과 마감(모든 회원에게)
                  <span className="meta">
                    <span>{p.form === "poll" ? "투표" : "응답"} <b className="num">{p.vote.done}</b>/{p.vote.target}명{p.audienceText !== "전체 회원" ? " · 선택한 회원 대상" : ""}</span>
                    <span>· {p.vote.deadline ? (p.closed ? `마감됨 (${deadlineText(p.vote.deadline)})` : `${deadlineText(p.vote.deadline)} 마감`) : "마감 없음"}</span>
                  </span>
                ) : p.audienceText !== "전체 회원" && <span className="meta"><span>{p.audienceText}</span></span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
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
      {who && <ConsentSheet consent={who.consent} onAgreed={() => setWho({ ...who, consent: true })} />}
      {who && <ApplyNotice ready={who.consent} />}
      {who && <BookGuide ready={who.consent} show={!!who.bookGuide} name={who.name} />}
      <MemberTabs on="board" />
    </main>
  );
}
