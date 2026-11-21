"use client";

import { useEffect, useState } from "react";
import { NumField } from "./NumField";
import { RowDelete } from "./RowDelete";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { DragHandle, useDragSort } from "./DragSort";
import { SaveChoices, type SaveMode } from "./SaveChoices";

type Point = { key: string; label: string; hint: string };

// 이 활동 설정에서 AI가 쓰이는 지점 — lib/ai-guides.ts aiPointsFor 와 같은 규칙
export const aiPointKeys = (c: { preEvent: { steps: string[] } }): string[] =>
  c.preEvent.steps.includes("ai_interview") ? (c.preEvent.steps.includes("truth_lies") ? ["followup", "draft", "truthlies", "revise"] : ["followup", "draft", "revise"])
  : c.preEvent.steps.includes("worry_write") ? ["worry"]
  : [];

// AI 지침 편집기(지점별). 템플릿 보관함과 일정 활동에서 연다.
// 저장 방법은 설정 저장과 같이 고른다(choices): 수정(이 버전 고치기) / 새 버전 / 새 활동.
// choices 가 없으면(원래 템플릿이 없어진 일정 활동) 저장 버튼 하나와 saveNote 안내만 보인다.
export type AiSettings = {
  aiGuides: Record<string, string>;
  aiCommon?: string;
  // skippable: 질문마다 "답변안함" 허용(questions 와 같은 순서)
  interview?: { questions: string[]; followUpMax: number; skippable?: boolean[]; followUpSkip?: boolean };
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
  const [followUpSkip, setFollowUpSkip] = useState<boolean>(initial.interview?.followUpSkip !== false); // AI 후속 질문도 답변안함 허용(기본 허용)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Info>("/api/admin/interview-settings").then((r) => {
      if (!r.ok) return setErr(r.error);
      setInfo(r.data);
      // 공통 지침 칸이 비어 있으면 기본 지침(관리자 › 모임설정에서 볼 수 있음)을 채워 보여 준다. 고쳐 저장하면 이 활동은 저장한 글을 따른다.
      setCommon((c) => (c.trim() ? c : r.data.guidelines));
      // 템플릿에 인터뷰 질문이 없으면 기본값으로 채워서 보여 준다(저장하면 템플릿으로 옮겨짐)
      if (!initial.interview?.questions?.length) {
        setItems(r.data.questions.map((q) => ({ q, skip: false })));
        setFollowUpMax(r.data.followUpMax);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.interview]);

  async function save(mode: SaveMode = "fix", name?: string) {
    if (hasInterview && !questions.some((q) => q.trim())) return setErr("인터뷰 질문을 하나 이상 넣어 주세요.");
    setBusy(true);
    setErr("");
    const e = await onSave({ aiGuides: guides, aiCommon: common, ...(hasInterview ? { interview: { questions, followUpMax, skippable: items.map((x) => x.skip), followUpSkip } } : {}) }, mode, name);
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
        이 활동 안에서 AI가 쓰이는 지점마다 지침을 정해요. 모든 AI에는 <b>필수 지침</b>(민감정보·신원정보·혐오 표현 금지 등)이 맨 위에 항상 들어가고, 그다음 이 활동의 <b>공통 지침</b>이 모든 세부 지침에 함께 들어가요. 세부 지침은 비어 있으면 없는 것으로 둬요. 필수·기본 지침과 명리학 필수 지침(명리학 풀이에 항상 적용)은 관리자 › 모임설정에서 볼 수 있어요.
      </span>
      {err && <div className="msg bad" role="alert">{err}</div>}
      {!info && !err && <p className="small">불러오는 중이에요…</p>}
      {info && keys.length === 0 && <div className="msg info">이 활동에는 AI가 쓰이는 지점이 없어요.</div>}

      {info && keys.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="l" htmlFor="ag-common" style={{ marginBottom: 0 }}>이 활동 공통 지침 (아래 모든 세부 지침에 들어가요)</label>
          <span className="small">이 활동 전체에 적용할 기준이에요. 비어 있으면 기본 지침을 채워 보여 줘요. 고쳐 저장하면 이 활동은 저장한 글을 따라요.</span>
          <textarea id="ag-common" className="field" rows={5} maxLength={4000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
            placeholder="비워 두면 기본 공통 지침을 써요."
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
                <textarea className="field" aria-label={`질문 ${i + 1}`} maxLength={300} rows={2} value={it.q} onChange={(e) => setQ(i, { q: e.target.value })}
                  ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } }}
                  onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; }}
                  style={{ flex: 1, minWidth: 0, padding: "8px 10px", lineHeight: 1.5, resize: "vertical", minHeight: 60 }} />
                <RowDelete label={`질문 ${i + 1} 삭제`} disabled={items.length <= 1} onClick={() => setItems(items.filter((_, j) => j !== i))} />
              </div>
              <label className="row" style={{ gap: 8, minHeight: 32, fontSize: fs(13), cursor: "pointer", paddingLeft: items.length > 1 ? 50 : 0 }}>
                <input type="checkbox" checked={it.skip} onChange={(e) => setQ(i, { skip: e.target.checked })} style={{ width: 18, height: 18 }} />
                <span>답변안함 허용</span>
              </label>
            </div>
          ))}
          <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: fs(15) }} onClick={() => setItems([...items, { q: "", skip: false }])}>+ 질문 추가</button>
          <div style={{ maxWidth: 240 }}>
            <label className="l" htmlFor="ag-fu">AI 후속 질문 최대 개수</label>
            <NumField id="ag-fu" className="field" min={0} max={12} value={followUpMax} onChange={setFollowUpMax} />
          </div>
          <label className="row" style={{ gap: 8, minHeight: 32, fontSize: fs(13), cursor: "pointer" }}>
            <input type="checkbox" checked={followUpSkip} onChange={(e) => setFollowUpSkip(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span>AI 후속 질문도 답변안함 허용</span>
          </label>
        </div>
      )}

      {info && keys.map((k) => {
        const p = info.points.find((x) => x.key === k);
        if (!p) return null;
        return (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="l" htmlFor={`ag-${k}`} style={{ marginBottom: 0 }}>{p.label}</label>
            <span className="small">{p.hint}</span>
            <textarea id={`ag-${k}`} className="field" rows={4} maxLength={4000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
              placeholder="비워 두면 이 지점에는 세부 지침 없이 공통 지침만 들어가요."
              value={guides[k] ?? ""} onChange={(e) => setGuides({ ...guides, [k]: e.target.value })} />
            <span className="hint">{(guides[k] ?? "").trim() ? "이 세부 지침을 써요" : "지금은 공통 지침만 들어가요"}</span>
          </div>
        );
      })}
      {info && (
        <details className="card" style={{ background: "var(--soft)" }}>
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>기본 지침 보기</summary>
          <p className="small" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{info.guidelines}</p>
          <span className="small">위 “이 활동 공통 지침” 칸을 완전히 비우면 이 기본 지침을 써요. 기본·필수 지침은 관리자 › 모임설정에서 볼 수 있고, 바꾸려면 개발자에게 요청하세요.</span>
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
