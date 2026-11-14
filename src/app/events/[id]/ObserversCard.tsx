"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { MemberSearch } from "./MemberSearch";

// "골프 · 회장 홍길동"
export function clubLine(club: string, leaders?: { name: string; role: string }[]): string {
  return [club, ...(leaders ?? []).map((l) => `${l.role} ${l.name}`)].join(" · ");
}

type P ={ id: string; name: string; kind?: string; position?: string };
type Data = { club: string; observers: P[]; candidates: P[] };

// 소모임 행사의 참관자 추가 카드. 소모임 회장(직책자)이 회원 화면에서, 관리자가 행사 관리 화면에서 쓴다.
// 바꿀 때마다 바로 저장한다(서버가 직책을 다시 확인).
export function ObserversCard({ eventId, admin, onChange }: { eventId: string; admin?: boolean; onChange?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/events/${eventId}/observers`);
    if (r.ok) setD(r.data);
    else setMsg({ tone: "bad", text: r.error });
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(ids: string[], text: string) {
    setBusy(true);
    setMsg(null);
    const r = await api<Data>(`/api/events/${eventId}/observers`, { method: "PUT", body: { observers: ids } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setD(r.data);
    setMsg({ tone: "info", text });
    onChange?.();
  }

  if (!d) return msg ? <div className={`msg ${msg.tone}`} role="alert">{msg.text}</div> : null;
  const ids = d.observers.map((o) => o.id);

  return (
    <section className="card" aria-label="참관자" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: "400 19px var(--display)" }}>참관자 추가</b>
      <span className="small">
        {d.club} 회원이 아닌 분도 참관자로 넣으면 이 행사를 보고 참석 신청할 수 있어요.
        {admin ? "" : " 소모임 회장만 보이는 칸이에요."}
      </span>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {d.observers.length === 0 && <span className="small">아직 참관자가 없어요.</span>}
      {d.observers.map((o) => (
        <div key={o.id} className="row" style={{ gap: 6 }}>
          <span className="pill blue">참관자</span>
          <b className="grow">{o.name}</b>
          <button className="mini danger" type="button" disabled={busy} onClick={() => save(ids.filter((x) => x !== o.id), `${o.name} 님을 참관자에서 뺐어요.`)}>빼기</button>
        </div>
      ))}
      <MemberSearch
        label={`참관자 찾기 (${d.club} 밖의 회원)`}
        members={d.candidates.filter((c) => !ids.includes(c.id))}
        disabled={busy}
        onPick={(m) => save([...ids, m.id], `${m.name} 님을 참관자로 넣었어요.`)}
      />
    </section>
  );
}
