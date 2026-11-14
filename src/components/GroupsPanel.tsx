"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Popup } from "./Popup";
import { TeamBoard } from "./TeamBoard";
import { fs } from "@/lib/fs";

type G = { id: string; title: string; published: boolean; teamCount: number; memberCount: number };

// 조편성: 활동 개수에 따라 여러 개를 만들 수 있다(예: 저녁 게임 3개 조, 아침 등산 2개 조).
export function GroupsPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/groups`;
  const [list, setList] = useState<G[] | null>(null);
  const [sel, setSel] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ groups: G[] }>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setList(r.data.groups);
    setSel((s) => (r.data.groups.some((g) => g.id === s) ? s : r.data.groups[0]?.id ?? ""));
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await api<{ id: string }>(base, { body: { title } });
    if (!r.ok) return setErr(r.error);
    setTitle("");
    setOpen(false);
    setNote({ tone: "info", text: "조편성을 만들었어요." });
    await load();
    setSel(r.data.id);
  }
  async function remove(g: G) {
    if (!window.confirm(`“${g.title}” 조편성을 지울까요?`)) return;
    const r = await api(`${base}/${g.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!list) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const cur = list.find((g) => g.id === sel);

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <span className="small">활동마다 조를 따로 만들 수 있어요. 배포한 조편성은 해당 회원의 일정 화면에 “내 조”로 나와요.</span>
      <div className="subnav" role="tablist" aria-label="조편성 목록">
        {list.map((g) => (
          <a key={g.id} href="#" role="tab" aria-selected={sel === g.id} className={sel === g.id ? "on" : ""} onClick={(e) => { e.preventDefault(); setSel(g.id); }}>
            {g.title}{g.published ? " ✓" : ""}
          </a>
        ))}
      </div>
      {list.length === 0 && <div className="msg info">아직 조편성이 없어요. “+ 조편성 만들기”로 만들어 보세요.</div>}

      {cur && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <b style={{ font: `700 ${fs(17)} var(--display)` }}>{cur.title}</b>
            <span className="grow" />
            {canEdit && <button className="mini danger" type="button" onClick={() => remove(cur)}>이 조편성 지우기</button>}
          </div>
          <TeamBoard key={cur.id} base={`${base}/${cur.id}`} canEdit={canEdit} unit="조" screenHref={`/host/groups/${eventId}/${cur.id}`} />
        </div>
      )}

      {canEdit && (
        <>
          <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={() => { setErr(""); setOpen(true); }}>+ 조편성 만들기</button>
          <Popup id="group-new" width={480} title="조편성 만들기" open={open} onClose={() => setOpen(false)} dirty={!!title.trim()}>
            <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {err && <div className="msg bad" role="alert">{err}</div>}
              <div><label className="l" htmlFor="g-title">새 조편성 이름</label><input id="g-title" className="field" placeholder="예: 저녁 게임" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <span className="small">만든 뒤 조 수와 조원을 정해요.</span>
              <button className="btn" type="submit" disabled={!title.trim()} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }}>만들기</button>
            </form>
          </Popup>
        </>
      )}
    </>
  );
}
