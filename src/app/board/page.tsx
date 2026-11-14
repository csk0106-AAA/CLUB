"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertsPanel } from "@/components/AlertsPanel";
import { ConsentSheet } from "@/components/ConsentSheet";
import { IconBell, IconClip, IconLogout, IconMegaphone, IconOrg, IconPin } from "@/components/Icons";
import { Mascot } from "@/components/Mascot";
import { Avatar, type AvatarView } from "@/components/Avatars";
import { MemberTabs } from "@/components/MemberTabs";
import tabsCss from "@/components/MemberTabs.module.css";
import { OrgView } from "@/components/OrgView";
import { headIcon, HEAD_ICON_MAX, HEAD_ICON_SIZE } from "@/components/HeadIcon";
import { Popup } from "@/components/Popup";
import { PostEditor } from "@/components/board/PostEditor";
import { fileUrl, type BoardMe, type PostSummary } from "@/components/board/types";
import { FORM_LABEL, RESPONSE_FORMS } from "@/lib/board";
import { api, fmtDate } from "@/lib/client";
import { disablePush } from "@/lib/push-client";
import { fs } from "@/lib/fs";


type Me = { name: string; consent: boolean; avatar: AvatarView };

// 홈(로그인 다음 화면): 인사 + 로그아웃·알림 아이콘, 그 아래 게시글 목록(고정 글 먼저, 그다음 최신 글. 나에게 공개된 글만).
export default function BoardPage() {
  const router = useRouter();
  const [who, setWho] = useState<Me | null>(null);
  const [club, setClub] = useState("");
  // 종 아이콘 숫자(새 글 + 처리할 소모임 신청 + 안 본 신청 결과)와 알림 창
  const [bell, setBell] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
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
    api<Me>("/api/me").then((r) => r.ok && setWho(r.data));
    api<{ clubName: string }>("/api/public/club").then((c) => c.ok && setClub(c.data.clubName));
  }, [load]);
  // 종 아이콘 숫자: 처음 한 번, 그 뒤 1분마다(화면이 보일 때만)
  useEffect(() => {
    const get = () => api<{ posts: number; alerts: number }>("/api/unread").then((r) => r.ok && setBell(r.data.posts + (r.data.alerts ?? 0)));
    get();
    const t = setInterval(() => document.visibilityState === "visible" && get(), 60_000);
    return () => clearInterval(t);
  }, []);
  const onCount = useCallback((n: number) => setBell(n), []);

  // 로그아웃: 로그인 화면으로 돌아가 이름과 초대코드를 다시 넣고 들어올 수 있다.
  async function logout() {
    if (!window.confirm("로그아웃할까요? 다시 들어오려면 이름과 초대코드(연락처 뒷자리 4자리)를 넣으면 돼요.")) return;
    // 로그아웃한 기기로 다른 사람 알림이 가지 않게 이 기기 구독을 푼다.
    await disablePush();
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.replace("/");
  }
  const closeWriter = useCallback(() => {
    setWriting(false);
    setDirty(false);
    load();
  }, [load]);

  const pinned = posts?.filter((p) => p.pinned) ?? [];
  const rest = posts?.filter((p) => !p.pinned) ?? [];
  const responseChip = (p: PostSummary) =>
    p.responded ? <span className="chip violet">참여 ✓</span> : p.closed ? <span className="chip gray">마감</span> : <span className="chip red">참여 전</span>;

  return (
    <main className="app with-tabs" style={{ gap: 8 }}>
      {/* 윗줄: 캐릭터(왼쪽) + 알림·조직도·로그아웃 아이콘(오른쪽). 다음 줄: 인사 */}
      <header className="topbar">
        <div className="row">
          {who ? <Avatar member={who} size={40} fallback="mascot" /> : <Mascot size={40} />}
          <div className="who">
            {club && <span>{club}</span>}
            <b>{who ? `${who.name} 대표님, 반갑습니다` : "반갑습니다"}</b>
          </div>
          <div className="icons">
            <button type="button" onClick={() => setAlertsOpen(true)} aria-haspopup="dialog" title="알림"
              aria-label={bell > 0 ? `알림, 새 소식 ${bell}개` : "알림"} style={headIcon}>
              <IconBell size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
              {bell > 0 && <span className={tabsCss.badge} aria-hidden="true">{bell > 99 ? "99+" : bell}</span>}
            </button>
            <button type="button" onClick={() => setOrgOpen(true)} aria-haspopup="dialog" aria-label="조직도" title="조직도" style={headIcon}>
              <IconOrg size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
            </button>
            <button type="button" onClick={logout} aria-label="로그아웃" title="로그아웃" style={headIcon}>
              <IconLogout size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
            </button>
          </div>
        </div>
      </header>
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
                {RESPONSE_FORMS.includes(p.form) && responseChip(p)}
                <span className="small" style={{ fontSize: fs(12), flex: "none", display: "inline-flex", alignItems: "center", gap: 2 }}><IconPin size={12} />고정</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {/* 최근 글: 글쓴이·시각 → 제목 → 요약 → 첨부 */}
      {rest.length > 0 && (
        <ul className="rows bleed" aria-label="게시글 목록">
          {rest.map((p) => (
            <li key={p.id}>
              <Link href={`/board/${p.id}`} className="post">
                <span className="meta">
                  <b>{p.authorName || "운영진"}</b><span>· {fmtDate(p.createdAt)}</span>
                  {p.notice && <span className="chip red"><IconMegaphone size={12} />공지</span>}
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
                    {RESPONSE_FORMS.includes(p.form) && responseChip(p)}
                    <span className="chip line">{FORM_LABEL[p.form]}</span>
                  </span>
                </span>
                <span style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <h2>{p.title}</h2>
                    {p.excerpt && <p>{p.excerpt}</p>}
                  </span>
                  {p.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(p.thumb)} alt="" loading="lazy" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flex: "none", border: "1px solid var(--line)" }} />
                  )}
                </span>
                {(p.fileCount > 0 || p.audienceText !== "전체 회원") && (
                  <span className="meta">
                    {p.fileCount > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><IconClip size={13} />첨부 {p.fileCount}</span>}
                    {p.audienceText !== "전체 회원" && <span>{p.audienceText}</span>}
                  </span>
                )}
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
      <Popup id="alerts" title="알림" open={alertsOpen} onClose={() => { setAlertsOpen(false); load(); }}>
        {alertsOpen && <AlertsPanel onCount={onCount} />}
      </Popup>
      <Popup id="org" width={760} title="조직도" open={orgOpen} onClose={() => setOrgOpen(false)}>
        {orgOpen && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}><OrgView /></div>}
      </Popup>
      {who && <ConsentSheet consent={who.consent} onAgreed={() => setWho({ ...who, consent: true })} />}
      <MemberTabs on="board" />
    </main>
  );
}
