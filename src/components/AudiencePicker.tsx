"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Audience } from "@/lib/audience";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

// 공개 대상 고르기 (게시글·일정 공통).
//  전체 회원 / 회원 선택 / 일정 참석자 선택(여러 일정) / 소모임 선택(여러 소모임)
// 일정·소모임을 고르면 그 회원이 아래 명단에 미리 체크되고, 명단에서 한 명씩 더 고치거나 뺄 수 있다.
// 목록은 /api/audience-options (글을 쓸 수 있는 회원만) 에서 불러온다.
export type AudienceOptions = {
  members: { id: string; name: string; kind: string }[];
  kinds: string[];
  events: { id: string; name: string; startsAt: string; attendeeIds: string[] }[];
  clubs: { name: string; memberIds: string[] }[];
};

// 회원 선택 / 일정 참석자 선택 / 소모임 선택. "회원 선택"에서 모든 회원을 고르면 "전체 회원"(mode all)으로 저장해
// 나중에 들어온 회원에게도 보이게 한다.
const MODES: { k: "members" | "events" | "clubs"; l: string }[] = [
  { k: "members", l: "회원 선택" },
  { k: "events", l: "일정 참석자 선택" },
  { k: "clubs", l: "소모임 선택" },
];
const NO_KIND = "미지정";
const REGULAR = "정회원";

