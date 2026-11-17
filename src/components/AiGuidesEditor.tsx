"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { DragHandle, useDragSort } from "./DragSort";
import { SaveChoices, type SaveMode } from "./SaveChoices";

type Point = { key: string; label: string; hint: string };

// 이 활동 설정에서 AI가 쓰이는 지점 — lib/ai-guides.ts aiPointsFor 와 같은 규칙
export const aiPointKeys = (c: { preEvent: { steps: string[] } }): string[] =>
  c.preEvent.steps.includes("ai_interview") ? ["followup", "draft", "truthlies", "revise", "reading"]
  : c.preEvent.steps.includes("worry_write") ? ["worry"]
  : [];

// AI 지침 편집기(지점별). 템플릿 보관함과 일정 활동에서 연다.
// 저장 방법은 설정 저장과 같이 고른다(choices): 수정(이 버전 고치기) / 새 버전 / 새 활동.
// choices 가 없으면(원래 템플릿이 없어진 일정 활동) 저장 버튼 하나와 saveNote 안내만 보인다.
export type AiSettings = {
  aiGuides: Record<string, string>;
  aiCommon?: string;
  // skippable: 질문마다 "답변안함" 허용(questions 와 같은 순서)
  interview?: { questions: string[]; followUpMax: number; skippable?: boolean[] };
};

