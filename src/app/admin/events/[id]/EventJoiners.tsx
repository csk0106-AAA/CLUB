"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 일정을 공개한 뒤 새로 가입했는데 공개 대상에 없는 회원 안내(공개 대상 카드 바로 위).
// 공개 대상에 넣기 / 넣지 않기. 공개 대상을 다시 저장해도 사라진다.
export function EventJoiners({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await api<{ joiners: { id: string; name: string }[] }>(`/api/admin/events/${eventId}/joiners`);
    if (r.ok) setList(r.data.joiners);
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "add" | "dismiss") {
    if (action === "dismiss" && !window.confirm("새로 가입한 회원을 공개 대상에 넣지 않을까요? 이 회원들은 이 일정을 열 수 없어요.")) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${eventId}/joiners`, { body: { action } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setList([]);
    onChanged();
  }

  if (list.length === 0) return null;
  return (
    <div className="fb info" role="alert">
      <span className="ic" aria-hidden="true">!</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <b>신규 회원이 가입했어요. 확인 후 공개 대상 업데이트가 필요해요</b>
        <span className="t">공개한 뒤 가입한 {list.map((j) => j.name).join(", ")} 님({list.length}명)은 지금 공개 대상에 없어서 이 일정을 열 수 없어요.</span>
        {err && <span className="t" style={{ color: "var(--red-t)" }}>{err}</span>}
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy} style={{ width: "auto", minHeight: 40, fontSize: fs(14) }} onClick={() => act("add")}>공개 대상에 넣기</button>
          <button type="button" className="btn white" disabled={busy} style={{ width: "auto", minHeight: 40, fontSize: fs(14) }} onClick={() => act("dismiss")}>넣지 않기</button>
        </div>
      </div>
    </div>
  );
}
