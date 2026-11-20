"use client";

import { useId, useState } from "react";
import { fs } from "@/lib/fs";

export type SaveMode = "fix" | "version" | "new";

// 저장 결과 안내 문구(템플릿 화면·일정 활동 공통)
export function savedText(r: { mode?: SaveMode; unchanged?: boolean; version?: number; name?: string; propagated?: number }, what: string, inEvent?: boolean): string {
  if (r.unchanged) return "바뀐 내용이 없어서 저장하지 않았어요.";
  if (r.mode === "fix") {
    const n = r.propagated ?? 0;
    return `${what}을 지금 버전${r.version ? `(v${r.version})` : ""}에 고쳐 저장했어요.${n > 0 ? ` 이 버전을 쓰는 일정 활동 ${n}개에도 반영했어요.` : ""}`;
  }
  if (r.mode === "new") return `${what}을 새 활동 “${r.name ?? ""}”(v1)으로 저장했어요.${inEvent ? " 이 일정 활동이 새 활동을 써요." : " 일정에 넣을 때 고를 수 있어요."}`;
  return `${what}을 새 버전(v${r.version})으로 저장했어요.${inEvent ? " 이 일정 활동이 그 버전을 써요. 다른 일정은 쓰던 버전을 그대로 써요." : " 원래 버전과 이미 일정에 넣은 활동은 그대로예요."}`;
}

// 템플릿·일정 활동 편집기의 저장 방법 세 가지. 고치는 사람이 고른다.
//  수정(이 버전 고치기) / 새 버전 저장 / 새 활동으로 저장
// 창 아래쪽(footer)에 넣는다. “새 활동으로 저장”은 이름을 한 번 더 묻는다(원래 활동과 달라야 한다).
export function SaveChoices(props: {
  busy: boolean;
  disabled?: boolean;
  version: number; // 지금 버전 번호
  nextVersion: number; // 새 버전으로 저장하면 붙는 번호
  baseName: string; // 원래 활동 이름(새 활동 이름과 겹치면 안 됨)
  suggestName: string; // 새 활동 이름 처음 값
  otherEvents: number; // 이 버전을 쓰는 다른 일정 수(수정하면 바로 반영되는 곳)
  inEvent?: boolean; // 일정 활동에서 여는지
  onSave: (mode: SaveMode, name?: string) => void;
  onCancel: () => void;
}) {
  const { busy, disabled, version, nextVersion, baseName, suggestName, otherEvents, inEvent, onSave, onCancel } = props;
  const [asking, setAsking] = useState(false);
  const [help, setHelp] = useState(false); // 저장 방법 설명 펼치기
  const [name, setName] = useState(suggestName);
  const id = useId();
  const sameName = name.trim() === baseName.trim();

  function fix() {
    if (otherEvents > 0 && !window.confirm(`이 버전(v${version})을 쓰는 다른 일정 ${otherEvents}곳에도 바로 반영돼요.\n(활동 일시·진행자처럼 일정마다 정한 값은 그대로예요.)\n\n수정할까요?`)) return;
    onSave("fix");
  }

  const btn = { width: "100%", minHeight: 46, fontSize: fs(15) } as const;

  if (asking) {
    return (
      <form style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (name.trim() && !sameName) onSave("new", name.trim()); }}>
        <label className="l" htmlFor={`${id}-name`} style={{ marginBottom: 0 }}>새 활동 이름</label>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input id={`${id}-name`} className="field" autoFocus maxLength={100} value={name} style={{ flex: "1 1 220px" }}
            aria-describedby={`${id}-name-hint`} onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" disabled={busy || !name.trim() || sameName} style={{ width: "auto", minWidth: 150, minHeight: 46, fontSize: fs(15) }}>
            {busy ? "저장 중…" : "새 활동으로 저장"}
          </button>
          <button className="btn white" type="button" disabled={busy} style={{ width: "auto", minWidth: 90, minHeight: 46, fontSize: fs(15) }} onClick={() => setAsking(false)}>뒤로</button>
        </div>
        <span className="small" id={`${id}-name-hint`} role={sameName ? "alert" : undefined}>
          {sameName ? `원래 활동(“${baseName}”)과 다른 이름을 적어 주세요.` : `새 활동 템플릿(v1)으로 따로 저장돼요.${inEvent ? " 이 일정 활동은 새 활동을 써요." : ""}`}
        </span>
      </form>
    );
  }

  const items: { key: SaveMode; label: string; note: string; onClick: () => void; primary?: boolean }[] = [
    {
      key: "fix",
      label: `수정 (이 버전 고치기)`,
      note: `지금 버전(v${version})에 빠진 조건을 넣거나 잘못된 곳을 고쳐요. 새 버전은 생기지 않아요.${otherEvents > 0 ? ` 이 버전을 쓰는 다른 일정 ${otherEvents}곳에도 반영돼요.` : ""}`,
      onClick: fix,
    },
    {
      key: "version",
      label: `새 버전 저장 (v${nextVersion})`,
      note: inEvent
        ? `바꾼 내용을 새 버전(v${nextVersion})으로 저장하고 이 일정 활동이 그 버전을 써요. 다른 일정은 그대로예요.`
        : `바꾼 내용을 새 버전(v${nextVersion})으로 저장해요. 지금 버전과 이미 일정에 넣은 활동은 그대로예요.`,
      onClick: () => onSave("version"),
      primary: true,
    },
    {
      key: "new",
      label: "새 활동으로 저장",
      note: "활동의 성격이 달라졌다면 다른 이름의 새 활동 템플릿(v1)으로 따로 저장해요.",
      onClick: () => { setName(suggestName); setAsking(true); },
    },
  ];

  // 창 아래쪽을 작게: 버튼 한 줄(수정 · 새 버전 · 새 활동 · 취소), 설명은 "?"를 눌러 펼친다(본문이 잘 보이게)
  const short: Record<SaveMode, string> = { fix: "수정", version: `새 버전(v${nextVersion})`, new: "새 활동" };
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      <div role="group" aria-label="저장 방법" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "stretch" }}>
        {items.map((it) => (
          <button key={it.key} className={`btn ${it.primary ? "" : "white"}`} type="button" disabled={busy || disabled} title={it.note}
            style={{ flex: "1 1 72px", minWidth: 0, width: "auto", minHeight: 40, padding: "4px 6px", fontSize: fs(13), lineHeight: 1.25, whiteSpace: "normal", wordBreak: "keep-all", overflowWrap: "anywhere" }}
            aria-describedby={help ? `${id}-${it.key}` : undefined} onClick={it.onClick}>
            {busy ? "저장 중…" : short[it.key]}
          </button>
        ))}
        <button className="mini" type="button" aria-expanded={help} aria-label="저장 방법 설명" style={{ flex: "none", minHeight: 40, width: 40, padding: 0 }} onClick={() => setHelp(!help)}>?</button>
        <button className="mini" type="button" disabled={busy} style={{ flex: "none", minHeight: 40 }} onClick={onCancel}>취소</button>
      </div>
      {help && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2, lineHeight: 1.45 }}>
          {items.map((it) => <li key={it.key} id={`${id}-${it.key}`}><b>{it.label}</b>: {it.note}</li>)}
        </ul>
      )}
    </div>
  );
}
