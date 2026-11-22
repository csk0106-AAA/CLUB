"use client";

import { ActionNote } from "@/components/ActionNote";
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

// 클럽이 아닌 일정의 공개 대상. 일정 목록·참석 신청·알림이 모두 이 대상에게만 보인다.
// club: 클럽 일정이면 클럽 이름("클럽회원&참관회원" 빠른 선택)
export function EventAudience({ eventId, audience, onSaved, club }: { eventId: string; audience?: string; onSaved: () => void; club?: string }) {
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
    setMsg({ tone: "info", text: value.mode === "all" ? "전체 회원에게 보여요." : value.mode === "clubs" ? "클럽 회원과 참관자에게만 보여요(클럽 명단이 바뀌면 자동 반영)." : `고른 회원 ${value.memberIds.length}명에게만 보여요.` });
    onSaved();
  }

  return (
    <section className="card" aria-label="공개 대상" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>공개 대상</b>
      <span className="small">{club ? `고른 회원에게만 이 일정이 보여요. 전체 회원이 기본이에요. 참석 신청은 보이는 회원 중 ${club} 클럽 회원과 참관자만 할 수 있어요.` : "이 일정은 고른 회원에게만 목록·참석 신청·알림이 보여요. 전체 회원이 기본이에요."}</span>
      <AudiencePicker value={value} onChange={setValue} legend="누구에게 보일까요?" membersOnly club={club || undefined} />
      <ActionNote msg={msg} />
      <button className="btn" type="button" disabled={busy || !dirty} style={{ width: "auto", minWidth: 160, alignSelf: "flex-start", minHeight: 46, fontSize: fs(15) }} onClick={save}>
        {busy ? "저장 중…" : "공개 대상 저장"}
      </button>
    </section>
  );
}
