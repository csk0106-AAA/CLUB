"use client";

import { useId, useState } from "react";

type M = { id: string; name: string; kind?: string; position?: string };

// 이름으로 찾아서 회원 한 명을 고르는 칸(소모임 회원 더하기, 참관자 추가에 같이 쓴다)
export function MemberSearch<T extends M>({ label, members, onPick, disabled }: {
  label: string;
  members: T[];
  onPick: (m: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const query = q.trim();
  const hits = query ? members.filter((m) => m.name.includes(query)).slice(0, 12) : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="l" htmlFor={id}>{label}</label>
      <input id={id} className="field" type="search" placeholder="이름을 입력해 주세요" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} />
      {query && hits.length === 0 && <span className="small">찾는 회원이 없어요.</span>}
      {hits.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {hits.map((m) => (
            <button key={m.id} className="mini" type="button" disabled={disabled} onClick={() => { onPick(m); setQ(""); }}>
              + {m.name}{m.kind ? <span className="small"> · {m.kind}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
