"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, type AvatarView } from "@/components/Avatars";
import { downloadReading, Md, OldReadingNote, SajuInfoView, type SajuInfo } from "@/components/SajuPanel";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

export default function ProfilePage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = use(params);
  const router = useRouter();
  const [p, setP] = useState<{
    alias: string; name: string; introMd: string; mine: boolean; masked: boolean;
    myActivity: { aid: string; eventId: string } | null; // 내가 참여 중인 '내가 누굴까요?'(그 활동에서 소개를 쓴다)
    company: string; title: string; clubs: string[]; avatar: AvatarView; // 실명 공개 뒤에만 값이 있다
    truthLies: { statements: string[]; lieIndex: number } | null;
    traitsMd: string; readingMd: string; sajuInfo: SajuInfo | null;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<NonNullable<typeof p>>(`/api/profiles/${pid}`).then((r) => {
      if (r.ok) setP(r.data);
      else if (r.status === 401) router.replace("/");
      else if (r.status === 403) router.replace("/profiles"); // 동의 전: 프로필 북 화면에서 동의 팝업을 보여 준다
      else setError(r.error);
    });
  }, [pid, router]);

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: fs(15) }} onClick={() => router.push("/profiles")}>‹ 프로필 북</button>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!p && !error && <p className="small">불러오는 중이에요…</p>}
      {p && (
        <>
          <div className="row">{p.name ? <Avatar member={{ name: p.name, avatar: p.avatar }} size={56} />
            /* 별칭(실명 공개 전): 사진·캐릭터 대신 프로필북 목록과 같은 물음표(마스코트는 새싹이 캐릭터와 헷갈려서 쓰지 않는다) */
            : <span className="avatar" aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 14, background: "var(--violet-bg)", color: "var(--accent-ink)", fontSize: fs(22), flex: "none" }}>?</span>}<div><h1 className="title" style={{ fontSize: fs(22) }}>{p.name || `“${p.alias}”`}</h1>{p.masked && <div className="small">“내가 누굴까요?” 참여 중 · 실명 공개 전까지 별칭으로 보여요</div>}</div></div>
          {p.name && (
            <p style={{ margin: 0, fontWeight: 700 }}>
              {[p.name, p.company, p.title, (p.clubs ?? []).join(", ")].filter((x) => x && x.trim()).join(" / ")}
            </p>
          )}
          {p.mine && <span className="pill blue" style={{ alignSelf: "flex-start" }}>내 소개</span>}
          {p.introMd ? (
            <article className="card" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{p.introMd}</article>
          ) : p.mine && p.myActivity ? (
            // 게임 참여 중: 그 활동에서 별칭으로 소개를 쓴다
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b style={{ font: `700 ${fs(16)} var(--display)` }}>“내가 누굴까요?” 활동에서 소개를 작성해요</b>
              <span className="small">참여 중인 활동의 AI 인터뷰로 소개를 쓰면, 실명 공개 시점 전까지 별칭으로 여기에 보여요.</span>
              <Link className="btn" href={`/events/${p.myActivity.eventId}/who/${p.myActivity.aid}`} style={{ textDecoration: "none" }}>활동에서 소개 작성하기</Link>
            </div>
          ) : p.mine ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <b style={{ font: `700 ${fs(16)} var(--display)` }}>AI와의 인터뷰를 통해 나를 소개하세요.</b>
              <Link className="btn" href="/profiles/write" style={{ textDecoration: "none", width: "auto", minWidth: 180 }}>소개 작성하기</Link>
            </div>
          ) : (
            <div className="msg info">아직 소개를 작성하지 않았어요.</div>
          )}
          {/* 내 소개가 있으면 고치기(게임 참여 중에는 활동 화면에서) */}
          {p.mine && p.introMd && (
            p.myActivity
              ? <Link className="btn white" href={`/events/${p.myActivity.eventId}/who/${p.myActivity.aid}`} style={{ textDecoration: "none", width: "auto", alignSelf: "flex-start" }}>활동에서 소개 고치기</Link>
              : <Link className="btn white" href="/profiles/write" style={{ textDecoration: "none", width: "auto", alignSelf: "flex-start" }}>내 소개 고치기</Link>
          )}
          {p.truthLies && p.truthLies.statements.length === 3 && (
            <section className="card" aria-label="2진실 1거짓" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <b style={{ font: `700 ${fs(17)} var(--display)` }}>2진실 1거짓</b>
              <span className="small">활동이 끝나 정답과 함께 공개해요.</span>
              {p.truthLies.statements.map((t, i) => {
                const lie = i === p.truthLies!.lieIndex;
                return (
                  <div key={i} className="row" style={{ alignItems: "flex-start" }}>
                    <span className={`pill ${lie ? "bad" : "ok"}`} style={{ flex: "none", marginTop: 3 }}>{lie ? "거짓" : "진실"}</span>
                    <span style={{ fontWeight: 700 }}>{t}</span>
                  </div>
                );
              })}
            </section>
          )}
          {p.traitsMd && (
            <section className="card" aria-label="명리학으로 본 성격과 성향" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <b style={{ font: `700 ${fs(17)} var(--display)` }}>명리학으로 본 성격과 성향</b>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{p.traitsMd}</p>
            </section>
          )}
          {p.mine && p.readingMd && (
            <details className="card" style={{ borderStyle: "dashed" }}>
              <summary style={{ fontWeight: 700, cursor: "pointer" }}>나만 보는 생애주기 명리 풀이 <span className="pill gray">나만 보기</span></summary>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                {p.sajuInfo ? <SajuInfoView info={p.sajuInfo} /> : <OldReadingNote />}
                <Md text={p.readingMd} />
                <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: fs(15) }} onClick={() => downloadReading(p.sajuInfo, p.readingMd)}>
                  내 기기로 내려받기 (.txt)
                </button>
              </div>
              <span className="small" style={{ display: "block", marginTop: 8 }}>다른 회원에게는 보이지 않아요. 성격·성향 글을 소개 페이지에서 빼거나 풀이를 지우려면 “내가 누굴까요?”의 내 소개 화면에서 할 수 있어요.</span>
            </details>
          )}
        </>
      )}
    </main>
  );
}
