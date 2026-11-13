"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Point = { key: string; label: string; hint: string };

// 이 활동 설정에서 AI가 쓰이는 지점 — lib/ai-guides.ts aiPointsFor 와 같은 규칙
export const aiPointKeys = (c: { preEvent: { steps: string[] } }): string[] =>
  c.preEvent.steps.includes("ai_interview") ? ["followup", "draft", "truthlies", "revise", "reading"]
  : c.preEvent.steps.includes("worry_write") ? ["worry"]
  : [];

// AI 지침 편집기(지점별). scope="template": 템플릿 보관함에서, scope="event": 행사 활동에서 연다.
// 행사 활동에서는 저장할 때 "템플릿에도 반영" / "이 행사 활동에만" 중 하나를 고른다.
export type AiSettings = {
  aiGuides: Record<string, string>;
  aiCommon?: string;
  interview?: { questions: string[]; followUpMax: number };
};

export function AiGuidesEditor(props: {
  title: string;
  keys: string[];
  initial: AiSettings;
  scope: "template" | "event";
  templateName?: string; // event: 지금 쓰는 템플릿 이름
  onSave: (ai: AiSettings, target: "template" | "event") => Promise<string | null>; // 오류 문구 또는 null
  onClose: () => void;
}) {
  const { title, keys, initial, scope, templateName, onSave, onClose } = props;
  type Info = { points: Point[]; pointGuides: Record<string, string>; guidelines: string; questions: string[]; followUpMax: number };
  const [info, setInfo] = useState<Info | null>(null);
  const [guides, setGuides] = useState<Record<string, string>>({ ...initial.aiGuides });
  const [common, setCommon] = useState(initial.aiCommon ?? "");
  const hasInterview = keys.includes("followup");
  const [questions, setQuestions] = useState<string[]>(initial.interview?.questions ?? []);
  const [followUpMax, setFollowUpMax] = useState<number>(initial.interview?.followUpMax ?? 6);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Info>("/api/admin/interview-settings").then((r) => {
      if (!r.ok) return setErr(r.error);
      setInfo(r.data);
      // 템플릿에 인터뷰 질문이 없으면 기본값으로 채워서 보여 준다(저장하면 템플릿으로 옮겨짐)
      if (!initial.interview?.questions?.length) {
        setQuestions(r.data.questions);
        setFollowUpMax(r.data.followUpMax);
      }
    });
  }, [initial.interview]);

  async function save(target: "template" | "event") {
    if (hasInterview && !questions.some((q) => q.trim())) return setErr("인터뷰 질문을 하나 이상 넣어 주세요.");
    setBusy(true);
    setErr("");
    const e = await onSave({ aiGuides: guides, aiCommon: common, ...(hasInterview ? { interview: { questions, followUpMax } } : {}) }, target);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <section className="card" aria-label={`${title} AI 지침`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b className="grow" style={{ font: "400 21px var(--display)" }}>“{title}” AI 지침</b>
        <button className="mini" type="button" onClick={onClose}>닫기</button>
      </div>
      <span className="small">
        이 활동 안에서 AI가 쓰이는 지점마다 지침을 정해요. 비워 두면 “AI 설정” 화면의 전체 지침을 써요. 모든 지점에는 공통 지침(신원 정보 금지 등)이 항상 함께 들어가요.
        {scope === "template" ? " 저장하면 이 템플릿으로 넣은 행사 활동에도 바로 적용돼요." : ""}
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
          <b style={{ font: "400 18px var(--display)" }}>AI 인터뷰 질문</b>
          <span className="small">회원에게 차례로 묻는 필수 질문이에요. 다 답하면 AI가 후속 질문을 최대 개수만큼 이어서 물어요.</span>
          {questions.map((q, i) => (
            <div key={i} className="row">
              <input className="field" aria-label={`질문 ${i + 1}`} maxLength={300} value={q} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? e.target.value : x)))} />
              <button className="mini danger" type="button" disabled={questions.length <= 1} style={{ minHeight: 54 }} onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>삭제</button>
            </div>
          ))}
          <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => setQuestions([...questions, ""])}>+ 질문 추가</button>
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
      {keys.length > 0 && (scope === "template" ? (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={busy || !info} style={{ width: "auto", minWidth: 160 }} onClick={() => save("template")}>{busy ? "저장 중…" : "저장"}</button>
          <button className="btn white" type="button" style={{ width: "auto", minWidth: 120 }} onClick={onClose}>취소</button>
        </div>
      ) : (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
          <b style={{ font: "400 18px var(--display)" }}>어디에 반영할까요?</b>
          <span className="small">지금 이 활동은 “{templateName ?? "템플릿"}” 템플릿을 쓰고 있어요.</span>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" type="button" disabled={busy || !info} style={{ width: "auto", minWidth: 220 }} onClick={() => save("template")}>
              {busy ? "저장 중…" : "템플릿에도 반영해서 저장"}
            </button>
            <button className="btn blue" type="button" disabled={busy || !info} style={{ width: "auto", minWidth: 220 }} onClick={() => save("event")}>
              {busy ? "저장 중…" : "이 행사 활동에만 저장"}
            </button>
          </div>
          <span className="small">
            템플릿에도 반영: 원래 템플릿의 지침이 바뀌어 이 템플릿을 쓰는 다른 행사와 앞으로 넣을 활동에도 적용돼요.<br />
            이 행사 활동에만: 이 행사용 템플릿으로 따로 저장돼요. 템플릿 보관함에 “행사 템플릿 · 행사명_날짜”로 보여요.
          </span>
        </div>
      ))}
    </section>
  );
}
