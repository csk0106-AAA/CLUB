"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { teamQ } from "./TeamScope";
import { playSfx } from "@/lib/sfx";

type Live = { active: boolean; stepKey: string; stepLabel: string; unlocked: boolean };

// 진행자 전체화면 위쪽의 회원 화면 조작: 잠그기 ↔ 다시 열기.
// (처음으로는 진행에 필요 없어 설정 화면의 진행자 컨트롤에만 둔다 — 진행 버튼이 회원 화면을 알아서 바꾼다)
// 진행하다가 설정 화면으로 돌아가지 않아도 여기서 바로 누른다(설정 화면의 진행자 컨트롤과 같은 동작).
//  team: 조별 진행이면 그 조의 회원 화면만 다룬다. withSteps: 진행 화면이 따로 없는 활동이면 단계 버튼도 보인다(팀 화면).
export function HostLiveControls({ eventId, aid, onChange, team, withSteps }: { eventId: string; aid: string; onChange?: () => void; team?: string | null; withSteps?: boolean }) {
  const url = `/api/admin/events/${eventId}/activities/${aid}/live${teamQ(team)}`;
  const [live, setLive] = useState<Live | null>(null);
  const [steps, setSteps] = useState<{ key: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (team === null) return;
    const r = await api<{ live: Live; kind?: string; steps?: { key: string; label: string }[] }>(url);
    if (r.ok) {
      setLive(r.data.live);
      // 내가 누구일까요?·나의 고민은? 은 그 진행 화면의 버튼으로만 진행한다(단계만 바꾸면 차례·뽑기 상태와 어긋난다)
      setSteps(r.data.kind === "who" || r.data.kind === "worry" ? [] : r.data.steps ?? []);
    }
  }, [url, team]);
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
    if (body.action === "activate" && body.step !== "seal") playSfx("ding");
    setLive(r.data.live);
    onChange?.();
  }

  if (!live) return null;
  const btn = { minHeight: 34, fontSize: 14, padding: "0 12px" } as const;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} role="group" aria-label="회원 화면 조작">
      {withSteps && steps.map((s) => (
        <button key={s.key} className="mini" type="button" disabled={busy} aria-pressed={live.stepKey === s.key && live.unlocked}
          style={{ ...btn, ...(live.stepKey === s.key && live.unlocked ? { background: "var(--brand)", borderColor: "var(--brand)", color: "var(--on-brand)" } : {}) }}
          onClick={() => send({ action: "activate", step: s.key })}>{s.label}</button>
      ))}
      <span className="sub" style={{ fontSize: 14 }}>
        회원 화면: <b style={{ color: live.active && live.unlocked ? "#7ee2a8" : "#ffb4a8" }}>{live.active ? (live.unlocked ? `열림 · ${live.stepLabel}` : "잠김") : "시작 전"}</b>
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
