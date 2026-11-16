"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api, fmtDateTime } from "@/lib/client";
import { DEV_STATUSES, type DevRequest, type DevStatus } from "@/lib/dev-requests";
import { fs } from "@/lib/fs";

const TONE: Record<DevStatus, string> = { 접수: "blue", "진행 중": "warn", 완료: "ok", 보류: "gray" };

// 개발 요청: 템플릿 편집기의 “AI에게 요청”에서 지금 기능으로는 안 되는 것을 남긴 목록.
// 새 기능은 개발자가 이 요청을 보고 만든다. 상태는 전체 관리자가 바꾼다.
function DevRequests() {
  const [list, setList] = useState<DevRequest[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [filter, setFilter] = useState<DevStatus | "">("");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ requests: DevRequest[]; canEdit: boolean }>("/api/admin/dev-requests");
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setList(r.data.requests);
    setCanEdit(r.data.canEdit);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(d: DevRequest, status: DevStatus) {
    setBusy(d.id);
    const r = await api(`/api/admin/dev-requests/${d.id}`, { method: "PATCH", body: { status } });
    setBusy("");
    setMsg(r.ok ? { tone: "info", text: `“${d.title}” 상태를 ${status === "진행 중" ? "진행 중으로" : `${status}로`} 바꿨어요.` } : { tone: "bad", text: r.error });
    load();
  }

  async function remove(d: DevRequest) {
    if (!window.confirm(`“${d.title}” 요청을 지울까요?`)) return;
    setBusy(d.id);
    const r = await api(`/api/admin/dev-requests/${d.id}`, { method: "DELETE" });
    setBusy("");
    setMsg(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  const shown = (list ?? []).filter((d) => !filter || d.status === filter);
  const count = (s: DevStatus) => (list ?? []).filter((d) => d.status === s).length;

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        활동 템플릿 편집기의 “AI에게 요청”에서 지금 기능으로는 할 수 없어 남긴 개발 요청이에요. 새 기능은 개발자가 확인하고 만들어요.
        {canEdit ? " 상태(접수 · 진행 중 · 완료 · 보류)를 바꿔 진행 상황을 알려 주세요." : " 상태는 전체 관리자가 바꿔요."}
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {!list && !msg && <p className="small">불러오는 중이에요…</p>}

      {list && list.length > 0 && (
        <div className="row" role="group" aria-label="상태로 거르기" style={{ flexWrap: "wrap" }}>
          <button className={`mini ${filter === "" ? "on" : ""}`} type="button" aria-pressed={filter === ""} onClick={() => setFilter("")}>전체 {list.length}</button>
          {DEV_STATUSES.map((s) => (
            <button key={s} className={`mini ${filter === s ? "on" : ""}`} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s} {count(s)}</button>
          ))}
        </div>
      )}
      {list && list.length === 0 && <div className="msg info">아직 개발 요청이 없어요. 활동 템플릿을 고칠 때 “AI에게 요청”에서 남길 수 있어요.</div>}

      {shown.map((d) => (
        <article key={d.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className={`pill ${TONE[d.status]}`}>{d.status}</span>
            <b className="grow" style={{ font: `700 ${fs(17)} var(--display)` }}>{d.title}</b>
          </div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: fs(15), lineHeight: 1.6 }}>{d.detail}</p>
          {d.why && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}><b>왜 필요한가요:</b> {d.why}</p>}
          <span className="small">
            {d.requestedBy || "관리자"} · {fmtDateTime(d.createdAt)}
            {d.templateName ? ` · 템플릿 “${d.templateName}”` : ""}
            {d.eventName ? ` · 일정 “${d.eventName}”` : ""}
            {d.updatedAt && d.updatedAt !== d.createdAt ? ` · 상태 바꾼 때 ${fmtDateTime(d.updatedAt)}` : ""}
          </span>
          {canEdit && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label className="l" htmlFor={`dr-${d.id}`} style={{ margin: 0 }}>상태</label>
              <select id={`dr-${d.id}`} className="field" style={{ width: "auto", minWidth: 140 }} value={d.status} disabled={busy === d.id} onChange={(e) => setStatus(d, e.target.value as DevStatus)}>
                {DEV_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="grow" />
              <button className="mini danger" type="button" disabled={busy === d.id} onClick={() => remove(d)}>삭제</button>
            </div>
          )}
        </article>
      ))}
    </>
  );
}

export default function DevRequestsPage() {
  return <AdminGate mode="templates" need={["templates", "events"]} active="/admin/dev-requests"><DevRequests /></AdminGate>;
}
