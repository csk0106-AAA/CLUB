"use client";

import { useId, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { templateConfigSchema } from "@/lib/template-schema";
import { Mascot } from "./Mascot";
import { SCREEN_LABELS, UNLOCK_LABELS, type EditableConfig } from "./TemplateEditor";

type Dev = { title: string; detail: string; why: string };
type Result = { canDo: boolean; summary: string; config?: EditableConfig; devRequest?: Dev };

// 바뀐 점을 사람이 읽는 말로(“무엇이 어떻게”) 정리한다.
export function diffConfig(a: EditableConfig, b: EditableConfig): string[] {
  const out: string[] = [];
  const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  if (a.name !== b.name) out.push(`활동 이름: “${a.name}” → “${b.name}”`);
  if (a.participants !== b.participants) out.push(`참여 대상: ${b.participants === "selected" ? "관리자 선택 회원" : "전체 회원"}`);
  if (!same(a.mode, b.mode)) out.push(`활동 방식: ${b.mode === "team" ? "팀별" : b.mode === "all" ? "모두 함께" : "자동"}`);
  if (!same(a.host, b.host)) out.push(`진행자: ${b.host?.required ? "꼭 있어야 해요" : "없어도 돼요"}${b.host?.note && b.host.note !== a.host?.note ? " · 안내를 바꿔요" : ""}`);
  if (!same(a.preEvent, b.preEvent)) out.push(b.preEvent.enabled ? `사전 작성: 일정 ${b.preEvent.opensBeforeDays ?? 14}일 전 ~ ${b.preEvent.closesBeforeDays ?? 1}일 전 (${b.preEvent.steps.join(", ") || "단계 없음"})` : "사전 작성: 없음(현장에서만)");
  if (!same(a.guessPhase, b.guessPhase)) out.push("사전 맞히기 기간을 바꿔요");
  if (!same(a.scoring, b.scoring)) out.push(`점수: ${b.scoring?.enabled ? "켜요" : "꺼요"}`);
  if (!same(a.aiGuides, b.aiGuides) || !same(a.aiCommon, b.aiCommon)) out.push("AI 지침을 바꿔요");
  if (!same(a.interview, b.interview)) out.push("AI 인터뷰 질문을 바꿔요");
  const oldSteps = new Map(a.onsite.steps.map((s) => [s.key, s]));
  const newKeys = new Set(b.onsite.steps.map((s) => s.key));
  for (const s of b.onsite.steps) {
    const o = oldSteps.get(s.key);
    const desc = `${SCREEN_LABELS[s.memberScreen] ?? s.memberScreen} · ${UNLOCK_LABELS[s.unlock] ?? s.unlock}${s.hostButton ? ` · 버튼 “${s.hostButton}”` : ""}`;
    if (!o) out.push(`단계 추가: “${s.label}” (${desc})`);
    else if (!same(o, s)) out.push(`단계 변경: “${o.label}”${o.label !== s.label ? ` → “${s.label}”` : ""} (${desc})`);
  }
  for (const s of a.onsite.steps) if (!newKeys.has(s.key)) out.push(`단계 삭제: “${s.label}”`);
  const order = (c: EditableConfig) => c.onsite.steps.map((s) => s.key).filter((k) => oldSteps.has(k) && newKeys.has(k)).join(",");
  if (order(a) !== order(b)) out.push("단계 순서를 바꿔요");
  return out;
}

// 화면에서도 스키마로 한 번 더 확인한다(단계 키 중복 포함).
function validate(c: unknown): EditableConfig | null {
  if (!c || typeof c !== "object") return null;
  const r = templateConfigSchema.safeParse({ ...(c as object), id: "check", version: 1 });
  if (!r.success) return null;
  if (new Set(r.data.onsite.steps.map((s) => s.key)).size !== r.data.onsite.steps.length) return null;
  const { id: _i, version: _v, ...rest } = r.data;
  void _i; void _v;
  return rest;
}

// 템플릿 편집기의 “AI에게 요청”: 원하는 것을 말하면 AI가 이미 있는 기능으로 설정을 고쳐 주거나,
// 새 기능이 필요하면 개발 요청으로 남긴다(개발자가 확인하고 만든다).
export function AiAssist({ value, onApply, templateId, eventId }: {
  value: EditableConfig;
  onApply: (v: EditableConfig) => void;
  templateId?: string;
  eventId?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [aiOff, setAiOff] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [dev, setDev] = useState<Dev | null>(null);
  const [devMsg, setDevMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [applied, setApplied] = useState(false);

  async function ask() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setErr("");
    setRes(null);
    setDev(null);
    setDevMsg(null);
    setApplied(false);
    const r = await api<Result>("/api/admin/templates/assist", { body: { config: value, request: t } });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 503) {
        setAiOff(true);
        setDev({ title: t.slice(0, 120), detail: t, why: "" });
      }
      return setErr(r.error);
    }
    setAiOff(false);
    const cfg = r.data.config ? validate(r.data.config) : null;
    if (r.data.canDo && !cfg) {
      setErr("AI가 고친 설정이 규칙에 맞지 않아 적용할 수 없어요. 요청을 조금 바꿔 다시 시도하거나 개발 요청으로 남겨 주세요.");
      setDev({ title: t.slice(0, 120), detail: t, why: "" });
      return;
    }
    setRes({ ...r.data, config: cfg ?? undefined });
    if (r.data.devRequest) setDev(r.data.devRequest);
  }

  async function sendDev() {
    if (!dev) return;
    setBusy(true);
    setDevMsg(null);
    const r = await api("/api/admin/dev-requests", { body: { ...dev, templateId: templateId ?? "", eventId: eventId ?? "" } });
    setBusy(false);
    if (!r.ok) return setDevMsg({ tone: "bad", text: r.error });
    setDevMsg({ tone: "info", text: "개발 요청을 남겼어요. 개발자가 확인하고 만들어요. 진행 상황은 활동 템플릿 › 개발 요청에서 볼 수 있어요." });
    setDev(null);
  }

  const changes = res?.config ? diffConfig(value, res.config) : [];

  return (
    <details className="card" style={{ background: "var(--soft)" }}>
      <summary style={{ fontWeight: 700, cursor: "pointer", fontSize: fs(16) }}>AI에게 요청 (기능 고치기·만들기)</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        <span className="small">
          원하는 것을 말로 적어 주세요. 이미 있는 기능(단계, 회원 화면, 켜지는 때, 사전 작성, AI 지침, 참여 대상, 진행자)으로 되는 일이면 AI가 설정을 고쳐 주고,
          새 기능이 필요하면 개발 요청으로 남겨요. 새 기능은 개발자가 확인하고 만들어요.
        </span>
        <form style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <label className="l" htmlFor={`${id}-req`} style={{ marginBottom: 0 }}>요청 내용</label>
          <textarea id={`${id}-req`} className="field" rows={3} maxLength={2000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
            placeholder="예: 투표 단계에서 익명 여부를 고를 수 있게 해 줘 / 사전 작성 없이 현장에서만 하게 바꿔 줘"
            value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" type="submit" disabled={busy || !text.trim()} style={{ width: "auto", alignSelf: "flex-start", minWidth: 140, minHeight: 46, fontSize: fs(15) }}>
            {busy && !dev ? "AI가 살펴보는 중…" : "AI에게 요청"}
          </button>
        </form>

        {err && <div className={`msg ${aiOff ? "info" : "bad"}`} role={aiOff ? "status" : "alert"}>{err}</div>}

        {res && (
          <div className="say" role="status" aria-live="polite">
            <Mascot size={40} />
            <div className="bubble" style={{ fontSize: fs(15), display: "flex", flexDirection: "column", gap: 8 }}>
              <span className={`pill ${res.canDo ? "ok" : "warn"}`} style={{ alignSelf: "flex-start" }}>{res.canDo ? "지금 기능으로 할 수 있어요" : "새 기능이 필요해요"}</span>
              <span>{res.summary}</span>
            </div>
          </div>
        )}

        {res?.config && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ font: `700 ${fs(16)} var(--display)` }}>바뀌는 점</b>
            {changes.length ? <ul style={{ margin: 0, paddingLeft: 20 }}>{changes.map((c, i) => <li key={i} className="small">{c}</li>)}</ul> : <span className="small">바뀌는 설정이 없어요.</span>}
            {applied
              ? <div className="msg info" role="status">편집기에 적용했어요. 확인한 뒤 아래에서 저장 방법(수정 · 새 버전 · 새 활동)을 골라 저장해 주세요.</div>
              : (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button className="btn" type="button" disabled={!changes.length} style={{ width: "auto", minWidth: 120, minHeight: 46, fontSize: fs(15) }}
                    onClick={() => { if (res.config) { onApply(res.config); setApplied(true); } }}>적용</button>
                  <span className="small">적용하면 편집기 내용이 바뀌어요. 저장은 아직 안 돼요.</span>
                </div>
              )}
          </div>
        )}

        {dev && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ font: `700 ${fs(16)} var(--display)` }}>개발 요청 남기기</b>
            <span className="small">{aiOff ? "AI 없이도 개발 요청을 직접 남길 수 있어요." : "AI가 정리한 내용을 고쳐서 보내도 돼요."} 개발자가 확인하고 만들어요.</span>
            <label className="l" htmlFor={`${id}-t`} style={{ marginBottom: 0 }}>제목</label>
            <input id={`${id}-t`} className="field" maxLength={120} value={dev.title} onChange={(e) => setDev({ ...dev, title: e.target.value })} />
            <label className="l" htmlFor={`${id}-d`} style={{ marginBottom: 0 }}>무엇이 어떻게 동작하면 좋을까요</label>
            <textarea id={`${id}-d`} className="field" rows={4} maxLength={4000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }} value={dev.detail} onChange={(e) => setDev({ ...dev, detail: e.target.value })} />
            <label className="l" htmlFor={`${id}-w`} style={{ marginBottom: 0 }}>왜 필요한가요 (선택)</label>
            <textarea id={`${id}-w`} className="field" rows={2} maxLength={2000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }} value={dev.why} onChange={(e) => setDev({ ...dev, why: e.target.value })} />
            <button className="btn" type="button" disabled={busy || !dev.title.trim() || !dev.detail.trim()} style={{ width: "auto", alignSelf: "flex-start", minWidth: 160, minHeight: 46, fontSize: fs(15) }} onClick={sendDev}>
              {busy ? "보내는 중…" : "개발 요청 보내기"}
            </button>
          </div>
        )}
        {!dev && !busy && text.trim() && (
          <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => { setDevMsg(null); setDev({ title: text.trim().slice(0, 120), detail: text.trim(), why: "" }); }}>
            {res ? "그래도 개발 요청으로 남기기" : "AI 없이 개발 요청으로 바로 남기기"}
          </button>
        )}
        {devMsg && <div className={`msg ${devMsg.tone}`} role={devMsg.tone === "bad" ? "alert" : "status"}>{devMsg.text}</div>}
      </div>
    </details>
  );
}
