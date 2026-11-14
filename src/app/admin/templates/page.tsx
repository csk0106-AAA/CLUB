"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { AiGuidesEditor, aiPointKeys } from "@/components/AiGuidesEditor";
import { Mascot } from "@/components/Mascot";
import { Popup } from "@/components/Popup";
import { modeOf, SCREEN_LABELS, TemplateEditor, type EditableConfig } from "@/components/TemplateEditor";
import { api } from "@/lib/client";
import type { TemplateConfig } from "@/lib/template-schema";

type T = { id: string; origin: string; version: number; config: TemplateConfig };

const strip = (c: TemplateConfig): EditableConfig => {
  const { id: _i, version: _v, ...rest } = c;
  void _i; void _v;
  return rest;
};
const BLANK: EditableConfig = {
  name: "새 활동",
  description: "",
  participants: "all",
  preEvent: { enabled: false, steps: [] },
  onsite: { steps: [{ key: "step-1", label: "시작", memberScreen: "wait", unlock: "host_click", hostButton: "시작" }] },
};

function Templates() {
  const [list, setList] = useState<T[] | null>(null);
  const [edit, setEditRaw] = useState<{ id: string | null; value: EditableConfig; orig: string } | null>(null);
  const [editErr, setEditErr] = useState("");
  // 편집 창 열기(처음 값을 기억해 두고, 바뀐 게 있으면 닫기 전에 물어본다)
  const openEdit = (id: string | null, value: EditableConfig) => {
    setEditErr("");
    setEditRaw({ id, value, orig: JSON.stringify(value) });
  };
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [guideFor, setGuideFor] = useState<T | null>(null); // AI 지침을 고치는 템플릿

  const load = useCallback(async () => {
    const r = await api<{ templates: T[] }>("/api/admin/templates");
    if (r.ok) setList(r.data.templates);
    else setMsg({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setEditErr("");
    const r = edit.id
      ? await api(`/api/admin/templates/${edit.id}`, { method: "PUT", body: edit.value })
      : await api("/api/admin/templates", { body: edit.value });
    setBusy(false);
    if (!r.ok) return setEditErr(r.error);
    setMsg({ tone: "info", text: "저장했어요. 이미 행사에 넣은 활동은 그대로고, 앞으로 넣는 활동부터 바뀐 설정을 써요." });
    setEditRaw(null);
    load();
  }

  async function remove(t: T) {
    if (!window.confirm(`“${t.config.name}” 템플릿을 지울까요? 이미 행사에 넣은 활동은 그대로 남아요.`)) return;
    const r = await api(`/api/admin/templates/${t.id}`, { method: "DELETE" });
    setMsg(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        활동 템플릿은 행사에 넣을 활동의 설계도예요. 사전 작성이 있는지, 현장에서 어떤 단계로 진행하는지, 사회자가 버튼을 누를 때 회원 화면이 언제 켜지는지를 여기서 정해요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      {guideFor ? (
        <AiGuidesEditor
          title={guideFor.config.name}
          keys={aiPointKeys(guideFor.config)}
          initial={{ aiGuides: guideFor.config.aiGuides ?? {}, aiCommon: guideFor.config.aiCommon, interview: guideFor.config.interview }}
          scope="template"
          onClose={() => setGuideFor(null)}
          onSave={async (ai) => {
            const r = await api(`/api/admin/templates/${guideFor.id}/ai-guides`, { method: "PUT", body: ai });
            if (!r.ok) return r.error;
            setMsg({ tone: "info", text: `“${guideFor.config.name}”의 AI 지침을 저장했어요. 이 템플릿으로 넣은 행사 활동에도 바로 적용돼요.` });
            setGuideFor(null);
            load();
            return null;
          }}
        />
      ) : (
        <>
          {!list && !msg && <p className="small">불러오는 중이에요…</p>}
          <div className="cards">
            {list?.map((t) => (
              <div key={t.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                <span className={`pill ${t.origin === "default" ? "ok" : t.origin === "event" ? "warn" : "blue"}`}>
                  {t.origin === "default" ? "기본 템플릿" : t.origin === "event" && t.config.sourceEvent
                    ? `행사 템플릿 · ${t.config.sourceEvent.name}_${t.config.sourceEvent.date}`
                    : "내가 만든 템플릿"} v{t.version}
                </span>
                <b style={{ font: "400 21px var(--display)" }}>{t.config.name}</b>
                <span className="small">{t.config.description}</span>
                <span className="small">{modeOf(t.config) === "team" ? "팀 활동 · " : "전체 활동 · "}{t.config.participants === "selected" ? "관리자 선택 회원만 · " : "전체 회원 · "}{t.config.preEvent.enabled ? `사전 작성 있음 (행사 ${t.config.preEvent.opensBeforeDays ?? 14}일 전 ~ ${t.config.preEvent.closesBeforeDays ?? 1}일 전)` : "현장에서만 진행"} · 현장 {t.config.onsite.steps.length}단계</span>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button className="mini" type="button" onClick={() => openEdit(t.id, strip(t.config))}>수정</button>
                  <button className="mini" type="button" onClick={() => openEdit(null, { ...strip(t.config), name: `${t.config.name} (복사본)` })}>복제</button>
                  <button className="mini" type="button" onClick={() => { setMsg(null); setGuideFor(t); }}>
                    AI 지침{Object.values(t.config.aiGuides ?? {}).some((v) => v.trim()) || t.config.aiCommon?.trim() || t.config.interview?.questions?.length ? " ✓" : ""}
                  </button>
                  {t.origin !== "default" && <button className="mini danger" type="button" onClick={() => remove(t)}>삭제</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" type="button" style={{ width: "auto", minWidth: 200 }} aria-haspopup="dialog" onClick={() => openEdit(null, BLANK)}>+ 새 템플릿 만들기</button>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 220 }} aria-expanded={aiOpen} onClick={() => setAiOpen(!aiOpen)}>
              {aiOpen ? "AI 대화 닫기" : "AI와 새 활동 만들기"}
            </button>
          </div>
          <p className="small" style={{ margin: 0 }}>기존 템플릿을 “복제”해서 필요한 부분만 고쳐 쓰는 것이 가장 빨라요. 새 활동이 필요하면 AI에게 설명하고 초안을 받아 다듬을 수 있어요.</p>
          {aiOpen && (
            <AiMaker
              onOpen={(value) => { openEdit(null, value); setAiOpen(false); }}
              onSaved={() => { setMsg({ tone: "info", text: "AI가 만든 템플릿을 보관함에 저장했어요. 다음 행사부터 고를 수 있어요." }); setAiOpen(false); load(); }}
            />
          )}
        </>
      )}

      <Popup
        id="template-editor"
        width={900}
        title={edit?.id ? "템플릿 수정" : "새 템플릿 만들기"}
        open={!!edit}
        onClose={() => setEditRaw(null)}
        dirty={!!edit && JSON.stringify(edit.value) !== edit.orig}
        footer={edit && (
          <>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 110, minHeight: 48 }} onClick={() => setEditRaw(null)}>취소</button>
            <button className="btn" type="button" disabled={busy || !edit.value.name.trim()} style={{ width: "auto", minWidth: 140, minHeight: 48 }} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
          </>
        )}
      >
        {edit && (
          <>
            {editErr && <div className="msg bad" role="alert">{editErr}</div>}
            <TemplateEditor value={edit.value} onChange={(value) => setEditRaw({ ...edit, value })} />
          </>
        )}
      </Popup>
    </>
  );
}

// ⑱ AI와 새 활동 만들기: 대화로 설명 → AI가 템플릿 설정 초안 → 미리보기 → 저장 또는 편집기에서 다듬기
type Chat = { role: "user" | "assistant"; content: string };
function AiMaker({ onOpen, onSaved }: { onOpen: (v: EditableConfig) => void; onSaved: () => void }) {
  const [chat, setChat] = useState<Chat[]>([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<EditableConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [chat.length, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    const next: Chat[] = [...chat, { role: "user", content: t }];
    setChat(next);
    setInput("");
    setBusy(true);
    setErr("");
    const r = await api<{ reply: string; config: EditableConfig | null }>("/api/admin/templates/ai", { body: { messages: next } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    // 다음 대화에서 AI가 직전 초안을 고칠 수 있도록 설정도 함께 기록해 둔다.
    const memo = r.data.config ? `${r.data.reply}\n[초안 설정] ${JSON.stringify(r.data.config)}` : r.data.reply;
    setChat([...next, { role: "assistant", content: memo }]);
    if (r.data.config) setDraft(r.data.config);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    const r = await api("/api/admin/templates", { body: draft });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onSaved();
  }

  const shown = (c: Chat) => c.content.split("\n[초안 설정]")[0];

  return (
    <section className="card" aria-label="AI와 새 활동 만들기" style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--soft)" }}>
      <div className="say" style={{ alignItems: "center" }}><Mascot size={46} /><b style={{ font: "400 19px var(--display)" }}>AI와 새 활동 만들기</b></div>
      <div role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="say"><Mascot size={40} /><div className="bubble" style={{ fontSize: 16 }}>어떤 활동을 만들고 싶으세요? 인원, 시간, 진행 방식을 알려 주세요.</div></div>
        {chat.map((c, i) =>
          c.role === "user"
            ? <div key={i} className="mine" style={{ fontSize: 16 }}>{c.content}</div>
            : <div key={i} className="say"><Mascot size={40} /><div className="bubble" style={{ fontSize: 16 }}>{shown(c)}</div></div>,
        )}
        {busy && <div className="say"><Mascot size={40} /><div className="bubble" style={{ fontSize: 16 }}>만드는 중이에요…</div></div>}
        <div ref={end} />
      </div>
      {err && <div className="msg bad" role="alert">{err}</div>}

      {draft && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="pill blue" style={{ alignSelf: "flex-start" }}>초안 미리보기</span>
          <b style={{ font: "400 20px var(--display)" }}>{draft.name}</b>
          {draft.description && <span className="small">{draft.description}</span>}
          <span className="small">
            {draft.participants === "selected" ? "관리자 선택 회원만" : "전체 회원"} · {draft.preEvent.enabled ? `사전 작성 (행사 ${draft.preEvent.opensBeforeDays ?? 14}일 전 ~ ${draft.preEvent.closesBeforeDays ?? 1}일 전)` : "현장에서만 진행"}
          </span>
          <ol className="flow">
            {draft.onsite.steps.map((s) => <li key={s.key}>{s.label}{s.hostButton ? ` · 버튼 “${s.hostButton}”` : ""} · {SCREEN_LABELS[s.memberScreen] ?? s.memberScreen}</li>)}
          </ol>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 180 }} onClick={save}>보관함에 저장</button>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 180 }} onClick={() => onOpen(draft)}>편집기에서 다듬기</button>
          </div>
        </div>
      )}

      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="mini" type="button" disabled={busy || !draft} onClick={() => send("더 짧게 진행되도록 단계를 줄여 주세요.")}>더 짧게</button>
        <button className="mini" type="button" disabled={busy || !draft} onClick={() => send("사전 작성 없이 현장에서만 진행하도록 바꿔 주세요.")}>현장에서만</button>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input className="field" aria-label="AI에게 요청" placeholder="예: 명함 대신 한 줄 키워드로 소개하는 20분짜리 아이스브레이킹" value={input} maxLength={1000} onChange={(e) => setInput(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !input.trim()} style={{ width: 96, flex: "none" }}>보내기</button>
      </form>
      <span className="small">승인(저장)하면 템플릿 보관함에 들어가고, 다음 행사부터 고를 수 있어요. 앱에 없는 입력 방식은 “진행 안내형”(회원 휴대폰에 지금 단계만 보임)으로 만들어져요.</span>
    </section>
  );
}

export default function TemplatesPage() {
  return <AdminGate mode="events" need={["activities", "events"]} active="/admin/templates"><Templates /></AdminGate>;
}
