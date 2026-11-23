"use client";

import { useState } from "react";
import { BlockPicker } from "./BlockPicker";
import { kstText, preWindowTimes, type PreWindow, type TemplateConfig, canSelect, describeTemplate, activityActions, screensFor, kindOfConfig } from "@/lib/template-schema";
import { NumField } from "./NumField";
import { DateField } from "./DateField";
import { DragHandle, useDragSort } from "./DragSort";
import { fs } from "@/lib/fs";

export type EditableConfig = Omit<TemplateConfig, "id" | "version">;

export const SCREEN_LABELS: Record<string, string> = {
  wait: "대기 화면",
  write: "작성 화면",
  vote: "투표 화면",
  iam_button: "“저예요” 버튼 (소개 주인)",
  pick_person: "명단에서 사람 고르기 (아직 없음)",
  view: "결과 보기",
};
// 활동 종류에 따라 같은 화면이라도 실제로 보이는 내용이 달라 이름을 바꿔 보여 준다.
//  나의 고민은?(worry): 회원 화면은 고민 진행 상황(뽑힘 → 대화 → 이름 오픈)을 따라 저절로 바뀐다.
const KIND_SCREEN_LABELS: Record<string, Record<string, string>> = {
  worry: { wait: "대기 화면 (고민 뽑기 전)", view: "뽑힌 고민 보기 (내용·타이머, 작성자는 이름 오픈 뒤)" },
};
export const screenLabel = (c: Pick<EditableConfig, "preEvent" | "onsite">, k: string): string =>
  KIND_SCREEN_LABELS[kindOfConfig(c)]?.[k] ?? SCREEN_LABELS[k] ?? k;
// 진행자 버튼 이름 후보: 그 활동 종류의 기본 버튼만(다른 활동의 버튼을 섞지 않는다)
const HOST_BUTTONS: Record<string, string[]> = {
  who: ["소개 열기", "“저예요” 열기", "투표", "정답 공개"],
  worry: ["고민 뽑기", "이름 오픈"],
  capsule: ["타임캡슐 작성하기", "봉인하기"],
  "": ["시작"],
};
export const UNLOCK_LABELS: Record<string, string> = {
  host_click: "진행자가 버튼을 누르면 켜짐",
  immediate: "단계가 시작되면 바로 켜짐",
};

// 템플릿과 일정별 활동 설정을 같은 화면으로 고친다.
// 여기서 정한 값이 회원 앱의 동작(사전 작성 여부, 회원 화면이 켜지는 시점)을 결정한다.
// 활동 방식(정하지 않았으면 현장 작성 활동은 팀, 나머지는 전체) — lib/activities.ts activityMode 와 같은 규칙
export const modeOf = (c: Pick<EditableConfig, "mode" | "preEvent" | "onsite">): "all" | "team" =>
  c.mode ?? (!c.preEvent.steps.includes("ai_interview") && !c.preEvent.steps.includes("worry_write") && c.onsite.steps.some((s) => s.memberScreen === "write") ? "team" : "all");

