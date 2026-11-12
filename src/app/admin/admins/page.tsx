"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate, PERM_LABELS } from "@/components/AdminGate";
import { api } from "@/lib/client";

type M = {
  id: string; name: string; kind: string; position: string; gender: string; company: string; title: string;
  birth: string; phone: string; ageGroup: string; perms: string[];
};
type Note = { tone: "bad" | "info"; text: string } | null;

const MAX = 5;
const PART = ["members", "events", "fees", "activities", "minutes"];
const PART_TEXT: Record<string, string> = {
  members: "회원 명단, 원우회 설정, 조직도",
  events: "행사 개요, 참석 신청, 일정, 카풀·방배정",
  fees: "회비 입금 확인, 비용과 예산",
  activities: "활동 진행, 조편성, 팀 구성",
  minutes: "회의록, 회칙",
};
const COLORS = ["#1CB0F6", "#FF9600", "#CE82FF", "#FF4B4B", "#58CC02", "#2B70C9"];
const colorOf = (s: string) => COLORS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

// 관리자 정보는 회원 PATCH API 로 바꾼다. 서버가 최대 인원, 모든 권한 관리자 최소 1명을 확인한다.
function body(m: M, perms: string[]) {
  return { name: m.name, kind: m.kind, position: m.position, gender: m.gender, company: m.company, title: m.title, birth: m.birth, phone: m.phone, ageGroup: m.ageGroup, perms };
}

function PermPicker({ value, onChange, disabled, idp }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean; idp: string }) {
  const all = value.includes("all");
  return (
    <div className="checks" role="group" aria-label="권한">
      <label htmlFor={`${idp}-all`}>
        <input id={`${idp}-all`} type="checkbox" disabled={disabled} checked={all} onChange={(e) => onChange(e.target.checked ? ["all"] : [])} />
        {PERM_LABELS.all}
      </label>
      {PART.map((p) => (
        <label key={p} htmlFor={`${idp}-${p}`}>
          <input id={`${idp}-${p}`} type="checkbox" disabled={disabled || all} checked={all || value.includes(p)}
            onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))} />
          {PERM_LABELS[p]}
        </label>
      ))}
    </div>
  );
}

function Admins() {
  const [list, setList] = useState<M[] | null>(null);
  const [meAll, setMeAll] = useState(false);
  const [myName, setMyName] = useState("");
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [perms, setPerms] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [m, me] = await Promise.all([api<{ members: M[] }>("/api/admin/members"), api<{ name: string; perms: string[] }>("/api/me")]);
    if (m.ok) setList(m.data.members);
    else setNote({ tone: "bad", text: m.error });
    if (me.ok) {
      setMeAll(me.data.perms.includes("all"));
      setMyName(me.data.name);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function apply(m: M, next: string[], done: string) {
    setBusy(true);
    setNote(null);
    const r = await api(`/api/admin/members/${m.id}`, { method: "PATCH", body: body(m, next) });
    setBusy(false);
    if (!r.ok) {
      setNote({ tone: "bad", text: r.error });
      return false;
    }
    setNote({ tone: "info", text: done });
    await load();
    return true;
  }

  const stopEdit = (id: string) => setEditing((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)));

  if (!list) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const admins = list.filter((m) => m.perms.length > 0);
  const others = list.filter((m) => m.perms.length === 0);
  const full = admins.length >= MAX;

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {!meAll && <div className="msg info">관리자를 추가하거나 권한을 바꾸는 일은 “모든 권한” 관리자만 할 수 있어요. 지금은 볼 수만 있어요.</div>}
      <div className="adm-two">
        <section style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }} aria-label="권한 종류">
          <b style={{ font: "400 20px var(--display)" }}>권한 종류</b>
          <div className="card"><b>모든 권한</b><div className="small">회원관리, 행사진행 전부와 관리자 추가·삭제, 권한 바꾸기</div></div>
          <div className="card">
            <b>부분 권한 (여러 개 선택)</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {PART.map((p) => <li key={p} className="small"><b style={{ color: "var(--ink)" }}>{PERM_LABELS[p]}</b> · {PART_TEXT[p]}</li>)}
            </ul>
          </div>
          <span className="small">관리자는 최대 {MAX}명까지 둘 수 있어요. 일반 회원과 같은 방법으로 로그인한 뒤 관리자 비밀번호를 한 번 더 입력해요. 모든 권한 관리자는 한 명 이상 있어야 해요.</span>
        </section>

        <section className="card" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }} aria-label="관리자 목록">
          <b style={{ font: "400 20px var(--display)" }}>관리자 <span className="num">{admins.length} / {MAX}</span></b>
          {admins.map((m) => {
            const ed = editing[m.id];
            return (
              <div key={m.id} className="adm1">
                <div className="row">
                  <span className="avatar" aria-hidden style={{ background: colorOf(m.name) }}>{m.name.slice(0, 1)}</span>
                  <span className="grow">{m.name}{m.position ? ` · ${m.position}` : ""}{m.name === myName ? <span className="small"> (나)</span> : null}</span>
                  {meAll && !ed && <button className="mini" type="button" onClick={() => setEditing({ ...editing, [m.id]: m.perms })}>권한 바꾸기</button>}
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 4, paddingLeft: 44 }}>
                  {m.perms.map((p) => <span key={p} className={`pill ${p === "all" ? "ok" : "blue"}`}>{PERM_LABELS[p] ?? p}</span>)}
                </div>
                {ed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 44 }}>
                    <PermPicker idp={`e-${m.id}`} value={ed} disabled={busy} onChange={(v) => setEditing({ ...editing, [m.id]: v })} />
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <button className="mini" type="button" disabled={busy || ed.length === 0} onClick={async () => { if (await apply(m, ed, `${m.name} 님의 권한을 바꿨어요.`)) stopEdit(m.id); }}>저장</button>
                      <button className="mini danger" type="button" disabled={busy} onClick={async () => {
                        if (!window.confirm(`${m.name} 님의 관리자 권한을 없앨까요? 회원 정보는 그대로 남아요.`)) return;
                        if (await apply(m, [], `${m.name} 님의 관리자 권한을 없앴어요.`)) stopEdit(m.id);
                      }}>관리자에서 빼기</button>
                      <button className="mini" type="button" onClick={() => stopEdit(m.id)}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {admins.length === 0 && <span className="small">관리자가 없어요.</span>}

          {meAll && !adding && (
            <button className="btn white" type="button" style={{ minHeight: 48, fontSize: 18 }} disabled={full} onClick={() => { setAdding(true); setPick(""); setPerms([]); }}>
              {full ? `관리자가 가득 찼어요 (${MAX}명)` : "+ 관리자 추가 · 권한 정하기"}
            </button>
          )}
          {meAll && adding && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
              <b>관리자 추가</b>
              <div>
                <label className="l" htmlFor="ad-m">회원 고르기</label>
                <select id="ad-m" className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">회원을 골라 주세요</option>
                  {others.map((m) => <option key={m.id} value={m.id}>{m.name}{m.position ? ` · ${m.position}` : ""}</option>)}
                </select>
              </div>
              <div><span className="l">권한</span><PermPicker idp="add" value={perms} disabled={busy} onChange={setPerms} /></div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: 17 }} disabled={busy || !pick || perms.length === 0}
                  onClick={async () => {
                    const m = others.find((x) => x.id === pick);
                    if (m && (await apply(m, perms, `${m.name} 님을 관리자로 추가했어요.`))) setAdding(false);
                  }}>추가</button>
                <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => setAdding(false)}>취소</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function AdminsPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/admins"><Admins /></AdminGate>;
}
