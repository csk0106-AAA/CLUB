"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { AiGuidesEditor, aiPointKeys } from "@/components/AiGuidesEditor";
import { AiAssist } from "@/components/AiAssist";
import { Popup } from "@/components/Popup";
import { SaveChoices, savedText, type SaveMode } from "@/components/SaveChoices";
import { modeOf, TemplateEditor, type EditableConfig } from "@/components/TemplateEditor";
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
  const [canDelete, setCanDelete] = useState(false); // 지우기는 관리자(활동 권한)만 — 소모임 직책자는 만들고 고치기만
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
  const [guideFor, setGuideFor] = useState<T | null>(null); // AI 지침을 고치는 버전
  const [verFor, setVerFor] = useState<string | null>(null); // 버전 목록 창을 연 템플릿(v1 id)
  const verFam = fams.find((f) => f.id === verFor) ?? null;

  const load = useCallback(async () => {
    const r = await api<{ templates: T[]; canDelete: boolean }>("/api/admin/templates");
    if (r.ok) {
      setList(r.data.templates);
      setCanDelete(r.data.canDelete);
    } else setMsg({ tone: "bad", text: r.error });
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
          {canDelete && t.deletable && <button className="mini danger" type="button" onClick={() => remove(t)}>삭제</button>}
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
          </div>
          <p className="small" style={{ margin: 0 }}>기존 템플릿을 “복제”해서 필요한 부분만 고쳐 쓰는 것이 가장 빨라요. 복제하면 버전이 아니라 새 템플릿(v1)이 따로 생겨요. 새 활동은 “+ 새 템플릿 만들기” 안의 “AI에게 요청”으로 설명하면 AI가 초안을 만들어 줘요.</p>
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


export default function TemplatesPage() {
  return <AdminGate mode="templates" need={["templates", "events"]} active="/admin/templates"><Templates /></AdminGate>;
}