// 사전 단계 하나의 기간: 시작 = 일정 N일 전 HH:mm, 마감 = 일정 N일 전 HH:mm. 일정 날짜를 알면 실제 날짜·시각도 보여 준다.
export function WindowFields<W extends PreWindow>({ id, win, onChange, eventStartsAt, defaults }: { id: string; win: W; onChange: (w: W) => void; eventStartsAt?: string; defaults: { open: number; close: number } }) {
  const w = preWindowTimes(win, eventStartsAt ?? "");
  // 직접 날짜 정하기: 켜면 시작·마감 일시를 달력에서 고른다(지난 기간을 다시 열 때 등). 끄면 며칠 전 설정으로 돌아간다.
  const [manual, setManual] = useState(!!(win.opensAt && win.closesAt));
  const isDirect = manual;
  const toggle = (on: boolean) => {
    setManual(on);
    if (on) {
      const toKst = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 16);
      const now = Date.now();
      onChange({ ...win, opensAt: win.opensAt || toKst(w?.opens ?? now), closesAt: win.closesAt || toKst(Math.max(w?.closes ?? 0, now + 7 * 86_400_000)) });
    } else onChange({ ...win, opensAt: "", closesAt: "" });
  };
  const dateToggle = (
    <div className="checks"><label><input type="checkbox" checked={isDirect} onChange={(e) => toggle(e.target.checked)} />직접 날짜 정하기</label></div>
  );
  if (isDirect) {
    const bad = !win.opensAt || !win.closesAt;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {dateToggle}
        <div className="win-row">
          <span className="l" style={{ margin: 0 }}>시작</span>
          <div style={{ flex: "1 1 190px", minWidth: 0 }}><DateField id={`${id}-oa`} ariaLabel="시작 일시" mode="datetime" value={win.opensAt ?? ""} onChange={(v) => onChange({ ...win, opensAt: v })} /></div>
        </div>
        <div className="win-row">
          <span className="l" style={{ margin: 0 }}>마감</span>
          <div style={{ flex: "1 1 190px", minWidth: 0 }}><DateField id={`${id}-ca`} ariaLabel="마감 일시" mode="datetime" value={win.closesAt ?? ""} onChange={(v) => onChange({ ...win, closesAt: v })} /></div>
        </div>
        <span className="small">
          {bad ? "시작과 마감 일시를 모두 골라 주세요." : w ? `실제 기간: ${kstText(w.opens)}부터 ${kstText(w.closes)}까지${w.closes <= w.opens ? " · 마감이 시작보다 빨라요" : ""}` : ""}
        </span>
      </div>
    );
  }
  // 며칠 전 칸: 지우고 다시 쓸 수 있다(비우고 나가면 0일 전 = 일정 당일)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {dateToggle}
      <div className="win-row">
        <span className="l" id={`${id}-o`} style={{ margin: 0 }}>시작</span>
        <span>일정</span>
        <NumField className="field num" aria-labelledby={`${id}-o`} aria-label="시작: 일정 며칠 전" min={0} max={365} value={win.opensBeforeDays ?? defaults.open} onChange={(n) => onChange({ ...win, opensBeforeDays: n })} />
        <span>일 전</span>
        <input className="field num" type="time" step={300} aria-label="시작 시각" value={win.opensTime ?? ""} onChange={(e) => onChange({ ...win, opensTime: e.target.value || undefined })} />
      </div>
      <div className="win-row">
        <span className="l" id={`${id}-c`} style={{ margin: 0 }}>마감</span>
        <span>일정</span>
        <NumField className="field num" aria-labelledby={`${id}-c`} aria-label="마감: 일정 며칠 전" min={0} max={365} value={win.closesBeforeDays ?? defaults.close} onChange={(n) => onChange({ ...win, closesBeforeDays: n })} />
        <span>일 전</span>
        <input className="field num" type="time" step={300} aria-label="마감 시각" value={win.closesTime ?? ""} onChange={(e) => onChange({ ...win, closesTime: e.target.value || undefined })} />
      </div>
      <span className="small">
        {w ? `실제 기간: ${kstText(w.opens)}부터 ${kstText(w.closes)}까지${w.closes <= w.opens ? " · 마감이 시작보다 빨라요" : ""}` : "시각을 비워 두면 기준 시각(활동 시작, 없으면 일정 시작)이에요. 0일 전 = 그날이에요."}
      </span>
    </div>
  );
}

