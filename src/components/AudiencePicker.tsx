"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Audience } from "@/lib/audience";
import { api, fmtDate } from "@/lib/client";

// 공개 대상 고르기 (게시글·행사 공통).
//  전체 회원 / 회원 선택 / 행사 참석자 선택(여러 행사) / 소모임 선택(여러 소모임)
// 행사·소모임을 고르면 그 회원이 아래 명단에 미리 체크되고, 명단에서 한 명씩 더 고치거나 뺄 수 있다.
// 목록은 /api/audience-options (글을 쓸 수 있는 회원만) 에서 불러온다.
export type AudienceOptions = {
  members: { id: string; name: string }[];
  events: { id: string; name: string; startsAt: string; attendeeIds: string[] }[];
  clubs: { name: string; memberIds: string[] }[];
};

const MODES: { k: Audience["mode"]; l: string }[] = [
  { k: "all", l: "전체 회원" },
  { k: "members", l: "회원 선택" },
  { k: "events", l: "행사 참석자 선택" },
  { k: "clubs", l: "소모임 선택" },
];

export function AudiencePicker({ value, onChange, legend = "공개 대상" }: { value: Audience; onChange: (a: Audience) => void; legend?: string }) {
  const uid = useId();
  const [opts, setOpts] = useState<AudienceOptions | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api<AudienceOptions>("/api/audience-options").then((r) => (r.ok ? setOpts(r.data) : setErr(r.error)));
  }, []);

  const picked = useMemo(() => new Set(value.memberIds), [value.memberIds]);

  function setMode(mode: Audience["mode"]) {
    if (mode === value.mode) return;
    if (mode === "all") onChange({ mode: "all", events: [], clubs: [], memberIds: [] });
    else if (mode === "members") onChange({ mode, events: [], clubs: [], memberIds: value.memberIds });
    else onChange({ mode, events: [], clubs: [], memberIds: [] });
  }

  // 행사·소모임을 켜면 그 회원을 더하고, 끄면 다른 고른 행사·소모임에 없는 회원만 뺀다.
  function toggleGroup(kind: "events" | "clubs", key: string, on: boolean) {
    if (!opts) return;
    const idsOf = (k: string) =>
      kind === "events" ? opts.events.find((e) => e.id === k)?.attendeeIds ?? [] : opts.clubs.find((c) => c.name === k)?.memberIds ?? [];
    const keys = on ? [...value[kind], key] : value[kind].filter((k) => k !== key);
    let ids: Set<string>;
    if (on) ids = new Set([...value.memberIds, ...idsOf(key)]);
    else {
      const keep = new Set(keys.flatMap(idsOf));
      ids = new Set(value.memberIds.filter((id) => keep.has(id) || !idsOf(key).includes(id)));
    }
    onChange({ ...value, [kind]: keys, memberIds: [...ids] });
  }

  function toggleMember(id: string, on: boolean) {
    onChange({ ...value, memberIds: on ? [...new Set([...value.memberIds, id])] : value.memberIds.filter((x) => x !== id) });
  }

  const shown = (opts?.members ?? []).filter((m) => !q.trim() || m.name.includes(q.trim()));

  return (
    <fieldset className="card" style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0 }}>
      <legend style={{ font: "400 18px var(--display)", padding: "0 4px" }}>{legend}</legend>
      <div className="checks" role="radiogroup" aria-label={legend}>
        {MODES.map((m) => (
          <label key={m.k} style={value.mode === m.k ? { borderColor: "var(--blue)", background: "var(--blue-bg)", color: "var(--blue-t)" } : undefined}>
            <input type="radio" name={`${uid}-mode`} checked={value.mode === m.k} onChange={() => setMode(m.k)} />
            {m.l}
          </label>
        ))}
      </div>
      {err && <div className="msg bad" role="alert">{err}</div>}
      {value.mode === "all" && <span className="small">모든 회원에게 보여요.</span>}
      {value.mode !== "all" && !opts && !err && <p className="small">목록을 불러오는 중이에요…</p>}

      {value.mode === "events" && opts && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="l" id={`${uid}-ev`}>행사 고르기 (여러 개 가능) — 참석으로 답한 회원을 불러와요</span>
          {opts.events.length === 0 && <span className="small">행사가 없어요.</span>}
          <div className="checks" role="group" aria-labelledby={`${uid}-ev`}>
            {opts.events.map((e) => (
              <label key={e.id}>
                <input type="checkbox" checked={value.events.includes(e.id)} onChange={(x) => toggleGroup("events", e.id, x.target.checked)} />
                {e.name}{e.startsAt ? ` (${fmtDate(e.startsAt)})` : ""} · {e.attendeeIds.length}명
              </label>
            ))}
          </div>
        </div>
      )}

      {value.mode === "clubs" && opts && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="l" id={`${uid}-cl`}>소모임 고르기 (여러 개 가능)</span>
          {opts.clubs.length === 0 && <span className="small">등록된 소모임이 없어요.</span>}
          <div className="checks" role="group" aria-labelledby={`${uid}-cl`}>
            {opts.clubs.map((c) => (
              <label key={c.name}>
                <input type="checkbox" checked={value.clubs.includes(c.name)} onChange={(x) => toggleGroup("clubs", c.name, x.target.checked)} />
                {c.name} · {c.memberIds.length}명
              </label>
            ))}
          </div>
        </div>
      )}

      {value.mode !== "all" && opts && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "2px solid var(--line)", paddingTop: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="l" id={`${uid}-mem`} style={{ margin: 0 }}>보여 줄 회원 <b style={{ color: "var(--blue-t)" }}>{value.memberIds.length}명</b></span>
            <span className="grow" />
            <button className="mini" type="button" onClick={() => onChange({ ...value, memberIds: [...new Set([...value.memberIds, ...shown.map((m) => m.id)])] })}>{q.trim() ? "찾은 회원 모두 선택" : "모두 선택"}</button>
            <button className="mini" type="button" onClick={() => onChange({ ...value, memberIds: q.trim() ? value.memberIds.filter((id) => !shown.some((m) => m.id === id)) : [] })}>{q.trim() ? "찾은 회원 해제" : "모두 해제"}</button>
          </div>
          <input className="field" style={{ minHeight: 44 }} type="search" aria-label="회원 이름으로 찾기" placeholder="이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="checks" role="group" aria-labelledby={`${uid}-mem`} style={{ maxHeight: 280, overflowY: "auto" }}>
            {shown.map((m) => (
              <label key={m.id}>
                <input type="checkbox" checked={picked.has(m.id)} onChange={(e) => toggleMember(m.id, e.target.checked)} />
                {m.name}
              </label>
            ))}
          </div>
          <span className="hint">작성자 본인에게는 항상 보여요.</span>
        </div>
      )}
    </fieldset>
  );
}
