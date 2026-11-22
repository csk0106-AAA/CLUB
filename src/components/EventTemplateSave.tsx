"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ActionNote, type ActionMsg } from "./ActionNote";

type Tpl = { type: string; fromId: string; fromName: string; savedAt: string };

// 관리자 › 일정 › 개요 아래: 이 일정을 그 유형의 템플릿으로 저장(lib/event-template.ts).
//  저장하면 "일정 만들기"에서 같은 유형을 고를 때 이 일정의 내용으로 채울 수 있다. 일정관리 권한자만.
export function EventTemplateSave({ eventId, type }: { eventId: string; type: string }) {
  const [tpl, setTpl] = useState<Tpl | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ActionMsg>(null);

  useEffect(() => {
    api<{ templates: Record<string, Tpl> }>("/api/admin/event-templates").then((r) => setTpl(r.ok ? r.data.templates[type] ?? null : null));
  }, [type]);

  async function save() {
    if (tpl && !window.confirm(`지금 ${type} 템플릿(“${tpl.fromName}”)을 이 일정의 지금 내용으로 바꿀까요?`)) return;
    setBusy(true);
    const r = await api<{ template: Tpl }>("/api/admin/event-templates", { body: { eventId } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setTpl(r.data.template);
    setMsg({ tone: "info", text: `${type} 템플릿으로 저장했어요. 일정 만들기에서 ${type}을 고르면 이 내용으로 채워져요.` });
  }
  async function remove() {
    if (!window.confirm(`${type} 템플릿을 지울까요? 이 일정은 그대로 남아요.`)) return;
    setBusy(true);
    const r = await api("/api/admin/event-templates", { method: "DELETE", body: { type } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setTpl(null);
    setMsg({ tone: "info", text: `${type} 템플릿을 지웠어요.` });
  }

  if (tpl === undefined) return null;
  const isThis = tpl?.fromId === eventId;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className="small grow" style={{ minWidth: 200 }}>
          {tpl ? <>지금 {type} 템플릿: <b>{tpl.fromName}</b>{isThis ? " (이 일정)" : ""} · {tpl.savedAt.slice(0, 10)} 저장</> : `${type} 템플릿이 아직 없어요.`}
          {" "}템플릿으로 저장하면 일정 만들기에서 {type}을 고를 때 세부일정·활동·준비목록·비용·회비·안내가 채워져요.
        </span>
        <button className="btn white" type="button" disabled={busy} style={{ width: "auto", minWidth: 200 }} onClick={save}>
          {isThis ? "템플릿 다시 저장" : `${type} 템플릿으로 저장`}
        </button>
        {tpl && <button className="mini" type="button" disabled={busy} onClick={remove}>템플릿 지우기</button>}
      </div>
      <ActionNote msg={msg} />
    </div>
  );
}
