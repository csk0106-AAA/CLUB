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
  // 활동 팀에서 복사해 만들기: 복사할 수 있는 팀 활동 목록과 고른 활동("" = 새로 만들기)
  const [sources, setSources] = useState<{ id: string; name: string; teamCount: number }[]>([]);
  const [from, setFrom] = useState("");
  // 고른 조편성의 제목 고치기
  const [rename, setRename] = useState<string | null>(null); // null = 고치는 중이 아님(현재 이름을 보여 줌)

  const load = useCallback(async () => {
    const r = await api<{ groups: G[]; sources?: { id: string; name: string; teamCount: number }[] }>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setList(r.data.groups);
    setSources(r.data.sources ?? []);
    setSel((s) => (r.data.groups.some((g) => g.id === s) ? s : r.data.groups[0]?.id ?? ""));
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await api<{ id: string; copied?: number }>(base, { body: { title, ...(from ? { fromActivity: from } : {}) } });
    if (!r.ok) return setErr(r.error);
    setTitle("");
    setFrom("");
    setOpen(false);
    setNote({ tone: "info", text: r.data.copied ? `활동 팀 ${r.data.copied}개를 복사해 조편성을 만들었어요. 여기서 고쳐도 활동 팀은 그대로예요. 확인을 눌러야 회원에게 배포돼요.` : "조편성을 만들었어요." });
    await load();
    setSel(r.data.id);
  }
  async function saveTitle(g: G) {
    const t = (rename ?? "").trim();
    if (!t || t === g.title) return setRename(null); // 비우고 나가면 원래 이름으로
    const r = await api(`${base}/${g.id}`, { method: "PATCH", body: { title: t } });
    setRename(null);
    setNote(r.ok ? { tone: "info", text: "조편성 이름을 바꿨어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(g: G) {
    if (!window.confirm(`“${g.title}” 조편성을 지울까요?`)) return;
    const r = await api(`${base}/${g.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!list) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const cur = list.find((g) => g.id === sel);
  const titleNow = rename ?? cur?.title ?? "";

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <span className="small">활동마다 조를 따로 만들 수 있어요. 조편성 이름과 조 이름(1조, 2조…)은 칸을 눌러 바로 고칠 수 있어요. 배포한 조편성은 해당 회원의 일정 화면에 “내 조”로 나와요.</span>
      <div className="subnav" role="tablist" aria-label="조편성 목록">
        {list.map((g) => (
          <a key={g.id} href="#" role="tab" aria-selected={sel === g.id} className={sel === g.id ? "on" : ""} onClick={(e) => { e.preventDefault(); setSel(g.id); setRename(null); }}>
            {g.title}{g.published ? " ✓" : ""}
          </a>
        ))}
      </div>
      {list.length === 0 && (sources.length > 0 ? (
        <div className="msg info">이 일정은 활동에서 짠 팀({sources.map((x) => x.name).join(", ")})이 있어요. 활동 팀만 쓴다면 여기서는 조편성을 만들지 않아도 돼요. 같은 조로 다른 프로그램(저녁 게임 등)도 하려면 “+ 조편성 만들기”에서 “활동 팀 복사”를 고르세요.</div>
      ) : <div className="msg info">아직 조편성이 없어요. “+ 조편성 만들기”로 만들어 보세요.</div>)}

      {cur && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {canEdit ? (
              // 조편성 제목: 바로 고치고 Enter 나 다른 곳을 누르면 저장
              <input className="field" aria-label="조편성 이름" maxLength={60} style={{ flex: "1 1 200px", minHeight: 42, font: `700 ${fs(16)} var(--display)` }}
                value={titleNow} onChange={(e) => setRename(e.target.value)} onBlur={() => saveTitle(cur)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} />
            ) : <b style={{ font: `700 ${fs(17)} var(--display)` }}>{cur.title}</b>}
            <span className="grow" />
            {canEdit && <button className="mini danger" type="button" onClick={() => remove(cur)}>이 조편성 지우기</button>}
          </div>
          <TeamBoard key={cur.id} base={`${base}/${cur.id}`} canEdit={canEdit} unit="조" screenHref={`/host/groups/${eventId}/${cur.id}`} leaders />
        </div>
      )}

      {canEdit && (
        <>
          <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={() => { setErr(""); setOpen(true); }}>+ 조편성 만들기</button>
          <Popup id="group-new" width={480} title="조편성 만들기" open={open} onClose={() => setOpen(false)} dirty={!!title.trim()}>
            <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {err && <div className="msg bad" role="alert">{err}</div>}
              {/* 활동 팀 복사: 이 일정의 팀 활동에서 짠 팀을 그대로 가져와 시작한다 */}
              {sources.length > 0 && (
                <div>
                  <label className="l" htmlFor="g-from">시작 방법</label>
                  <select id="g-from" className="field" value={from}
                    onChange={(e) => { const v = e.target.value; setFrom(v); const a = sources.find((x) => x.id === v); if (a && !title.trim()) setTitle(a.name); }}>
                    <option value="">새로 만들기(빈 조편성)</option>
                    {sources.map((a) => <option key={a.id} value={a.id}>활동 팀 복사 · {a.name} ({a.teamCount}개 팀)</option>)}
                  </select>
                </div>
              )}
              <div><label className="l" htmlFor="g-title">새 조편성 이름</label><input id="g-title" className="field" placeholder="예: 저녁 게임" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <span className="small">{from ? "고른 활동의 팀 이름과 조원을 그대로 복사해요. 복사한 뒤에는 서로 연결되지 않아요(따로 고칠 수 있어요)." : "만든 뒤 조 수와 조원을 정해요."}</span>
              <button className="btn" type="submit" disabled={!title.trim()} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }}>만들기</button>
            </form>
          </Popup>
        </>
      )}
    </>
  );
}
