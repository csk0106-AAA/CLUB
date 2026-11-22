"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { ActionNote, type ActionMsg } from "./ActionNote";

// 관리자 › 모임설정: 명리학 풀이를 한 번만 받게 할지(비용). 바꾸면 바로 저장된다.
export function SajuOnceSwitch() {
  const [once, setOnce] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ActionMsg>(null);
  useEffect(() => {
    api<{ once: boolean }>("/api/admin/saju-once").then((r) => r.ok && setOnce(r.data.once));
  }, []);
  async function set(v: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await api<{ once: boolean }>("/api/admin/saju-once", { method: "PUT", body: { once: v } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setOnce(r.data.once);
    setMsg({ tone: "info", text: r.data.once ? "이제 명리학 풀이는 회원마다 한 번만 받을 수 있어요." : "명리학 풀이를 다시 받을 수 있어요(테스트용)." });
  }
  if (once === null) return null;
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>명리학 풀이 다시 받기</b>
      <div className="seg" role="group" aria-label="명리학 풀이 다시 받기">
        <button type="button" aria-pressed={!once} disabled={busy} onClick={() => set(false)} style={{ minHeight: 40 }}>다시 받기 허용 (테스트)</button>
        <button type="button" aria-pressed={once} disabled={busy} onClick={() => set(true)} style={{ minHeight: 40 }}>한 번만</button>
      </div>
      <span className="small">명리학 풀이는 AI 비용이 들어요. 생년월일이 바뀌지 않으니 실제 운영에서는 “한 번만”을 권해요. 한 번만으로 하면 이미 풀이를 받은 회원은 다시 받을 수 없어요(풀이를 지워도 다시 받을 수 없어요).</span>
      <ActionNote msg={msg} />
    </div>
  );
}