export function AudiencePicker({ value, onChange, legend = "공개 대상" }: { value: Audience; onChange: (a: Audience) => void; legend?: string }) {
  const uid = useId();
  const [opts, setOpts] = useState<AudienceOptions | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api<AudienceOptions>("/api/audience-options").then((r) => (r.ok ? setOpts(r.data) : setErr(r.error)));
  }, []);

  const allIds = useMemo(() => (opts?.members ?? []).map((m) => m.id), [opts]);
  // "전체 회원"(mode all)은 화면에서 "회원 선택 + 모두 체크"로 보여 준다
  const tab: "members" | "events" | "clubs" = value.mode === "all" ? "members" : value.mode;
  const picked = useMemo(() => new Set(value.mode === "all" ? allIds : value.memberIds), [value.mode, value.memberIds, allIds]);

  // 고른 회원 목록을 저장 형식으로: 회원 선택에서 모두 골랐으면 전체 회원
  function emit(ids: Iterable<string>, base: Partial<Audience> = {}) {
    const set = new Set(ids);
    const mode = base.mode ?? tab;
    if (mode === "members" && allIds.length > 0 && allIds.every((id) => set.has(id))) {
      onChange({ mode: "all", events: [], clubs: [], memberIds: [] });
      return;
    }
    onChange({ mode, events: base.events ?? value.events, clubs: base.clubs ?? value.clubs, memberIds: [...set] });
  }

  function setMode(mode: "members" | "events" | "clubs") {
    if (mode === tab) return;
    if (mode === "members") emit(picked, { mode, events: [], clubs: [] });
    else onChange({ mode, events: [], clubs: [], memberIds: [] });
  }

  // 일정·소모임을 켜면 그 회원을 더하고, 끄면 다른 고른 일정·소모임에 없는 회원만 뺀다.
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
    emit(ids, { [kind]: keys });
  }

  function toggleMember(id: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    emit(next);
  }

  const shown = (opts?.members ?? []).filter((m) => !q.trim() || m.name.includes(q.trim()));
  // 회원구분별 묶음(회원 구분 화면의 순서, 목록에 없는 구분은 뒤에, 미지정은 맨 뒤)
  const groups = useMemo(() => {
    const kindOf = (k: string) => k || NO_KIND;
    const order = [...(opts?.kinds ?? [])];
    for (const m of shown) if (!order.includes(kindOf(m.kind)) && kindOf(m.kind) !== NO_KIND) order.push(kindOf(m.kind));
    order.push(NO_KIND);
    return order
      .map((k) => ({ kind: k, members: shown.filter((m) => kindOf(m.kind) === k) }))
      .filter((g) => g.members.length > 0);
  }, [opts, shown]);

  // 회원구분 이름을 누르면 그 구분 회원을 모두 선택, 이미 모두 선택돼 있으면 모두 해제
  function toggleKind(ids: string[]) {
    const next = new Set(picked);
    const allOn = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    emit(next);
  }
  const regularIds = (opts?.members ?? []).filter((m) => m.kind === REGULAR).map((m) => m.id);

  return (
    <fieldset className="card" style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0 }}>
      <legend style={{ font: `700 ${fs(16)} var(--display)`, padding: "0 4px" }}>{legend}</legend>
      <div className="checks" role="radiogroup" aria-label={legend}>
        {MODES.map((m) => (
          <label key={m.k} style={tab === m.k ? { borderColor: "var(--blue)", background: "var(--blue-bg)", color: "var(--blue-t)" } : undefined}>
            <input type="radio" name={`${uid}-mode`} checked={tab === m.k} onChange={() => setMode(m.k)} />
            {m.l}
          </label>
        ))}
      </div>
      {err && <div className="msg bad" role="alert">{err}</div>}
      {!opts && !err && <p className="small">목록을 불러오는 중이에요…</p>}

      {tab === "events" && opts && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="l" id={`${uid}-ev`}>일정 고르기 (여러 개 가능) — 참석으로 답한 회원을 불러와요</span>
          {opts.events.length === 0 && <span className="small">일정이 없어요.</span>}
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

      {tab === "clubs" && opts && (
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

      {opts && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="l" id={`${uid}-mem`} style={{ margin: 0 }}>
              보여 줄 회원 <b style={{ color: "var(--blue-t)" }}>{value.mode === "all" ? `전체 회원 (${allIds.length}명)` : `${picked.size}명`}</b>
            </span>
          </div>
          {tab === "members" && (
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }} role="group" aria-label="빠른 선택">
              {regularIds.length > 0 && (
                <button className="mini" type="button" onClick={() => emit(regularIds)}>정회원 선택</button>
              )}
              <button className="mini" type="button" onClick={() => emit(allIds)}>모두 선택</button>
              <button className="mini" type="button" onClick={() => emit([])}>모두 해제</button>
            </div>
          )}
          <input className="field" style={{ minHeight: 44 }} type="search" aria-label="회원 이름으로 찾기" placeholder="이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
          <div role="group" aria-labelledby={`${uid}-mem`} style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {groups.map((g) => {
              const ids = g.members.map((m) => m.id);
              const on = ids.filter((id) => picked.has(id)).length;
              const all = on === ids.length;
              return (
                <div key={g.kind} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* 회원구분 이름: 누르면 이 구분 회원 모두 선택 / 다시 누르면 모두 해제 */}
                  <button type="button" onClick={() => toggleKind(ids)} aria-pressed={all}
                    aria-label={`${g.kind} ${ids.length}명 ${all ? "모두 해제" : "모두 선택"}`}
                    style={{
                      alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 10px",
                      borderRadius: 8, cursor: "pointer", font: `700 ${fs(14)} var(--body)`,
                      border: `1px solid ${all ? "var(--blue)" : "var(--line)"}`,
                      background: all ? "var(--blue-bg)" : "var(--card)", color: all ? "var(--blue-t)" : "var(--ink)",
                    }}>
                    <span aria-hidden="true">{all ? "☑" : on > 0 ? "◩" : "☐"}</span>
                    {g.kind} <span style={{ fontWeight: 500, color: "var(--sub)" }}>{on}/{ids.length}</span>
                  </button>
                  <div className="checks">
                    {g.members.map((m) => (
                      <label key={m.id}>
                        <input type="checkbox" checked={picked.has(m.id)} onChange={(e) => toggleMember(m.id, e.target.checked)} />
                        {m.name}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {groups.length === 0 && <span className="small">찾는 회원이 없어요.</span>}
          </div>
          <span className="hint">회원구분 이름을 누르면 그 구분 회원을 모두 고르고, 한 번 더 누르면 모두 빼요. 작성자 본인에게는 항상 보여요.{tab === "members" ? " 모든 회원을 고르면 ‘전체 회원’으로 저장돼 나중에 들어온 회원에게도 보여요." : ""}</span>
        </div>
      )}
    </fieldset>
  );
}
