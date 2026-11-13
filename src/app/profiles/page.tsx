"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberTabs } from "@/components/MemberTabs";
import { Sheet } from "@/components/Sheet";
import { api, fmtDateTime } from "@/lib/client";

type Data = {
  revealed: boolean; revealAt: string;
  items: { id: string; alias: string; name: string; mine: boolean }[];
  missingCount: number; missing: { name: string }[];
};

// 회원 프로필 북: 공개로 승인된 소개만 보인다. 공개 시점 전에는 별칭, 이후에는 실명.
export default function ProfilesPage() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  // 개인정보 동의 전에는 다른 회원의 프로필 북을 볼 수 없다. popup: 안내 팝업을 띄울지
  const [locked, setLocked] = useState(false);
  const [popup, setPopup] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/profiles");
    if (r.ok) {
      setD(r.data);
      setLocked(false);
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
      <h1 className="title">회원 프로필 북</h1>
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
            프로필 북에는 회원들이 공개로 승인한 소개가 담겨 있어요. 서로의 소개를 함께 나누는 공간이라, 개인정보 안내에 동의한 회원만 볼 수 있어요.
          </p>
          <div className="card" style={{ background: "var(--soft)" }}>
            <b>개인정보 안내</b>
            <div className="small">작성하신 내용 중 본인이 공개로 선택한 부분은 원우회 회원들에게 보여집니다. 언제든 수정·삭제할 수 있습니다.</div>
          </div>
          <button className="btn" type="button" disabled={busy} onClick={agree}>동의하고 프로필 북 보기</button>
          <button className="btn white" type="button" onClick={() => setPopup(false)}>동의하지 않음</button>
        </Sheet>
      )}
      {d && (
        <>
          <p className="small" style={{ margin: 0 }}>
            {d.revealed ? "회원이 공개로 승인한 소개를 실명으로 보여 드려요." : `회원이 공개로 승인한 소개예요. 지금은 별칭으로만 보여요${d.revealAt ? ` (${fmtDateTime(d.revealAt)}부터 실명)` : ""}.`}
          </p>
          {d.items.length === 0 && <div className="msg info">아직 공개된 소개가 없어요. 회원이 작성하고 배포하면 여기에 나타나요.</div>}
          <div className="pick">
            {d.items.map((p) => (
              <button key={p.id} type="button" className="opt" onClick={() => router.push(`/profiles/${p.id}`)}>
                <span className="name">{d.revealed && p.name ? p.name : `“${p.alias}”`}</span>
                {d.revealed && p.name && <span className="small">별칭 “{p.alias}”</span>}
                {p.mine && <span className="pill blue">내 소개</span>}
              </button>
            ))}
          </div>
          {d.revealed ? (
            d.missing.length > 0 && <div className="card"><b>미작성</b><div className="small">{d.missing.map((m) => m.name).join(", ")}</div></div>
          ) : (
            d.missingCount > 0 && <p className="hint">아직 작성하지 않은 회원이 {d.missingCount}명 있어요.</p>
          )}
        </>
      )}
      <MemberTabs on="profiles" />
    </main>
  );
}
