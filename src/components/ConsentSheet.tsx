"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Sheet } from "./Sheet";

// 개인정보 안내 동의(처음 들어온 회원). 홈과 일정 화면이 같이 쓴다.
// 동의하기 전에는 일정 화면의 목록이 잠긴다(일정 화면이 consent 로 판단).
export function ConsentSheet({ consent, onAgreed }: { consent: boolean; onAgreed: () => void }) {
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function agree() {
    setBusy(true);
    const r = await api("/api/me/consent", { method: "POST", body: {} });
    setBusy(false);
    if (r.ok) onAgreed();
    else setError(r.error);
  }

  if (consent) return null;
  if (declined) {
    return (
      <>
        <div className="msg info">동의하지 않으면 활동에 참여할 수 없어요. 아래에서 다시 동의할 수 있어요.</div>
        <div className="footer-actions">
          <button className="btn" type="button" onClick={() => setDeclined(false)}>동의 안내 다시 보기</button>
        </div>
      </>
    );
  }
  return (
    <Sheet title="개인정보 안내">
      <p style={{ margin: 0 }}>
        작성하신 내용 중 본인이 공개로 선택한 부분은 원우회 회원들에게 보여집니다. 언제든 수정·삭제할 수 있습니다.
      </p>
      {error && <div className="msg bad" role="alert">{error}</div>}
      <button className="btn" type="button" disabled={busy} onClick={agree}>동의합니다</button>
      <button className="btn white" type="button" onClick={() => setDeclined(true)}>동의하지 않음</button>
    </Sheet>
  );
}
