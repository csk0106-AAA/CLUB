"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { OrgClubs, type OrgClub, type OrgItem } from "@/components/OrgChart";
import { Popup } from "@/components/Popup";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { isGuest } from "@/lib/member-kind";

// 관리자 › 회원관리 › 조직도. 회원 구분과 연동된다:
//  - 모임 직책 체계 = 회원 구분 › 직책 목록(순서 그대로, 일반회원 제외). 직책마다 맡을 회원을 여러 명 고른다(회원 명단의 직책 값).
//  - 소모임 = 소모임관리의 소모임 목록 + 소모임 직책자·모임 주기.
// 회원은 홈의 "조직도"에서 같은 그림을 본다.
type Note = { tone: "bad" | "info"; text: string } | null;
type Member = { id: string; name: string; kind: string; position: string };
type Org = { items: (OrgItem & { memberIds: string[] })[]; clubs: OrgClub[] };

function Assign({ position, members, current, onClose, onSaved }: {
  position: string; members: Member[]; current: string[]; onClose: () => void; onSaved: (text: string) => void;
}) {
  const [pick, setPick] = useState<string[]>(current);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify([...pick].sort()) !== JSON.stringify([...current].sort());
  const shown = members.filter((m) => !q.trim() || m.name.includes(q.trim()));

  async function save() {
    setBusy(true);
    setErr("");
    const r = await api<{ changed: number }>("/api/admin/org", { body: { position, memberIds: pick } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onSaved(`${position}: ${pick.length ? `${pick.length}명으로 정했어요.` : "비워 뒀어요."}`);
  }

  return (
    <Popup id="org-assign" width={480} title={`${position} 회원 선택`} open onClose={onClose} dirty={dirty}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="small" style={{ margin: 0 }}>여러 명을 고를 수 있어요. 다른 직책이던 회원을 고르면 이 직책으로 바뀌고(회원 한 명은 직책 하나), 빼면 일반회원이 돼요.</p>
        {err && <div className="msg bad" role="alert">{err}</div>}
        <input className="field" type="search" placeholder="이름 찾기" aria-label="이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
          {shown.map((m) => {
            const on = pick.includes(m.id);
            const other = m.position && m.position !== position && m.position !== "일반회원" ? m.position : "";
            return (
              <label key={m.id} className="row" style={{ gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--line2)", cursor: "pointer" }}>
                <input type="checkbox" checked={on} onChange={() => setPick(on ? pick.filter((x) => x !== m.id) : [...pick, m.id])} />
                <span className="grow" style={{ fontSize: fs(14) }}>{m.name}</span>
                {other && <span className="small" style={{ fontSize: fs(12) }}>지금 {other}{on ? " → 바뀜" : ""}</span>}
              </label>
            );
          })}
          {shown.length === 0 && <p className="small" style={{ margin: 0, padding: 12 }}>맞는 회원이 없어요.</p>}
        </div>
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <span className="small grow">{pick.length}명 선택</span>
          <button className="btn" type="button" disabled={busy || !dirty} onClick={save} style={{ width: "auto", minWidth: 120, minHeight: 44, fontSize: fs(14) }}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </Popup>
  );
}

function OrgAdmin() {
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [note, setNote] = useState<Note>(null);
  const [open, setOpen] = useState("");

  const load = useCallback(async () => {
    const [o, m] = await Promise.all([api<Org>("/api/club/org"), api<{ members: Member[] }>("/api/admin/members")]);
    if (o.ok) setOrg(o.data);
    else setNote({ tone: "bad", text: o.error });
    if (m.ok) setMembers(m.data.members.filter((x) => !isGuest(x.kind)).map((x) => ({ id: x.id, name: x.name, kind: x.kind ?? "", position: x.position ?? "" })));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!org) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const cur = org.items.find((i) => i.dept === open);

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <section className="lcard" aria-labelledby="org-h1">
        <header className="lcard-h">
          <h2 id="org-h1">모임 직책 체계</h2>
          <p>직책 이름과 순서는 <Link href="/admin/kinds">회원 구분 › 직책</Link>에서 바꿔요. 직책마다 회원을 여러 명 고를 수 있어요.</p>
        </header>
        {org.items.length === 0 && <div className="lcard-b"><p className="small" style={{ margin: 0 }}>회원 구분 › 직책에 직책을 먼저 넣어 주세요.</p></div>}
        {org.items.map((i) => (
          <div key={i.dept} className="otrow">
            <b style={{ fontSize: fs(14), minWidth: 84 }}>{i.dept}</b>
            <span className="grow" style={{ fontSize: fs(14), color: i.names.length ? "var(--ink2)" : "var(--dis)" }}>{i.names.length ? i.names.join(", ") : "미정"}</span>
            <button className="mini" type="button" aria-haspopup="dialog" onClick={() => { setNote(null); setOpen(i.dept); }}>회원 선택</button>
          </div>
        ))}
      </section>

      <section className="lcard" aria-labelledby="org-h2">
        <header className="lcard-h">
          <h2 id="org-h2">소모임</h2>
          <p><Link href="/admin/clubs">소모임관리</Link>에서 정한 소모임 직책자와 모임 주기를 보여 줘요. 여기서는 확인만 하고, 소모임 회원·직책자는 소모임관리에서 바꿔요. 소모임 직책 이름(리더·총무 등)은 회원 구분 › 소모임 직책에서 더할 수 있어요.</p>
        </header>
        <div className="lcard-b"><OrgClubs clubs={org.clubs} href={(n) => `/admin/clubs/${encodeURIComponent(n)}`} /></div>
      </section>

      {cur && (
        <Assign position={cur.dept} members={members} current={cur.memberIds} onClose={() => setOpen("")}
          onSaved={(text) => { setOpen(""); setNote({ tone: "info", text }); load(); }} />
      )}
    </>
  );
}

export default function ClubAdminPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/club"><OrgAdmin /></AdminGate>;
}
