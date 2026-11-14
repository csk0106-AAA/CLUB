"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, type AvatarView } from "@/components/Avatars";
import { Mascot } from "@/components/Mascot";
import { downloadReading, Md, OldReadingNote, SajuInfoView, type SajuInfo } from "@/components/SajuPanel";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

export default function ProfilePage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = use(params);
  const router = useRouter();
  const [p, setP] = useState<{
    alias: string; name: string; introMd: string; mine: boolean;
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
          <div className="row">{p.name ? <Avatar member={{ name: p.name, avatar: p.avatar }} size={56} fallback="mascot" /> : <Mascot size={56} />}<div><h1 className="title" style={{ fontSize: fs(22) }}>{p.name || `“${p.alias}”`}</h1>{p.name && <div className="small">별칭 “{p.alias}”</div>}</div></div>
          {p.name && (
            <p style={{ margin: 0, fontWeight: 700 }}>
              {[p.name, p.company, p.title, (p.clubs ?? []).join(", ")].filter((x) => x && x.trim()).join(" / ")}
            </p>
          )}
          {p.mine && <span className="pill blue" style={{ alignSelf: "flex-start" }}>내 소개</span>}
          <article className="card" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{p.introMd}</article>
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
