"use client";

import { useId, useRef, useState } from "react";

type M = { id: string; name: string; kind?: string; position?: string };

// 한글 초성: "김하늘" → "ㄱㅎㄴ"
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const choOf = (s: string) =>
  [...s].map((c) => {
    const k = c.charCodeAt(0) - 0xac00;
    return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c;
  }).join("");
const onlyCho = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);

// 이름 맞춤: 그대로 포함 또는 초성 포함. 앞에서부터 맞는 이름을 먼저.
function search<T extends M>(members: T[], q: string): T[] {
  const query = q.replace(/\s/g, "");
  if (!query) return members;
  const hit = (m: T) => {
    const n = m.name.replace(/\s/g, "");
    const i = onlyCho(query) ? choOf(n).indexOf(query) : n.indexOf(query);
    return i;
  };
  return members.map((m) => [m, hit(m)] as const).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name, "ko")).map(([m]) => m);
}

// 회원 한 명을 고르는 칸(클럽 회원 더하기, 참관자 추가에 같이 쓴다).
// 이름을 치면 맞는 회원이 아래 목록으로 뜨고(초성 "ㄱㅎㄴ"도 됨), ▾ 를 누르면 등록된 회원 전체에서 고를 수 있다.
// 키보드: ↓↑ 로 고르고 Enter 로 더하기, Esc 로 닫기.
export function MemberSearch<T extends M>({ label, members, onPick, disabled }: {
  label: string;
  members: T[];
  onPick: (m: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const hits = search(sorted, q).slice(0, 100);
  const show = open && !disabled;

  function pick(m: T) {
    onPick(m);
    setQ("");
    setAct(0);
    setOpen(false);
    input.current?.focus();
  }
  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setAct((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAct((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (show && hits[act]) {
        e.preventDefault();
        pick(hits[act]);
      }
    } else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="l" htmlFor={id}>{label}</label>
      <div className="msearch">
        <input
          ref={input} id={id} className="field" type="text" role="combobox" autoComplete="off"
          aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={show && hits[act] ? `${id}-o${act}` : undefined}
          placeholder={members.length ? "이름 입력 또는 목록에서 고르기" : "더할 수 있는 회원이 없어요"}
          value={q} disabled={disabled || members.length === 0}
          onChange={(e) => { setQ(e.target.value); setAct(0); setOpen(true); }}
          onKeyDown={key}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
        <button type="button" className="msearch-t" aria-label={`${label} 목록 ${show ? "닫기" : "열기"}`} tabIndex={-1}
          disabled={disabled || members.length === 0}
          onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(!open); setAct(0); input.current?.focus(); }}>▾</button>
        {show && (
          <ul id={listId} role="listbox" aria-label={`${label} 후보`} className="msearch-l">
            {hits.length === 0 && <li className="none">{q.trim() ? "찾는 회원이 없어요." : "더할 수 있는 회원이 없어요."}</li>}
            {hits.map((m, i) => (
              <li key={m.id} id={`${id}-o${i}`} role="option" aria-selected={i === act}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAct(i)} onClick={() => pick(m)}>
                <b>{m.name}</b>
                {(m.kind || m.position) && <span>{[m.kind, m.position].filter(Boolean).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
