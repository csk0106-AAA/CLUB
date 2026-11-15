"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { AiGuidesEditor, aiPointKeys } from "@/components/AiGuidesEditor";
import { Mascot } from "@/components/Mascot";
import { AiAssist } from "@/components/AiAssist";
import { Popup } from "@/components/Popup";
import { SaveChoices, savedText, type SaveMode } from "@/components/SaveChoices";
import { modeOf, SCREEN_LABELS, TemplateEditor, type EditableConfig } from "@/components/TemplateEditor";
import { api, fmtDate } from "@/lib/client";
import { families, sourceLabel, type Family, type TplRow } from "@/lib/template-families";
import type { TemplateConfig } from "@/lib/template-schema";
import { fs } from "@/lib/fs";

type T = TplRow;

// 편집기에 넣는 값: 서버가 정하는 값(id, 버전, 출처)은 뺀다
const strip = (c: TemplateConfig): EditableConfig => {
  const { id: _i, version: _v, derivedFrom: _d, sourceEvent: _s, ...rest } = c;
  void _i; void _v; void _d; void _s;
  return rest;
};
const BLANK: EditableConfig = {
  name: "새 활동",
  description: "",
  participants: "all",
  preEvent: { enabled: false, steps: [] },
  onsite: { steps: [{ key: "step-1", label: "시작", memberScreen: "wait", unlock: "host_click", hostButton: "시작" }] },
};

const hasAi = (c: TemplateConfig) => Object.values(c.aiGuides ?? {}).some((v) => v.trim()) || !!c.aiCommon?.trim() || !!c.interview?.questions?.length;
const summary = (c: TemplateConfig) =>
  `${modeOf(c) === "team" ? "팀 활동 · " : "전체 활동 · "}${c.participants === "selected" ? "관리자 선택 회원만 · " : "전체 회원 · "}${c.preEvent.enabled ? `사전 작성 있음 (일정 ${c.preEvent.opensBeforeDays ?? 14}일 전 ~ ${c.preEvent.closesBeforeDays ?? 1}일 전)` : "현장에서만 진행"} · 현장 ${c.onsite.steps.length}단계`;

