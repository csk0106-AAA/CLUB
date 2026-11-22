"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { ActionNote, type ActionMsg } from "./ActionNote";

type Data = { once: boolean; members: { id: string; name: string; retry: boolean }[] };

// 관리자 › 모임설정: 명리학 풀이 다시 받기. 기본은 "한 번만"(AI 비용). 필요하면 회원마다 다시 받기를 허용한다(한 번 쓰면 다시 막힘).
export function SajuOnceSwitch() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ActionMsg>(null);
  const load = useCallback(async () => {
    const r = await api<Data>("/api/admin/saju-once");
    if (r.ok) setD(r.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function put(body: { once: boolean } | { memberId: string; retry: boolean }, text: string) {
    setBusy(true);
    setMsg(null);
    const r = await api("/api/admin/saju-once", { method: "PUT", body });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text });
    await load();
  }
  if (!d) return null;
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>명리학 풀이 다시 받기</b>
      <div className="seg" role="group" aria-label="명리학 풀이 다시 받기">
        <button type="button" aria-pressed={d.once} disabled={busy} onClick={() => put({ once: true }, "이제 명리학 풀이는 회원마다 한 번만 받을 수 있어요.")} style={{ minHeight: 40 }}>한 번만 (기본)</button>
        <button type="button" aria-pressed={!d.once} disabled={busy} onClick={() => put({ once: false }, "모든 회원이 명리학 풀이를 다시 받을 수 있어요(테스트용).")} style={{ minHeight: 40 }}>모두 다시 받기 허용 (테스트)</button>
      </div>
      <span className="small">명리학 풀이는 AI 비용이 들고 생년월일이 바뀌지 않아서, 회원마다 한 번만 받아요. 받은 풀이는 계속 볼 수 있어요. 잘못 입력한 회원처럼 다시 받아야 하면 아래에서 그 회원만 허용해 주세요(한 번 더 받으면 다시 막혀요).</span>
      {d.once && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <b style={{ fontSize: fs(14) }}>회원별 다시 받기 허용 (풀이를 받은 회원 {d.members.length}명)</b>
          {d.members.length === 0 && <span className="small">아직 풀이를 받은 회원이 없어요.</span>}
          {d.members.map((m) => (
            <div key={m.id} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="grow">{m.name}</span>
              {m.retry && <span className="pill blue">다시 받기 허용됨</span>}
              <button className="mini" type="button" disabled={busy}
                onClick={() => put({ memberId: m.id, retry: !m.retry }, m.retry ? `${m.name} 님의 다시 받기 허용을 취소했어요.` : `${m.name} 님이 명리학 풀이를 한 번 더 받을 수 있어요.`)}>
                {m.retry ? "허용 취소" : "다시 받기 허용"}
              </button>
            </div>
          ))}
        </div>
      )}
      <ActionNote msg={msg} />
    </div>
  );
}
