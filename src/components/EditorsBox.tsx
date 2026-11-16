"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

type Person = { id: string; name: string };
type Data = { editors: Person[]; candidates: Person[]; canManage: boolean; createdBy?: string };

// 편집자 칸(일정 개요·게시글 보기 공통). 만든 사람(또는 모든권한·일정관리)이 권한 있는 회원 중에서 편집자를 더하고 뺀다.
//  endpoint: GET {editors, candidates, canManage} / PUT {editors: id[]}
//  what: "일정" | "글", need: 후보 조건 설명(예: "정기모임 일정을 만들 권한")
export function EditorsBox({ endpoint, what, need }: { endpoint: string; what: string; need: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await api<Data>(endpoint);
    if (r.ok) setD(r.data);
    else if (r.status !== 403) setNote({ tone: "bad", text: r.error });
  }, [endpoint]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(ids: string[], text: string) {
    setBusy(true);
    setNote(null);
    const r = await api(endpoint, { method: "PUT", body: { editors: ids } });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text });
    setPick("");
    load();
  }

  if (!d) return note ? <div className={`msg ${note.tone}`} role="alert">{note.text}</div> : null;
  const ids = d.editors.map((e) => e.id);
  const left = d.candidates.filter((c) => !ids.includes(c.id));

  return (
    <section className="card" aria-labelledby="ed-h" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b id="ed-h" style={{ font: `700 ${fs(16)} var(--display)` }}>편집자</b>
      <span className="small">
        {d.createdBy ? `만든 사람: ${d.createdBy} · ` : ""}편집자로 추가한 회원은 이 {what}을 고칠 수 있어요(지우기는 만든 사람만). {need}이 있는 회원만 추가할 수 있어요.
      </span>
      {d.editors.length === 0 ? (
        <span className="small">아직 편집자가 없어요.</span>
      ) : (
        <ul className="row" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6, flexWrap: "wrap" }} aria-label="편집자">
          {d.editors.map((e) => (
            <li key={e.id} className="chip line" style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 32 }}>
              {e.name}
              {d.canManage && (
                <button type="button" className="mini danger" style={{ minHeight: 26, padding: "0 6px" }} disabled={busy}
                  aria-label={`${e.name} 편집자에서 빼기`} onClick={() => save(ids.filter((x) => x !== e.id), `${e.name} 님을 편집자에서 뺐어요.`)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {d.canManage && (
        left.length > 0 ? (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="field" aria-label="편집자로 추가할 회원" style={{ flex: "1 1 180px", width: "auto", minHeight: 44 }} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">회원 고르기</option>
              {left.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="mini" type="button" style={{ minHeight: 44 }} disabled={busy || !pick}
              onClick={() => save([...ids, pick], `${left.find((c) => c.id === pick)?.name ?? ""} 님을 편집자로 추가했어요.`)}>+ 편집자 추가</button>
          </div>
        ) : (
          <span className="small">{d.candidates.length === 0 ? `${need}이 있는 다른 회원이 없어요. 관리자 › 회원관리 › 권한에서 권한을 먼저 주세요.` : "추가할 수 있는 회원을 모두 추가했어요."}</span>
        )
      )}
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
    </section>
  );
}