function Templates() {
  const [list, setList] = useState<T[] | null>(null);
  // 편집 창. base 가 있으면 그 버전을 바탕으로 새 버전을 만들고, 없으면 새 템플릿(v1)을 만든다.
  const [edit, setEditRaw] = useState<{ base: T | null; next: number; value: EditableConfig; orig: string } | null>(null);
  const [editErr, setEditErr] = useState("");
  const fams = list ? families(list) : [];
  const famOf = (t: T) => fams.find((f) => f.versions.some((v) => v.id === t.id));
  // 편집 창 열기(처음 값을 기억해 두고, 바뀐 게 있으면 닫기 전에 물어본다)
  const openEdit = (base: T | null, value: EditableConfig) => {
    setEditErr("");
    setEditRaw({ base, next: base ? famOf(base)?.nextVersion ?? base.version + 1 : 1, value, orig: JSON.stringify(value) });
  };
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [guideFor, setGuideFor] = useState<T | null>(null); // AI 지침을 고치는 버전
  const [verFor, setVerFor] = useState<string | null>(null); // 버전 목록 창을 연 템플릿(v1 id)
  const verFam = fams.find((f) => f.id === verFor) ?? null;

  const load = useCallback(async () => {
    const r = await api<{ templates: T[] }>("/api/admin/templates");
    if (r.ok) setList(r.data.templates);
    else setMsg({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // 저장: 바탕 버전이 있으면 고르는 방법(수정/새 버전/새 활동)대로, 없으면 새 템플릿(v1)
  async function save(mode: SaveMode = "version", name?: string) {
    if (!edit) return;
    setBusy(true);
    setEditErr("");
    type Res = { mode?: SaveMode; unchanged?: boolean; propagated?: number; template: { version: number; config: { name: string } } };
    const r = edit.base
      ? await api<Res>(`/api/admin/templates/${edit.base.id}`, { method: "PUT", body: { config: edit.value, mode, name } })
      : await api<Res>("/api/admin/templates", { body: edit.value });
    setBusy(false);
    if (!r.ok) return setEditErr(r.error);
    setMsg({
      tone: "info",
      text: !edit.base
        ? "새 템플릿(v1)을 만들었어요. 일정에 넣을 때 고를 수 있어요."
        : savedText({ ...r.data, version: r.data.template.version, name: r.data.template.config.name }, "설정"),
    });
    setEditRaw(null);
    load();
  }

  async function remove(t: T) {
    const label = t.version > 1 ? `“${t.config.name}”의 v${t.version} 버전` : `“${t.config.name}” 템플릿`;
    if (!window.confirm(`${label}을 지울까요?`)) return;
    const r = await api(`/api/admin/templates/${t.id}`, { method: "DELETE" });
    setMsg(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  // 복제: 버전이 아니라 새 템플릿(v1)이 따로 생긴다는 것을 먼저 알려 준다
  async function duplicate(t: T) {
    if (!window.confirm(`복제하면 “${t.config.name}”의 버전이 아니라 새로운 활동 템플릿(v1)이 따로 만들어져요.\n“${t.config.name}”의 버전을 만들려면 “수정”을 눌러 주세요.\n\n계속할까요?`)) return;
    openEdit(null, { ...strip(t.config), name: `${t.config.name} (복제)` });
  }

  const nextOf = (t: T) => famOf(t)?.nextVersion ?? t.version + 1;

  // 템플릿 카드(목록: v1 카드 / 버전 창: 버전 카드)
  function card(t: T, fam?: Family, inVersions?: boolean) {
    const count = fam?.versions.length ?? 1;
    return (
      <div key={t.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <div className="row" style={{ width: "100%", flexWrap: "wrap" }}>
          {inVersions ? (
            <>
              <span className={`pill ${t.version === 1 ? "ok" : "blue"}`}>v{t.version}</span>
              {fam && fam.latest.id === t.id && count > 1 && <span className="pill warn">최신</span>}
            </>
          ) : (
            <span className={`pill ${t.origin === "default" ? "ok" : "blue"}`}>{t.origin === "default" ? "기본 템플릿" : "내가 만든 템플릿"} v1</span>
          )}
          <span className="grow" />
          {!inVersions && fam && count >= 2 && (
            <button className="mini" type="button" aria-haspopup="dialog" aria-label={`“${t.config.name}” 버전 ${count}개 보기`} onClick={() => { setMsg(null); setVerFor(fam.id); }}>
              ver{count}
            </button>
          )}
        </div>
        <b style={{ font: `700 ${fs(18)} var(--display)` }}>{t.config.name}</b>
        <span className="small">{t.config.description}</span>
        <span className="small">{summary(t.config)}</span>
        {inVersions && (
          <span className="small">
            {sourceLabel(t)}{t.createdAt ? ` · ${fmtDate(t.createdAt)}` : ""}{t.uses ? ` · 일정 활동 ${t.uses}개가 써요` : ""}
          </span>
        )}
        {!inVersions && fam && count >= 2 && (
          <span className="small">최신: v{fam.latest.version} · {sourceLabel(fam.latest)}</span>
        )}
        {/* 수정·복제·AI 지침 줄은 카드 맨 아래에 맞춘다(같은 줄의 카드끼리 높이가 달라도 버튼 줄이 나란히) */}
        <div className="row" style={{ flexWrap: "wrap", marginTop: "auto", paddingTop: 6 }}>
          <button className="mini" type="button" aria-haspopup="dialog" onClick={() => { setVerFor(null); openEdit(t, strip(t.config)); }}>
            {inVersions ? "이 버전 열기·고치기" : "수정"}
          </button>
          {!inVersions && <button className="mini" type="button" aria-haspopup="dialog" onClick={() => duplicate(t)}>복제</button>}
          <button className="mini" type="button" onClick={() => { setMsg(null); setVerFor(null); setGuideFor(t); }}>
            AI 지침{hasAi(t.config) ? " ✓" : ""}
          </button>
          {t.deletable && <button className="mini danger" type="button" onClick={() => remove(t)}>삭제</button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        활동 템플릿은 일정에 넣을 활동의 설계도예요. 사전 작성이 있는지, 현장에서 어떤 단계로 진행하는지, 진행자가 버튼을 누를 때 회원 화면이 언제 켜지는지를 여기서 정해요.
        처음 만든 템플릿이 v1이에요. 고친 뒤 저장할 때 방법을 골라요: <b>수정</b>(지금 버전에 빠진 조건을 넣거나 잘못된 곳 고치기), <b>새 버전 저장</b>(v2, v3…), <b>새 활동으로 저장</b>(다른 이름의 새 템플릿). 일정에서 고칠 때도 같아요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      {guideFor ? (
        <AiGuidesEditor
          title={guideFor.version > 1 ? `${guideFor.config.name} v${guideFor.version}` : guideFor.config.name}
          keys={aiPointKeys(guideFor.config)}
          initial={{ aiGuides: guideFor.config.aiGuides ?? {}, aiCommon: guideFor.config.aiCommon, interview: guideFor.config.interview }}
          choices={{ version: guideFor.version, nextVersion: nextOf(guideFor), baseName: guideFor.config.name, otherEvents: guideFor.useEvents.length }}
          onClose={() => setGuideFor(null)}
          onSave={async (ai, mode, name) => {
            const r = await api<{ mode: SaveMode; unchanged?: boolean; version: number; propagated?: number }>(`/api/admin/templates/${guideFor.id}/ai-guides`, { method: "PUT", body: { ...ai, mode, name } });
            if (!r.ok) return r.error;
            setMsg({ tone: "info", text: savedText({ ...r.data, name }, `“${guideFor.config.name}”의 AI 지침`) });
            setGuideFor(null);
            load();
            return null;
          }}
        />
      ) : (
        <>
          {!list && !msg && <p className="small">불러오는 중이에요…</p>}
          <div className="cards">
            {fams.map((f) => card(f.root, f))}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" type="button" style={{ width: "auto", minWidth: 200 }} aria-haspopup="dialog" onClick={() => openEdit(null, BLANK)}>+ 새 템플릿 만들기</button>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 220 }} aria-expanded={aiOpen} onClick={() => setAiOpen(!aiOpen)}>
              {aiOpen ? "AI 대화 닫기" : "AI와 새 활동 만들기"}
            </button>
          </div>
          <p className="small" style={{ margin: 0 }}>기존 템플릿을 “복제”해서 필요한 부분만 고쳐 쓰는 것이 가장 빨라요. 복제하면 버전이 아니라 새 템플릿(v1)이 따로 생겨요. 새 활동이 필요하면 AI에게 설명하고 초안을 받아 다듬을 수 있어요.</p>
          {aiOpen && (
            <AiMaker
              onOpen={(value) => { openEdit(null, value); setAiOpen(false); }}
              onSaved={() => { setMsg({ tone: "info", text: "AI가 만든 템플릿을 보관함에 저장했어요. 다음 일정부터 고를 수 있어요." }); setAiOpen(false); load(); }}
            />
          )}
        </>
      )}

      <Popup
        id="template-versions"
        width={760}
        title={verFam ? `“${verFam.root.config.name}” 버전 ${verFam.versions.length}개` : "버전"}
        open={!!verFam}
        onClose={() => setVerFor(null)}
      >
        {verFam && (
          <>
            <span className="small">최신 버전부터 보여요. “이 버전 열기·고치기”를 누르면 그 버전을 고친 뒤 수정(이 버전 고치기) · 새 버전(v{verFam.nextVersion}) · 새 활동 중에서 골라 저장해요. 일정 활동이 쓰는 버전은 지울 수 없어요.</span>
            <div className="cards">
              {verFam.versions.map((t) => card(t, verFam, true))}
            </div>
          </>
        )}
      </Popup>

      <Popup
        id="template-editor"
        width={900}
        title={edit?.base ? `템플릿 고치기 · ${edit.base.config.name} v${edit.base.version}` : "새 템플릿 만들기"}
        open={!!edit}
        onClose={() => setEditRaw(null)}
        dirty={!!edit && JSON.stringify(edit.value) !== edit.orig}
        footer={edit && (edit.base ? (
          <SaveChoices
            busy={busy}
            disabled={!edit.value.name.trim()}
            version={edit.base.version}
            nextVersion={edit.next}
            baseName={edit.base.config.name}
            suggestName={edit.value.name !== edit.base.config.name ? edit.value.name : `${edit.base.config.name} (새 활동)`}
            otherEvents={edit.base.useEvents.length}
            onSave={save}
            onCancel={() => setEditRaw(null)}
          />
        ) : (
          <>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 110, minHeight: 48 }} onClick={() => setEditRaw(null)}>취소</button>
            <button className="btn" type="button" disabled={busy || !edit.value.name.trim()} style={{ width: "auto", minWidth: 140, minHeight: 48 }} onClick={() => save()}>
              {busy ? "저장 중…" : "저장"}
            </button>
          </>
        ))}
      >
        {edit && (
          <>
            {edit.base && <span className="small">고친 뒤 아래에서 저장 방법을 골라요. 수정은 지금 버전(v{edit.base.version})을 고치고{edit.base.useEvents.length ? ` 이 버전을 쓰는 일정 ${edit.base.useEvents.length}곳에도 반영돼요` : ""}, 새 버전은 v{edit.next}로, 새 활동은 다른 이름의 새 템플릿(v1)으로 저장돼요.</span>}
            {editErr && <div className="msg bad" role="alert">{editErr}</div>}
            <AiAssist value={edit.value} templateId={edit.base?.id} onApply={(value) => setEditRaw({ ...edit, value })} />
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
      <div className="say" style={{ alignItems: "center" }}><Mascot size={46} /><b style={{ font: `700 ${fs(17)} var(--display)` }}>AI와 새 활동 만들기</b></div>
      <div role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="say"><Mascot size={40} /><div className="bubble" style={{ fontSize: fs(15) }}>어떤 활동을 만들고 싶으세요? 인원, 시간, 진행 방식을 알려 주세요.</div></div>
        {chat.map((c, i) =>
          c.role === "user"
            ? <div key={i} className="mine" style={{ fontSize: fs(15) }}>{c.content}</div>
            : <div key={i} className="say"><Mascot size={40} /><div className="bubble" style={{ fontSize: fs(15) }}>{shown(c)}</div></div>,
        )}
        {busy && <div className="say"><Mascot size={40} /><div className="bubble" style={{ fontSize: fs(15) }}>만드는 중이에요…</div></div>}
        <div ref={end} />
      </div>
      {err && <div className="msg bad" role="alert">{err}</div>}

      {draft && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="pill blue" style={{ alignSelf: "flex-start" }}>초안 미리보기</span>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>{draft.name}</b>
          {draft.description && <span className="small">{draft.description}</span>}
          <span className="small">
            {draft.participants === "selected" ? "관리자 선택 회원만" : "전체 회원"} · {draft.preEvent.enabled ? `사전 작성 (일정 ${draft.preEvent.opensBeforeDays ?? 14}일 전 ~ ${draft.preEvent.closesBeforeDays ?? 1}일 전)` : "현장에서만 진행"}
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
      <span className="small">승인(저장)하면 템플릿 보관함에 들어가고, 다음 일정부터 고를 수 있어요. 앱에 없는 입력 방식은 “진행 안내형”(회원 휴대폰에 지금 단계만 보임)으로 만들어져요.</span>
    </section>
  );
}

export default function TemplatesPage() {
  return <AdminGate mode="templates" need={["activities", "events"]} active="/admin/templates"><Templates /></AdminGate>;
}
