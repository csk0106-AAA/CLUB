"use client";

import { useEffect, useRef, useState } from "react";

type M = { id: string; name: string };

// 한글 초성: "ㅎㄱㄷ"으로 "홍길동"을 찾을 수 있게 한다
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const chosung = (s: string) =>
  [...s].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join("");
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const isCho = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);

function matches(name: string, q: string): boolean {
  const n = norm(name);
  const k = norm(q);
  if (!k) return true;
  return n.includes(k) || (isCho(k) && chosung(n).includes(k));
}

// 로그인 이름 고르기: 입력하면 명단에서 바로 걸러 보여 주고, 눌러서(또는 ↑↓·Enter) 고른다.
// 고르기 전에는 value 가 "" 이다.
export function NameSearch({ id, members, value, onChange }: { id: string; members: M[]; value: string; onChange: (id: string) => void }) {
  const picked = members.find((m) => m.id === value);
  const [q, setQ] = useState(picked?.name ?? "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // 밖에서 이름이 정해지면(회원 신청 직후) 칸에도 보여 준다
  useEffect(() => {
    if (picked) setQ(picked.name);
  }, [picked]);
  // 바깥을 누르면 목록을 닫는다
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const list = q.trim() ? members.filter((m) => matches(m.name, q)) : [];
  const shown = list.slice(0, 8);

  function type(v: string) {
    setQ(v);
    setHi(0);
    setOpen(true);
    // 이름을 정확히 다 쳤고 같은 이름이 하나뿐이면 바로 고른 것으로 본다
    const exact = members.filter((m) => norm(m.name) === norm(v));
    onChange(exact.length === 1 ? exact[0].id : "");
  }
  function pick(m: M) {
    setQ(m.name);
    onChange(m.id);
    setOpen(false);
  }

  return (
    <div ref={box} className="name-search">
      <input id={id} className="field" type="text" autoComplete="off" spellCheck={false} placeholder="이름을 입력해 주세요 (초성도 돼요: ㅎㄱㄷ)"
        role="combobox" aria-expanded={open && shown.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && shown[hi] ? `${id}-o-${hi}` : undefined}
        value={q} onChange={(e) => type(e.target.value)} onFocus={() => q.trim() && !value && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || shown.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % shown.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + shown.length) % shown.length); }
          else if (e.key === "Enter") { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && q.trim() && (
        <ul id={`${id}-list`} role="listbox" className="name-search-list">
          {shown.map((m, i) => (
            <li key={m.id} id={`${id}-o-${i}`} role="option" aria-selected={i === hi} className={i === hi ? "on" : ""}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }} onMouseEnter={() => setHi(i)}>
              {m.name}
            </li>
          ))}
          {list.length > shown.length && <li className="more" aria-disabled="true">{list.length - shown.length}명 더 있어요. 조금 더 입력해 주세요.</li>}
          {list.length === 0 && <li className="more" aria-disabled="true">명단에 없는 이름이에요.</li>}
        </ul>
      )}
    </div>
  );
}