export function AiGuidesEditor(props: {
  title: string;
  keys: string[];
  initial: AiSettings;
  saveNote?: string; // choices 가 없을 때 저장 버튼 옆 안내
  choices?: { version: number; nextVersion: number; baseName: string; otherEvents: number; inEvent?: boolean };
  onSave: (ai: AiSettings, mode: SaveMode, name?: string) => Promise<string | null>; // 오류 문구 또는 null
  onClose: () => void;
}) {
  const { title, keys, initial, saveNote, choices, onSave, onClose } = props;
  type Info = { points: Point[]; pointGuides: Record<string, string>; guidelines: string; questions: string[]; followUpMax: number };
  const [info, setInfo] = useState<Info | null>(null);
  const [guides, setGuides] = useState<Record<string, string>>({ ...initial.aiGuides });
  const [common, setCommon] = useState(initial.aiCommon ?? "");
  const hasInterview = keys.includes("followup");
  // 질문과 "답변안함" 허용 여부를 한 줄로 묶어 둔다(순서를 바꿔도 함께 움직인다)
  type Q = { q: string; skip: boolean };
  const [items, setItems] = useState<Q[]>((initial.interview?.questions ?? []).map((q, i) => ({ q, skip: initial.interview?.skippable?.[i] === true })));
  const questions = items.map((x) => x.q);
  const setQ = (i: number, patch: Partial<Q>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  // 인터뷰 질문 순서: ⠿ 손잡이를 끌어서(또는 손잡이에서 위·아래 방향키로) 바꾼다
  const qds = useDragSort(items, setItems);
  const [followUpMax, setFollowUpMax] = useState<number>(initial.interview?.followUpMax ?? 6);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Info>("/api/admin/interview-settings").then((r) => {
      if (!r.ok) return setErr(r.error);
      setInfo(r.data);
      // 템플릿에 인터뷰 질문이 없으면 기본값으로 채워서 보여 준다(저장하면 템플릿으로 옮겨짐)
      if (!initial.interview?.questions?.length) {
        setItems(r.data.questions.map((q) => ({ q, skip: false })));
        setFollowUpMax(r.data.followUpMax);
      }
    });
  }, [initial.interview]);

  async function save(mode: SaveMode = "fix", name?: string) {
    if (hasInterview && !questions.some((q) => q.trim())) return setErr("인터뷰 질문을 하나 이상 넣어 주세요.");
    setBusy(true);
    setErr("");
    const e = await onSave({ aiGuides: guides, aiCommon: common, ...(hasInterview ? { interview: { questions, followUpMax, skippable: items.map((x) => x.skip) } } : {}) }, mode, name);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <section className="card" aria-label={`${title} AI 지침`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b className="grow" style={{ font: `700 ${fs(18)} var(--display)` }}>“{title}” AI 지침</b>
        <button className="mini" type="button" onClick={onClose}>닫기</button>
      </div>
      <span className="small">
        이 활동 안에서 AI가 쓰이는 지점마다 지침을 정해요. 비워 두면 “AI 설정” 화면의 전체 지침을 써요. 모든 지점에는 공통 지침(신원 정보 금지 등)이 항상 함께 들어가요.
      </span>
      {err && <div className="msg bad" role="alert">{err}</div>}
      {!info && !err && <p className="small">불러오는 중이에요…</p>}
      {info && keys.length === 0 && <div className="msg info">이 활동에는 AI가 쓰이는 지점이 없어요.</div>}

      {info && keys.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="l" htmlFor="ag-common" style={{ marginBottom: 0 }}>이 활동 공통 지침 (모든 지점에 들어가요)</label>
          <span className="small">신원 정보 금지, 말투 등 이 활동 전체에 적용할 기준이에요.</span>
          <textarea id="ag-common" className="field" rows={5} maxLength={4000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
            placeholder={`비워 두면 AI 설정 화면의 기본 공통 지침을 써요:\n${info.guidelines}`}
            value={common} onChange={(e) => setCommon(e.target.value)} />
        </div>
      )}

      {info && hasInterview && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>AI 인터뷰 질문</b>
          <span className="small">회원에게 차례로 묻는 필수 질문이에요. 다 답하면 AI가 후속 질문을 최대 개수만큼 이어서 물어요.{items.length > 1 ? " 왼쪽 ⠿ 손잡이를 끌어서 묻는 순서를 바꿔요." : ""} “답변안함 허용”을 체크한 질문은 회원이 답하지 않고 넘어갈 수 있어요(넘긴 질문은 소개 글에 쓰지 않아요).</span>
          {items.map((it, i) => (
            <div key={i} ref={qds.item(i).ref} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, ...qds.item(i).style }}>
              <div className="row" style={{ gap: 6 }}>
                {items.length > 1 && <DragHandle {...qds.handle(i, `질문 ${i + 1}`)} />}
                <span className="num small" aria-hidden="true" style={{ minWidth: 18, textAlign: "right" }}>{i + 1}</span>
                <input className="field" aria-label={`질문 ${i + 1}`} maxLength={300} value={it.q} onChange={(e) => setQ(i, { q: e.target.value })} />
                <button className="mini danger" type="button" disabled={items.length <= 1} style={{ minHeight: 46 }} onClick={() => setItems(items.filter((_, j) => j !== i))}>삭제</button>
              </div>
              <label className="row" style={{ gap: 8, minHeight: 32, fontSize: fs(13), cursor: "pointer", paddingLeft: items.length > 1 ? 50 : 0 }}>
                <input type="checkbox" checked={it.skip} onChange={(e) => setQ(i, { skip: e.target.checked })} style={{ width: 18, height: 18 }} />
                <span>답변안함 허용 (회원이 “답변안함”을 누르면 이 질문은 넘어가요)</span>
              </label>
            </div>
          ))}
          <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: fs(15) }} onClick={() => setItems([...items, { q: "", skip: false }])}>+ 질문 추가</button>
          <div style={{ maxWidth: 240 }}>
            <label className="l" htmlFor="ag-fu">AI 후속 질문 최대 개수</label>
            <input id="ag-fu" className="field" type="number" min={0} max={12} value={followUpMax} onChange={(e) => setFollowUpMax(Math.max(0, Math.min(12, Number(e.target.value) || 0)))} />
          </div>
        </div>
      )}

      {info && keys.map((k) => {
        const p = info.points.find((x) => x.key === k);
        if (!p) return null;
        const fallback = info.pointGuides[k]?.trim();
        return (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="l" htmlFor={`ag-${k}`} style={{ marginBottom: 0 }}>{p.label}</label>
            <span className="small">{p.hint}</span>
            <textarea id={`ag-${k}`} className="field" rows={4} maxLength={4000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
              placeholder={fallback ? `비워 두면 전체 지침을 써요:\n${fallback}` : "비워 두면 공통 지침만 써요."}
              value={guides[k] ?? ""} onChange={(e) => setGuides({ ...guides, [k]: e.target.value })} />
            <span className="hint">{(guides[k] ?? "").trim() ? "이 지침을 써요" : fallback ? "지금은 전체 지침을 써요" : "지금은 공통 지침만 써요"}</span>
          </div>
        );
      })}
      {info && (
        <details className="card" style={{ background: "var(--soft)" }}>
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>AI 설정 화면의 기본 공통 지침 보기</summary>
          <p className="small" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{info.guidelines}</p>
          <span className="small">위 “이 활동 공통 지침”을 비워 두면 이 기본값을 써요.</span>
        </details>
      )}
      {keys.length > 0 && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
          {choices ? (
            <>
              <b style={{ font: `700 ${fs(16)} var(--display)` }}>어떻게 저장할까요?</b>
              <SaveChoices
                busy={busy}
                disabled={!info}
                version={choices.version}
                nextVersion={choices.nextVersion}
                baseName={choices.baseName}
                suggestName={`${choices.baseName} (새 활동)`}
                otherEvents={choices.otherEvents}
                inEvent={choices.inEvent}
                onSave={save}
                onCancel={onClose}
              />
            </>
          ) : (
            <>
              <span className="small" id="ag-save-note">{saveNote}</span>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn" type="button" aria-describedby="ag-save-note" disabled={busy || !info} style={{ width: "auto", minWidth: 160 }} onClick={() => save()}>{busy ? "저장 중…" : "저장"}</button>
                <button className="btn white" type="button" style={{ width: "auto", minWidth: 120 }} onClick={onClose}>취소</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
