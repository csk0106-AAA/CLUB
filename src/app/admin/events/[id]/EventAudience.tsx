"use client";

import { useState } from "react";
import { AudiencePicker } from "@/components/AudiencePicker";
import type { Audience } from "@/lib/audience";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

const ALL: Audience = { mode: "all", events: [], clubs: [], memberIds: [] };

function read(text?: string): Audience {
  try {
    const a = text ? (JSON.parse(text) as Partial<Audience>) : null;
    if (!a || !a.mode || a.mode === "all") return ALL;
    return { mode: a.mode, events: a.events ?? [], clubs: a.clubs ?? [], memberIds: a.memberIds ?? [] };
  } catch {
    return ALL;
  }
}

// 소모임이 아닌 일정의 공개 대상. 일정 목록·참석 신청·알림이 모두 이 대상에게만 보인다.
export function EventAudience({ eventId, audience, onSaved }: { eventId: string; audience?: string; onSaved: () => void }) {
  const [saved, setSaved] = useState<Audience>(() => read(audience));
  const [value, setValue] = useState<Audience>(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  async function save() {
    if (value.mode !== "all" && value.memberIds.length === 0) return setMsg({ tone: "bad", text: "공개할 회원을 한 명 이상 골라 주세요." });
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/admin/events/${eventId}`, { method: "PATCH", body: { audience: value } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setSaved(value);
    setMsg({ tone: "info", text: value.mode === "all" ? "전체 회원에게 보여요." : `고른 회원 ${value.memberIds.length}명에게만 보여요.` });
    onSaved();
  }

  return (
    <section className="card" aria-label="공개 대상" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>공개 대상</b>
      <span className="small">이 일정은 고른 회원에게만 목록·참석 신청·알림이 보여요. 전체 회원이 기본이에요.</span>
      <AudiencePicker value={value} onChange={setValue} legend="누구에게 보일까요?" />
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <button className="btn" type="button" disabled={busy || !dirty} style={{ width: "auto", minWidth: 160, alignSelf: "flex-start", minHeight: 46, fontSize: fs(15) }} onClick={save}>
        {busy ? "저장 중…" : "공개 대상 저장"}
      </button>
    </section>
  );
}
