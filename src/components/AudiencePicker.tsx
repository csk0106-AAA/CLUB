"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Audience } from "@/lib/audience";
import { api, fmtDate } from "@/lib/client";
import { fs } from "@/lib/fs";

// 공개 대상 고르기 (게시글·일정 공통).
//  전체 회원 / 회원 선택 / 일정 참석자 선택(여러 일정) / 클럽 선택(여러 클럽)
// 일정·클럽을 고르면 그 회원이 아래 명단에 미리 체크되고, 명단에서 한 명씩 더 고치거나 뺄 수 있다.
// 목록은 /api/audience-options (글을 쓸 수 있는 회원만) 에서 불러온다.
export type AudienceOptions = {
  members: { id: string; name: string; kind: string }[];
  kinds: string[];
  events: { id: string; name: string; startsAt: string; attendeeIds: string[] }[];
  clubs: { name: string; memberIds: string[] }[];
};

// 회원 선택 / 일정 참석자 선택 / 클럽 선택. "회원 선택"에서 모든 회원을 고르면 "전체 회원"(mode all)으로 저장해
// 나중에 들어온 회원에게도 보이게 한다.
const MODES: { k: "members" | "events" | "clubs"; l: string }[] = [
  { k: "members", l: "회원 선택" },
  { k: "events", l: "일정 참석자 선택" },
  { k: "clubs", l: "클럽 선택" },
];
const NO_KIND = "미지정";
const REGULAR = "정회원";

// membersOnly: 회원 선택·일정 참석자 선택·클럽 선택 고르기를 숨기고 "보여 줄 회원"만(모임설정 › 회비설정)
// club: 클럽 일정의 클럽 이름 — "클럽회원&참관회원" 빠른 선택(mode "clubs", 클럽 명단이 바뀌면 자동 반영)을 보여 준다
export function AudiencePicker({ value, onChange, legend = "공개 대상", membersOnly, club }: { value: Audience; onChange: (a: Audience) => void; legend?: string; membersOnly?: boolean; club?: string }) {
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
  // 클럽회원&참관회원(자동 반영): 지금 클럽 회원을 고른 것으로 보여 준다
  const clubMode = !!club && value.mode === "clubs" && value.clubs.length === 1 && value.clubs[0] === club;
  const clubIds = useMemo(() => (club ? opts?.clubs.find((c) => c.name === club)?.memberIds ?? [] : []), [club, opts]);
  const picked = useMemo(() => new Set(value.mode === "all" ? allIds : clubMode ? clubIds : value.memberIds), [value.mode, value.memberIds, allIds, clubMode, clubIds]);

  // 회원만 고르는 화면인데 예전 글이 일정·클럽 대상이면 그 회원들을 회원 선택으로 바꿔 둔다
  useEffect(() => {
    if (membersOnly && opts && tab !== "members" && !clubMode) emit(picked, { mode: "members", events: [], clubs: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersOnly, opts, tab]);

  // 고른 회원 목록을 저장 형식으로: 회원 선택에서 모두 골랐으면 전체 회원
  function emit(ids: Iterable<string>, base: Partial<Audience> = {}) {
    const set = new Set(ids);
    // 회원만 고르는 화면에서 한 명이라도 고치면 그때 명단(회원 직접 고름)으로 저장한다
    const mode = base.mode ?? (membersOnly ? "members" : tab);
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

  // 일정·클럽을 켜면 그 회원을 더하고, 끄면 다른 고른 일정·클럽에 없는 회원만 뺀다.
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
      {!membersOnly && <div className="checks" role="radiogroup" aria-label={legend}>
        {MODES.map((m) => (
          <label key={m.k} style={tab === m.k ? { borderColor: "var(--blue)", background: "var(--blue-bg)", color: "var(--blue-t)" } : undefined}>
            <input type="radio" name={`${uid}-mode`} checked={tab === m.k} onChange={() => setMode(m.k)} />
            {m.l}
          </label>
        ))}
      </div>}
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
          <span className="l" id={`${uid}-cl`}>클럽 고르기 (여러 개 가능)</span>
          {opts.clubs.length === 0 && <span className="small">등록된 클럽이 없어요.</span>}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, ...(membersOnly ? {} : { borderTop: "1px solid var(--line)", paddingTop: 10 }) }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="l" id={`${uid}-mem`} style={{ margin: 0 }}>
              보여 줄 회원 <b style={{ color: "var(--blue-t)" }}>{value.mode === "all" ? `전체 회원 (${allIds.length}명)` : clubMode ? `클럽 회원 ${clubIds.length}명 + 참관자 (자동 반영)` : `${picked.size}명`}</b>
            </span>
          </div>
          {(tab === "members" || membersOnly) && (
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }} role="group" aria-label="빠른 선택">
              {club && (
                <button className={`mini${clubMode ? " on" : ""}`} type="button" aria-pressed={clubMode} onClick={() => onChange({ mode: "clubs", events: [], clubs: [club], memberIds: clubIds })}>클럽회원&참관회원</button>
              )}
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
          <span className="hint">{clubMode ? "클럽회원&참관회원: 클럽 회원이 바뀌거나 참관자가 생기면 자동으로 반영돼요. 아래에서 한 명이라도 고치면 그때 고른 명단으로 고정돼요. " : ""}{club ? "참관자에게는 늘 보여요. " : ""}회원구분 이름을 누르면 그 구분 회원을 모두 고르고, 한 번 더 누르면 모두 빼요. 작성자 본인에게는 항상 보여요.{tab === "members" ? " 모든 회원을 고르면 ‘전체 회원’으로 저장돼 나중에 들어온 회원에게도 보여요." : ""}</span>
        </div>
      )}
    </fieldset>
  );
}
