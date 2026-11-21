"use client";

import { useState } from "react";
import { BLOCKS, hasBlock, SAJU_WHEN_LABEL, sajuWhenOf, sajuWhenOptions, setBlock, type BlockKey, type SajuWhen } from "@/lib/blocks";
import { SAJU_LABEL, SAJU_RULES } from "@/lib/ai-rules";
import { fs } from "@/lib/fs";
import type { EditableConfig } from "./TemplateEditor";

// 템플릿 편집기의 "기능 블록": 개발된 기능을 이 활동에 넣고 뺀다(lib/blocks.ts). 넣은 블록은 실제로 동작한다.
//  블록은 기능만 가진다. 언제 열지 같은 활동 설정은 블록 아래 "이 활동에서" 칸에서 정한다(템플릿 설정에 저장).
//  isNew: 새 템플릿이면 먼저 "기능 블록을 넣을까요?"를 묻고, 넣는다고 하면 목록을 보여 준다.
export function BlockPicker({ value, onChange, isNew }: { value: EditableConfig; onChange: (v: EditableConfig) => void; isNew?: boolean }) {
  const anyOn = BLOCKS.some((b) => hasBlock(value, b.key));
  const [ask, setAsk] = useState<"ask" | "yes" | "no">(isNew && !anyOn ? "ask" : "yes");
  const [open, setOpen] = useState<BlockKey | "">("");

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>기능 블록</b>
      {ask === "ask" ? (
        <>
          <span className="small">개발된 기능(예: 명리학 사주풀이)을 이 활동에 넣을 수 있어요. 기능 블록을 넣을까요?</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" type="button" style={{ flex: 1, minHeight: 44 }} onClick={() => setAsk("yes")}>넣기</button>
            <button className="btn white" type="button" style={{ flex: 1, minHeight: 44 }} onClick={() => setAsk("no")}>넣지 않기</button>
          </div>
        </>
      ) : ask === "no" ? (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="small grow">기능 블록 없이 만들어요.</span>
          <button className="mini" type="button" onClick={() => setAsk("yes")}>기능 블록 보기</button>
        </div>
      ) : (
        <>
          <span className="small">체크한 블록이 이 활동에서 실제로 동작해요. 새 기능블록이 필요하면 위의 “AI에게 요청 (기능 고치기·만들기)”이나 활동템플릿 › 기능블록의 “+ 새 기능블록 요청”으로 개발 요청을 남겨 주세요.</span>
          {BLOCKS.map((b) => {
            const on = hasBlock(value, b.key);
            return (
              <div key={b.key} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, ...(on ? { background: "var(--violet-bg)" } : {}) }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <label className="row grow" style={{ gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={on} onChange={(e) => onChange(setBlock(value, b.key, e.target.checked))} />
                    <b style={{ fontSize: fs(15) }}>{b.name}</b>
                  </label>
                  <button className="mini" type="button" aria-expanded={open === b.key} onClick={() => setOpen(open === b.key ? "" : b.key)}>{open === b.key ? "접기" : "설명 · 지침"}</button>
                </div>
                {/* 활동 설정: 이 활동에서 언제 여는지 */}
                {on && b.key === "saju" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label className="l" htmlFor="t-saju-when" style={{ margin: 0 }}>이 활동에서 여는 시점</label>
                    <select id="t-saju-when" className="field" value={sajuWhenOf(value)} onChange={(e) => onChange({ ...value, sajuWhen: e.target.value as SajuWhen })}>
                      {sajuWhenOptions(value).map((w) => <option key={w} value={w}>{SAJU_WHEN_LABEL[w]}</option>)}
                    </select>
                    <span className="small">이 시점에 회원 활동 화면에서 사주풀이를 받을 수 있어요. 받은 풀이는 그 뒤에도 볼 수 있어요.</span>
                  </div>
                )}
                {open === b.key && (
                  <div className="small" style={{ display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.6 }}>
                    <span>{b.summary}</span>
                    {b.rulesNote && <span><b>{b.rulesNote}</b></span>}
                    {b.key === "saju" && (["common", "public", "private"] as const).map((k) => (
                      <div key={k}>
                        <span style={{ fontWeight: 700 }}>{SAJU_LABEL[k]}</span>
                        <ol style={{ margin: "2px 0 0", paddingLeft: 20 }}>{SAJU_RULES[k].map((r, i) => <li key={i}>{r}</li>)}</ol>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
