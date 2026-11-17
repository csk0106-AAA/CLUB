"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Live = { active: boolean; stepKey: string; stepLabel: string; unlocked: boolean };

// 진행자 전체화면 위쪽의 회원 화면 조작: 잠그기 ↔ 다시 열기.
// (처음으로는 진행에 필요 없어 설정 화면의 진행자 컨트롤에만 둔다 — 진행 버튼이 회원 화면을 알아서 바꾼다)
// 진행하다가 설정 화면으로 돌아가지 않아도 여기서 바로 누른다(설정 화면의 진행자 컨트롤과 같은 동작).
export function HostLiveControls({ eventId, aid, onChange }: { eventId: string; aid: string; onChange?: () => void }) {
  const url = `/api/admin/events/${eventId}/activities/${aid}/live`;
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ live: Live }>(url);
    if (r.ok) setLive(r.data.live);
  }, [url]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  async function send(body: Record<string, string>) {
    setBusy(true);
    setErr("");
    const r = await api<{ live: Live }>(url, { body });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setLive(r.data.live);
    onChange?.();
  }

  if (!live) return null;
  const btn = { minHeight: 34, fontSize: 14, padding: "0 12px" } as const;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} role="group" aria-label="회원 화면 조작">
      <span className="sub" style={{ fontSize: 14 }}>
        회원 화면: <b style={{ color: live.active && live.unlocked ? "#7ee2a8" : "#ffb4a8" }}>{live.active ? (live.unlocked ? "열림" : "잠김") : "시작 전"}</b>
      </span>
      {live.active && live.unlocked && (
        <button className="mini" type="button" disabled={busy} style={btn} title="회원 휴대폰 화면을 대기 화면으로 잠가요(진행 단계는 그대로)" onClick={() => send({ action: "lock" })}>잠그기</button>
      )}
      {live.active && !live.unlocked && (
        <button className="mini" type="button" disabled={busy} style={btn} title="잠근 회원 화면을 지금 단계로 다시 켜요" onClick={() => send({ action: "activate", step: live.stepKey })}>다시 열기</button>
      )}
      {err && <span role="alert" style={{ color: "#ffb4a8", fontSize: 13 }}>{err}</span>}
    </span>
  );
}