// inEvent: 일정 활동에서 고칠 때(참여 대상은 활동 카드에서 일정마다 정하므로 여기서는 고르지 않는다)
// isNew: 새 템플릿(기능 블록을 넣을지 먼저 묻는다)
export function TemplateEditor({ value, onChange, eventStartsAt, inEvent, isNew }: { value: EditableConfig; onChange: (v: EditableConfig) => void; eventStartsAt?: string; inEvent?: boolean; isNew?: boolean }) {
  const steps = value.onsite.steps;
  const ds = useDragSort(steps, (next) => onChange({ ...value, onsite: { steps: next } }));
  const setStep = (i: number, patch: Partial<(typeof steps)[number]>) =>
    onChange({ ...value, onsite: { steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) } });
  const pre = value.preEvent;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="grid2">
        <div><label className="l" htmlFor="t-name">활동 이름</label><input id="t-name" className="field" autoComplete="off" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
        <div><span className="l">설명 (자동)</span><div className="small" style={{ lineHeight: 1.6, padding: "6px 0" }}>{describeTemplate(value)}</div></div>
      </div>

      <BlockPicker value={value} onChange={onChange} isNew={isNew} />

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>참여 범위</b>
        {inEvent ? (
          <span className="small">참여 범위와 선별 조건은 템플릿에서 정해요. 이 일정의 참여자와 회원마다 전체참여 / 선택참여는 활동 카드의 “활동참여자선택”에서 정해요. 여기서 저장해도 바뀌지 않아요.</span>
        ) : (<>
        <label className="l" htmlFor="t-part">참여 범위</label>
        <select id="t-part" className="field" value={canSelect(value) ? "selectable" : "all"}
          onChange={(e) => onChange(e.target.value === "all" ? { ...value, selectable: false, participants: "selected" } : { ...value, selectable: true, participants: "selected" })}>
          <option value="all">전체 참여만 (고른 참여자 모두 모든 액션)</option>
          <option value="selectable">선택 참여 가능 (참여자마다 전체참여 / 선택참여)</option>
        </select>
        <span className="small">활동 참여자는 일정 › 활동의 “활동참여자선택”에서 골라요. 전체참여 회원은 활동 안의 모든 액션에 참여하고, “선택 참여 가능”이면 일정에서 회원마다 선택참여(아래에서 고른 액션만)로 정할 수 있어요.</span>
        {canSelect(value) && (() => {
          const acts = activityActions(value);
          const on = new Set(value.partialActions ?? []);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              <span className="l" style={{ margin: 0 }}>선별 조건: 선택참여 회원이 하는 액션</span>
              {acts.length ? (
                <div className="checks" role="group" aria-label="선택참여 회원이 하는 액션">
                  {acts.map((x) => (
                    <label key={x.key}>
                      <input type="checkbox" checked={on.has(x.key)} onChange={(e) => {
                        const n = new Set(on);
                        if (e.target.checked) n.add(x.key);
                        else n.delete(x.key);
                        onChange({ ...value, partialActions: acts.map((y) => y.key).filter((k) => n.has(k)) });
                      }} />
                      {x.label}
                    </label>
                  ))}
                </div>
              ) : <span className="small">이 활동에는 회원이 하는 액션이 아직 없어요(사전 작성·현장 단계를 먼저 정해 주세요).</span>}
              <span className="small">활동 흐름 순서대로 보여요. 체크하지 않은 액션은 선택참여 회원에게 열리지 않아요.</span>
            </div>
          );
        })()}
        </>)}
        <label className="l" htmlFor="t-mode" style={{ marginTop: 6 }}>활동 방식</label>
        <select id="t-mode" className="field" value={modeOf(value)} onChange={(e) => onChange({ ...value, mode: e.target.value as "all" | "team" })}>
          <option value="all">모두 함께</option>
          <option value="team">팀별 (팀을 나눠 진행)</option>
        </select>
        <span className="small">팀별로 정해도 템플릿에는 팀을 넣지 않아요. 일정 › 활동 탭에서 이 활동을 넣은 뒤 그 일정의 참여자로 팀을 배정해요.</span>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>진행자</b>
        <div className="checks">
          <label>
            <input type="checkbox" checked={!!value.host?.required}
              onChange={(e) => onChange({ ...value, host: { ...value.host, required: e.target.checked } })} />
            이 활동은 진행자가 있어야 해요
          </label>
        </div>
        <span className="small">
          켜 두면 일정 › 활동에서 진행자(회원 중 한 명)와 진행자 접속번호를 정할 때까지 “진행자 필요”로 표시되고, 진행자 없이는 현장 진행을 시작할 수 없어요(관리자가 직접 진행하는 것은 돼요).
          진행자 사람과 번호는 일정마다 달라서 템플릿에는 넣지 않아요.
        </span>
        <label className="l" htmlFor="t-host-note" style={{ marginBottom: 0 }}>진행자에게 줄 안내 (선택)</label>
        <textarea id="t-host-note" className="field" rows={2} maxLength={500} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
          placeholder="예: 프로젝터에 진행자 화면을 띄울 노트북을 준비해 주세요."
          value={value.host?.note ?? ""}
          onChange={(e) => onChange({ ...value, host: { required: !!value.host?.required, ...(e.target.value ? { note: e.target.value } : {}) } })} />
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>일정 전 사전 작성</b>
        <div className="checks">
          <label>
            <input type="checkbox" checked={pre.enabled} onChange={(e) => onChange({ ...value, preEvent: { ...pre, enabled: e.target.checked } })} />
            사전 작성 단계가 있어요
          </label>
        </div>
        {!pre.enabled && <span className="small">끄면 이 활동은 일정 당일 현장에서만 진행하고, 회원 홈에 “현장에서 진행”으로 표시돼요.</span>}
        {/* 사전 단계마다 시작·마감(일정 며칠 전 + 시각) */}
        {pre.enabled && (
          <>
            <b style={{ fontSize: fs(15) }}>① {pre.steps.includes("ai_interview") ? "사전 작성(AI 인터뷰로 소개 쓰기)" : pre.steps.includes("worry_write") ? "사전 작성(고민 쓰기)" : "사전 작성"}</b>
            <span className="small">작성 기간(일정 며칠 전부터 며칠 전까지)은 일정 › 활동에서 일정마다 정해요.</span>
          </>
        )}
        {pre.enabled && value.guessPhase && (
          <>
            <div className="checks" style={{ marginTop: 6 }}>
              <label>
                <input type="checkbox" checked={value.guessPhase.enabled} onChange={(e) => onChange({ ...value, guessPhase: { ...value.guessPhase!, enabled: e.target.checked } })} />
                <b style={{ fontSize: fs(15) }}>② 사전 맞히기(누구인지 미리 맞혀 보기)</b>
              </label>
            </div>
            {value.guessPhase.enabled && <span className="small">맞히기 기간도 일정 › 활동에서 일정마다 정해요.</span>}
          </>
        )}
      </div>

      {/* 나의 고민은?(고민 엔진): 대화 타이머 시간과 연장 단위 */}
      {pre.steps.includes("worry_write") && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>대화 타이머</b>
          <span className="small">고민을 하나 뽑으면 이 시간만큼 대화 타이머가 돌아가요. 진행 화면의 “+N분” 버튼은 아래 연장 단위만큼 늘려요.</span>
          <div className="win-row">
            <label className="l" htmlFor="t-talk" style={{ margin: 0, width: "auto" }}>고민 하나당</label>
            <input id="t-talk" className="field num" inputMode="numeric" value={value.worry?.talkMinutes ?? 15}
              onChange={(e) => onChange({ ...value, worry: { ...value.worry, talkMinutes: Math.max(1, Math.min(120, Number(e.target.value.replace(/[^0-9]/g, "")) || 1)) } })} />
            <span>분</span>
            <label className="l" htmlFor="t-ext" style={{ margin: "0 0 0 12px", width: "auto" }}>연장 단위</label>
            <input id="t-ext" className="field num" inputMode="numeric" value={value.worry?.extendMinutes ?? 5}
              onChange={(e) => onChange({ ...value, worry: { ...value.worry, extendMinutes: Math.max(1, Math.min(60, Number(e.target.value.replace(/[^0-9]/g, "")) || 1)) } })} />
            <span>분</span>
          </div>
        </div>
      )}

      {/* 소개 작성 활동('내가 누구일까요?'): 프로필 북 실명 공개 시점 */}
      {pre.steps.includes("ai_interview") && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>프로필 북 실명 공개 시점</b>
          <span className="small">이 활동의 참여 회원은 프로필 북에서 이름 대신 별칭(랜덤 닉네임)으로 보이다가, 이 시점이 지나면 실명과 소개가 함께 공개돼요.</span>
          <label className="l" htmlFor="t-reveal" style={{ marginBottom: 0 }}>공개 시점</label>
          <select id="t-reveal" className="field" value={value.reveal?.mode ?? "end"}
            onChange={(e) => onChange({ ...value, reveal: { ...value.reveal, mode: e.target.value as "end" | "after" | "at" } })}>
            <option value="end">일정(활동)이 끝나면 바로</option>
            <option value="after">일정(활동)이 끝나고 정한 시간 뒤</option>
            <option value="at">날짜와 시간 직접 정하기</option>
          </select>
          {value.reveal?.mode === "after" && (
            <div><label className="l" htmlFor="t-reveal-h">끝나고 몇 시간 뒤</label>
              <NumField id="t-reveal-h" className="field" min={0} max={2000} style={{ maxWidth: 160 }} value={value.reveal?.hours ?? 0}
                onChange={(n) => onChange({ ...value, reveal: { mode: "after", ...value.reveal, hours: n } })} /></div>
          )}
          {value.reveal?.mode === "at" && (
            <div><span className="l">공개 일시 (한국 시간)</span>
              <DateField mode="datetime" ariaLabel="실명 공개 일시" style={{ width: 300, maxWidth: "100%" }} value={value.reveal?.at ?? ""}
                onChange={(v) => onChange({ ...value, reveal: { mode: "at", ...value.reveal, at: v } })} /></div>
          )}
          <span className="small">“끝나면”은 일정 › 활동에 정한 진행 시간이 있으면 그 끝, 없으면 일정이 끝나는 시각이에요. 날짜를 직접 정하는 것은 일정에 넣은 활동 설정에서 하는 게 좋아요(템플릿은 여러 일정에 쓰이므로).</span>
        </div>
      )}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>현장 진행 단계</b>
        {steps.length > 1 && <span className="small">단계 왼쪽 위 ⠿ 손잡이를 끌어서 순서를 바꿔요.</span>}
        <datalist id="host-btn-list">{(HOST_BUTTONS[kindOfConfig(value)] ?? []).map((b) => <option key={b} value={b} />)}</datalist>
        <span className="small">회원 휴대폰 화면은 이 활동에 만들어진 화면만 고를 수 있어요({({ who: "소개·맞히기 활동", worry: "고민 활동", capsule: "작성 활동", "": "일반 활동" } as const)[kindOfConfig(value)]}: {screensFor(value).map((k) => screenLabel(value, k)).join(" · ")}).{kindOfConfig(value) === "worry" ? " 고민 활동은 진행 상황에 따라 회원 화면이 저절로 바뀌어요: 고민이 뽑히면 내용·타이머가 보이고, 진행자가 “이름 오픈”을 누르면 작성자가 보여요." : ""}</span>
        {steps.map((st, i) => {
          const row = ds.item(i);
          return (
          <div key={st.key} ref={row.ref} className="card" style={{ background: "var(--soft)", display: "flex", flexDirection: "column", gap: 10, ...row.style }}>
            <div className="row">
              <DragHandle {...ds.handle(i, st.label || `단계 ${i + 1}`)} />
              <b className="grow">{i + 1}. {st.label || "새 단계"}</b>
            </div>
            <div className="grid2">
              <div><label className="l" htmlFor={`s-l-${i}`}>단계 이름</label><input id={`s-l-${i}`} className="field" autoComplete="off" value={st.label} onChange={(e) => setStep(i, { label: e.target.value })} /></div>
              <div><label className="l" htmlFor={`s-b-${i}`}>진행자 버튼에 보이는 글자 (비우면 버튼 없음)</label><input id={`s-b-${i}`} className="field" autoComplete="off" list="host-btn-list" value={st.hostButton ?? ""} onChange={(e) => setStep(i, { hostButton: e.target.value || undefined })} /><span className="small">글자만 바뀌고, 버튼이 하는 일은 이 단계에 따라 정해져요.</span></div>
              <div>
                <label className="l" htmlFor={`s-s-${i}`}>회원 휴대폰에 보이는 화면</label>
                <select id={`s-s-${i}`} className="field" value={st.memberScreen} onChange={(e) => setStep(i, { memberScreen: e.target.value as typeof st.memberScreen })}>
                  {[...screensFor(value), ...(screensFor(value).includes(st.memberScreen) ? [] : [st.memberScreen])].map((k) => (
                    <option key={k} value={k}>{screenLabel(value, k)}{screensFor(value).includes(k) ? "" : " (이 활동에는 없는 화면)"}</option>
                  ))}
                </select>
                {!screensFor(value).includes(st.memberScreen) && <span className="small" style={{ color: "var(--red, #c33)" }}>이 활동에는 없는 화면이에요. 다른 화면으로 바꿔 주세요.</span>}
              </div>
              <div>
                <label className="l" htmlFor={`s-u-${i}`}>회원 화면이 켜지는 때</label>
                <select id={`s-u-${i}`} className="field" value={st.unlock} onChange={(e) => setStep(i, { unlock: e.target.value as typeof st.unlock })}>
                  {Object.entries(UNLOCK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="row">
              <button className="mini danger" type="button" disabled={steps.length <= 1} onClick={() => onChange({ ...value, onsite: { steps: steps.filter((_, j) => j !== i) } })}>단계 지우기</button>
            </div>
          </div>
          );
        })}
        <button
          className="btn white"
          type="button"
          style={{ width: "auto", alignSelf: "flex-start" }}
          onClick={() => onChange({ ...value, onsite: { steps: [...steps, { key: nextKey(steps), label: "새 단계", memberScreen: "wait", unlock: "host_click", hostButton: "시작" }] } })}
        >
          + 단계 추가
        </button>
      </div>
    </div>
  );
}

function nextKey(steps: { key: string }[]): string {
  let n = steps.length + 1;
  while (steps.some((s) => s.key === `step-${n}`)) n++;
  return `step-${n}`;
}
