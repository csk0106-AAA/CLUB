"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { MemberTabs } from "@/components/MemberTabs";
import { api } from "@/lib/client";

type Me = { name: string; perms: string[]; consent: boolean; gender: string };

// 회원 설정 탭: 내 정보, 원우회 정보(조직도·회칙), 로그아웃. 관리자 화면은 하단 "관리자" 탭으로 옮겼다.
export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [club, setClub] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      if (r.ok) setMe(r.data);
      else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
    api<{ clubName: string }>("/api/public/club").then((c) => c.ok && setClub(c.data.clubName));
  }, [router]);

  const [saving, setSaving] = useState(false);
  async function saveGender(gender: "남" | "여") {
    if (!me || me.gender === gender) return;
    setSaving(true);
    const r = await api<{ gender: string }>("/api/me", { method: "PATCH", body: { gender } });
    setSaving(false);
    if (r.ok) setMe({ ...me, gender: r.data.gender });
    else setError(r.error);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.push("/");
  }

  const linkCard = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit", minHeight: 58 } as const;

  return (
    <main className="app with-tabs">
      <h1 className="title">설정</h1>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!me && !error && <p className="small">불러오는 중이에요…</p>}
      {me && (
        <>
          <div className="say" style={{ alignItems: "center" }}>
            <Mascot size={56} />
            <div className="grow">
              <b style={{ font: "400 20px var(--display)" }}>{me.name} 님</b>
              {club && <div className="small">{club}</div>}
            </div>
          </div>

          <section className="card" aria-label="내 정보" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ font: "400 19px var(--display)" }}>내 정보</b>
            <span className="l" id="g-l" style={{ marginBottom: 0 }}>성별</span>
            <div className="row" role="group" aria-labelledby="g-l">
              {(["남", "여"] as const).map((x) => (
                <button key={x} type="button" className="opt rowopt" aria-pressed={me.gender === x} disabled={saving} onClick={() => saveGender(x)}>
                  <span className="name grow">{x}</span><span className="tick" />
                </button>
              ))}
            </div>
            <span className="small">{me.gender ? "바꾸면 바로 저장돼요." : "아직 성별이 없어요. 명리학 풀이를 보려면 골라 주세요."}</span>
          </section>

          <Link href="/club" className="card" style={linkCard}>
            <span><b style={{ font: "400 19px var(--display)" }}>원우회 정보</b><span className="small" style={{ display: "block" }}>조직도와 확정된 회칙</span></span>
            <span aria-hidden="true" style={{ color: "var(--blue-t)", fontWeight: 700 }}>›</span>
          </Link>
          <div className="card">
            <b style={{ font: "400 19px var(--display)" }}>개인정보</b>
            <div className="small">
              {me.consent
                ? "동의했어요. 내가 공개로 선택한 내용만 회원들에게 보여요. 작성한 내용은 각 활동 화면에서 언제든 고치거나 지울 수 있어요."
                : "아직 동의하지 않았어요. 행사 탭에서 동의하면 활동에 참여할 수 있어요."}
            </div>
          </div>

          <div className="footer-actions">
            <button className="btn white" type="button" onClick={logout}>로그아웃</button>
          </div>
        </>
      )}
      <MemberTabs on="settings" />
    </main>
  );
}
