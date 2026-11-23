"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, type AvatarView } from "@/components/Avatars";
import { MainHeader } from "@/components/MainHeader";
import { FreshChip, type Fresh } from "@/components/FreshChip";
import { MemberTabs, markSeenAfterList } from "@/components/MemberTabs";
import { Sheet } from "@/components/Sheet";
import { api, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type Data = {
  // key: 상세 화면 주소, masked: '내가 누구일까요?' 참여 중이라 별칭으로 보임(이름 칸에 별칭, 회사·사진 없음)
  // hasIntro: 공개된 소개가 있는지, fresh: 마지막으로 본 뒤 처음 공개(NEW) / 다시 공개·수정(UP)
  // isNew: 신규 회원(승인 후 한 달, 맨 위)
  items: { key: string; masked: boolean; name: string; hasIntro: boolean; mine: boolean; hiddenMine?: boolean; isNew?: boolean; fresh?: Fresh | null; company?: string; title?: string; clubs?: string[]; avatar?: AvatarView }[];
  maskedCount: number;
};

// 실명 공개 뒤 표시: "올림피아드 / 대표 / 골프, 등산" (빈 항목은 건너뜀)
function details(m: { company?: string; title?: string; clubs?: string[] }): string {
  return [m.company, m.title, (m.clubs ?? []).join(", ")].filter((x) => x && x.trim()).join(" / ");
}

// 회원 프로필 북: 모든 회원을 이름으로 보여 준다. 누르면 소개(없으면 본인은 "소개 작성하기").
// '내가 누구일까요?'에 참여 중인 회원은 실명 공개 시점까지 별칭(랜덤 닉네임)으로만 보인다.
export default function ProfilesPage() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  // 개인정보 동의 전에는 다른 회원의 프로필 북을 볼 수 없다. popup: 안내 팝업을 띄울지
  const [locked, setLocked] = useState(false);
  const [popup, setPopup] = useState(false);
  const [busy, setBusy] = useState(false);
  // 위쪽 숫자 칸으로 거르기: 전체(기본) / 소개 글 있음 / NEW(처음 공개) / UP(다시 공개·수정)
  const [filter, setFilter] = useState<"all" | "intro" | "new" | "updated">("all");

  const load = useCallback(async () => {
    const r = await api<Data>("/api/profiles");
    if (r.ok) {
      setD(r.data);
      setLocked(false);
      // 목록을 받은 뒤 "봤음"으로 표시(NEW / UP 은 이번 방문 동안 남고, 다음에 열면 사라진다)
      markSeenAfterList("profiles");
    } else if (r.status === 401) router.replace("/");
    else if (r.status === 403) {
      setLocked(true);
      setPopup(true);
    } else setError(r.error);
  }, [router]);
  useEffect(() => {
    load();
  }, [load]);

  async function agree() {
    setBusy(true);
    const r = await api("/api/me/consent", { method: "POST", body: {} });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPopup(false);
    load();
  }

  return (
    <main className="app with-tabs">
      {/* 윗줄: 홈·일정과 같은 공통 머리(프로필 + 이름 + 알림·조직도·로그아웃) */}
      <MainHeader />
      <div className="row" style={{ marginTop: 4 }}>
        <h1 className="title grow">회원 프로필 북</h1>
      </div>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!d && !error && !locked && <p className="small">불러오는 중이에요…</p>}
      {locked && !popup && (
        <div className="fb info">
          <span className="ic" aria-hidden="true">i</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b>동의 후에 볼 수 있어요</b>
            <span className="t">개인정보 안내에 동의하지 않으면 다른 회원의 프로필 북을 볼 수 없어요.</span>
            <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setPopup(true)}>동의 안내 다시 보기</button>
          </div>
        </div>
      )}
      {popup && (
        <Sheet title="프로필 북은 동의 후에 볼 수 있어요" mascot>
          <p style={{ margin: 0 }}>
            프로필 북에는 회원들이 공개한 소개가 담겨 있어요. 서로의 소개를 함께 나누는 공간이라, 개인정보 안내에 동의한 회원만 볼 수 있어요.
          </p>
          <div className="card" style={{ background: "var(--soft)" }}>
            <b>개인정보 안내</b>
            <div className="small">작성하신 내용 중 본인이 공개로 선택한 부분은 모임 회원들에게 보여집니다. 언제든 수정·삭제할 수 있습니다.</div>
          </div>
          <button className="btn" type="button" disabled={busy} onClick={agree}>동의하고 프로필 북 보기</button>
          <button className="btn white" type="button" onClick={() => setPopup(false)}>동의하지 않음</button>
        </Sheet>
      )}
      {d && (
        <>
          <p className="small" style={{ margin: 0, fontSize: fs(12) }}>
            이름을 누르면 소개를 볼 수 있어요.{d.maskedCount > 0 ? ` “내가 누구일까요?”에 참여 중인 ${d.maskedCount}명은 실명 공개 전까지 별칭으로 보여요.` : ""}
          </p>
          {d.items.length === 0 && <div className="msg info">아직 회원이 없어요.</div>}
          {d.items.length > 0 && (
            <div className="row" role="group" aria-label="프로필 거르기" style={{ gap: 6, flexWrap: "wrap" }}>
              {([
                ["all", "전체", d.items.length],
                ["intro", "소개 글", d.items.filter((p) => p.hasIntro).length],
                ["new", "NEW", d.items.filter((p) => p.fresh === "new").length],
                ["updated", "UP", d.items.filter((p) => p.fresh === "updated").length],
              ] as const).map(([k, label, n]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                  className={`btn ${filter === k ? "" : "white"}`} style={{ width: "auto", minHeight: 38, padding: "0 12px", fontSize: fs(13) }}>
                  {label} <b className="num">{n}</b>명
                </button>
              ))}
            </div>
          )}
          <div className="rows bleed">
            {/* 내 카드는 맨 위에, 테두리·배경으로 눈에 띄게(별칭일 때도 내 것임을 알 수 있게) */}
            {[...d.items.filter((p) => p.mine), ...d.items.filter((p) => !p.mine)]
              .filter((p) => filter === "all" || (filter === "intro" ? p.hasIntro : p.fresh === filter))
              .map((p) => (
              <button key={p.key} type="button" className="opt" onClick={() => router.push(`/profiles/${p.key}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, ...(p.mine ? { background: "var(--violet-bg)", boxShadow: "inset 4px 0 0 var(--accent-ink)" } : {}) }}>
                {/* 별칭 회원은 사진·캐릭터를 내려받지 않는다(주인을 알아챌 수 있어서) */}
                {p.masked ? <span className="avatar" aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, background: "var(--violet-bg)", color: "var(--accent-ink)", fontSize: fs(18) }}>?</span>
                  : <Avatar member={{ name: p.name, avatar: p.avatar ?? null }} size={44} />}
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
                  {p.mine && <b style={{ fontSize: fs(12), color: "var(--accent-ink)", letterSpacing: 0.2 }}>{p.masked ? "내 프로필 · 지금은 별칭으로 보여요" : "내 프로필"}</b>}
                  <span className="name">
                    {p.masked ? `“${p.name}”` : p.name}
                    {p.fresh && <FreshChip fresh={p.fresh} style={{ marginLeft: 6, verticalAlign: "middle" }} />}
                    {!p.masked && details(p) && <span style={{ font: `400 ${fs(13)} var(--body)`, color: "var(--sub)" }}> / {details(p)}</span>}
                  </span>
                  <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {p.isNew && <span className="chip red">신규 회원</span>}
                    {p.mine && p.hiddenMine && <span className="chip gray" title="설정 › 프로필 북에서 바꿀 수 있어요">다른 회원에게 숨김</span>}
                    {p.masked && <span className="chip line">내가 누구일까요?</span>}
                    {!p.hasIntro && <span className="chip gray">{p.mine && !p.masked ? "소개 작성하기" : "소개 준비 중"}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {filter !== "all" && !d.items.some((p) => (filter === "intro" ? p.hasIntro : p.fresh === filter)) && (
            <div className="msg info">{filter === "intro" ? "소개 글이 있는 회원이 없어요." : `${filter === "new" ? "NEW" : "UP"} 표시가 붙은 회원이 없어요.`}</div>
          )}
        </>
      )}
      <MemberTabs on="profiles" />
    </main>
  );
}
