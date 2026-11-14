"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate, PERM_LABELS } from "@/components/AdminGate";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

type Seat = { name: string; role: string };
type M = {
  id: string; name: string; position: string; clubs: Seat[];
  perms: string[]; effective: string[]; groups: string[]; permsCustom: boolean;
};
type G = { groups: Record<string, string[]>; positions: string[]; clubRoles: string[]; canEdit: boolean };
type Note = { tone: "bad" | "info"; text: string } | null;

const PART = ["members", "events", "fees", "activities", "minutes", "board"];
const PART_TEXT: Record<string, string> = {
  members: "회원 명단, 원우회 설정, 회원 구분, 조직도",
  events: "행사 개요, 참석 신청, 일정, 카풀·방배정",
  fees: "회비 입금 확인, 비용과 예산",
  activities: "활동 진행, 조편성, 팀 구성",
  minutes: "회의록, 회칙",
  board: "게시글 쓰기, 게시글 양식",
};
const COLORS = ["#1CB0F6", "#FF9600", "#CE82FF", "#FF4B4B", "#58CC02", "#2B70C9"];
const colorOf = (s: string) => COLORS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];
const groupLabel = (k: string) => (k.startsWith("pos:") ? `직책 · ${k.slice(4)}` : `소모임 직책 · ${k.slice(5)}`);
const norm = (v: string[]) => (v.includes("all") ? ["all"] : [...new Set(v)].sort());

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

function Pills({ perms }: { perms: string[] }) {
  if (perms.length === 0) return <span className="small">권한 없음</span>;
  return <>{perms.map((p) => <span key={p} className={`pill ${p === "all" ? "ok" : "blue"}`}>{PERM_LABELS[p] ?? p}</span>)}</>;
}

// 위: 직책·소모임 직책별 그룹 권한 표
function GroupMatrix({ g, members, onSaved }: { g: G; members: M[]; onSaved: (t: string) => void }) {
  const rows = [...g.positions.map((p) => `pos:${p}`), ...g.clubRoles.map((r) => `club:${r}`)];
  const [draft, setDraft] = useState<Record<string, string[]>>(g.groups);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(g.groups), [g.groups]);

  const val = (k: string) => draft[k] ?? [];
  const dirty = rows.some((k) => norm(val(k)).join("|") !== norm(g.groups[k] ?? []).join("|"));
  const toggle = (k: string, p: string, on: boolean) => {
    const cur = val(k);
    const next = p === "all" ? (on ? ["all"] : []) : on ? [...cur, p] : cur.filter((x) => x !== p);
    setDraft({ ...draft, [k]: next });
  };

  async function save() {
    setBusy(true);
    setNote(null);
    // 목록에 없는 키는 보내지 않는다(목록에서 지운 직책의 권한은 정리된다).
    const groups = Object.fromEntries(rows.map((k) => [k, norm(val(k))]).filter(([, v]) => v.length));
    const r = await api("/api/admin/perm-groups", { method: "PUT", body: { groups } });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    onSaved("그룹 권한을 저장했어요. 바뀐 권한은 해당 회원이 다시 로그인하면 적용돼요.");
  }

  return (
    <section className="card" aria-label="그룹별 권한" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <b style={{ font: `400 ${fs(20)} var(--display)` }}>그룹별 권한</b>
      <span className="small">직책과 소모임 직책마다 권한을 정해요. 그 직책인 회원은 이 권한을 모두 받아요. 소모임 직책자는 그룹 권한이 없어도 게시글 작성은 할 수 있어요.</span>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <div className="tblw">
        <table className="tbl" style={{ minWidth: 760 }}>
          <thead>
            <tr><th>그룹</th><th>회원</th>{["all", ...PART].map((p) => <th key={p} style={{ textAlign: "center" }}>{PERM_LABELS[p]}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((k) => {
              const n = members.filter((m) => m.groups.includes(k)).length;
              const all = val(k).includes("all");
              return (
                <tr key={k}>
                  <td><b>{groupLabel(k)}</b></td>
                  <td className="num">{n}명</td>
                  {["all", ...PART].map((p) => (
                    <td key={p} style={{ textAlign: "center" }}>
                      <input type="checkbox" aria-label={`${groupLabel(k)} ${PERM_LABELS[p]}`} style={{ width: 20, height: 20 }}
                        disabled={!g.canEdit || busy || (p !== "all" && all)} checked={all || val(k).includes(p)}
                        onChange={(e) => toggle(k, p, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <span className="small">직책이 없어요. <Link href="/admin/kinds">회원 구분</Link>에서 먼저 직책을 더해 주세요.</span>}
      <span className="small">직책·소모임 직책 목록은 <Link href="/admin/kinds">회원 구분</Link>에서 바꿔요.</span>
      {g.canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: fs(17) }} disabled={busy || !dirty} onClick={save}>{busy ? "저장 중…" : "그룹 권한 저장"}</button>
          {dirty && <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: fs(17) }} disabled={busy} onClick={() => setDraft(g.groups)}>되돌리기</button>}
        </div>
      )}
    </section>
  );
}

function Admins() {
  const [g, setG] = useState<G | null>(null);
  const [list, setList] = useState<M[] | null>(null);
  const [myName, setMyName] = useState("");
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [perms, setPerms] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [pg, m, me] = await Promise.all([
      api<G>("/api/admin/perm-groups"),
      api<{ members: M[] }>("/api/admin/members"),
      api<{ name: string }>("/api/me"),
    ]);
    if (pg.ok) setG(pg.data);
    else setNote({ tone: "bad", text: pg.error });
    if (m.ok) setList(m.data.members);
    else setNote({ tone: "bad", text: m.error });
    if (me.ok) setMyName(me.data.name);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function setOwn(m: M, body: { perms: string[]; custom?: boolean } | { reset: true }, done: string) {
    setBusy(true);
    setNote(null);
    const r = await api(`/api/admin/members/${m.id}/perms`, { method: "PUT", body });
    setBusy(false);
    if (!r.ok) {
      setNote({ tone: "bad", text: r.error });
      return false;
    }
    setNote({ tone: "info", text: `${done} 바뀐 권한은 해당 회원이 다시 로그인하면 적용돼요.` });
    await load();
    return true;
  }

  const stopEdit = (id: string) => setEditing((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)));

  if (!g || !list) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const meAll = g.canEdit;
  const holders = list.filter((m) => m.effective.length > 0 || m.permsCustom);
  const others = list.filter((m) => !holders.includes(m));

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {!meAll && <div className="msg info">권한을 바꾸는 일은 “모든 권한” 관리자만 할 수 있어요. 지금은 볼 수만 있어요.</div>}
      <div className="msg info">바뀐 권한은 해당 회원이 다시 로그인하면 적용돼요.</div>

      <GroupMatrix g={g} members={list} onSaved={(t) => { setNote({ tone: "info", text: t }); load(); }} />

      <div className="adm-two">
        <section style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }} aria-label="권한 종류">
          <b style={{ font: `400 ${fs(20)} var(--display)` }}>권한 종류</b>
          <div className="card"><b>모든 권한</b><div className="small">회원관리, 행사관리, 소모임관리 전부와 권한 바꾸기</div></div>
          <div className="card">
            <b>부분 권한 (여러 개 선택)</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {PART.map((p) => <li key={p} className="small"><b style={{ color: "var(--ink)" }}>{PERM_LABELS[p]}</b> · {PART_TEXT[p]}</li>)}
            </ul>
          </div>
          <span className="small">
            최종 권한 = 속한 그룹(직책·소모임 직책)의 권한 + 개인 권한이에요. “개인 권한 확인·수정”으로 저장하면 그 회원은 그룹 권한 대신 개인 권한만 써요.
            권한이 있는 회원은 일반 회원과 같은 방법으로 로그인한 뒤 관리자 비밀번호를 한 번 더 입력해요. 모든 권한 회원은 한 명 이상 있어야 해요.
          </span>
        </section>

        <section className="card" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }} aria-label="권한자 리스트">
          <b style={{ font: `400 ${fs(20)} var(--display)` }}>권한자 리스트 <span className="num">{holders.length}명</span></b>
          {holders.map((m) => {
            const ed = editing[m.id];
            const roles = m.clubs.filter((c) => c.role).map((c) => `${c.name} ${c.role}`);
            return (
              <div key={m.id} className="adm1">
                <div className="row">
                  <span className="avatar" aria-hidden style={{ background: colorOf(m.name) }}>{m.name.slice(0, 1)}</span>
                  <span className="grow">{m.name}{m.position ? ` · ${m.position}` : ""}{m.name === myName ? <span className="small"> (나)</span> : null}</span>
                  <span className={`pill ${m.permsCustom ? "warn" : "gray"}`}>{m.permsCustom ? "개인 설정" : m.perms.length ? "그룹 + 개인" : "그룹"}</span>
                </div>
                <div style={{ paddingLeft: 44, display: "flex", flexDirection: "column", gap: 4 }}>
                  {roles.length > 0 && <span className="small">소모임 직책: {roles.join(", ")}</span>}
                  <span className="small">
                    속한 그룹: {m.groups.length ? m.groups.map((k) => `${groupLabel(k)}${(g.groups[k] ?? []).length ? "" : "(권한 없음)"}`).join(", ") : "없음"}
                    {m.permsCustom ? " · 그룹 권한은 쓰지 않아요" : ""}
                  </span>
                  <div className="row" style={{ flexWrap: "wrap", gap: 4 }}><Pills perms={m.effective} /></div>
                </div>
                {meAll && !ed && (
                  <div className="row" style={{ flexWrap: "wrap", paddingLeft: 44 }}>
                    <button className="mini" type="button" onClick={() => setEditing({ ...editing, [m.id]: m.effective })}>개인 권한 확인·수정</button>
                    {(m.permsCustom || m.perms.length > 0) && (
                      <button className="mini" type="button" disabled={busy} onClick={() => setOwn(m, { reset: true }, `${m.name} 님을 그룹 권한으로 되돌렸어요.`)}>그룹 권한으로 되돌리기</button>
                    )}
                  </div>
                )}
                {ed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 44 }}>
                    <span className="small">저장하면 그룹 권한과 상관없이 아래에서 고른 권한만 써요. 모두 끄고 저장하면 권한이 없어져요.</span>
                    <PermPicker idp={`e-${m.id}`} value={ed} disabled={busy} onChange={(v) => setEditing({ ...editing, [m.id]: v })} />
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <button className="mini" type="button" disabled={busy} onClick={async () => {
                        if (ed.length === 0 && !window.confirm(`${m.name} 님의 권한을 모두 없앨까요? 그룹 권한도 쓰지 않게 돼요.`)) return;
                        if (await setOwn(m, { perms: norm(ed) }, `${m.name} 님의 개인 권한을 저장했어요.`)) stopEdit(m.id);
                      }}>개인 권한으로 저장</button>
                      <button className="mini" type="button" onClick={() => stopEdit(m.id)}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {holders.length === 0 && <span className="small">권한이 있는 회원이 없어요.</span>}

          {meAll && !adding && (
            <button className="btn white" type="button" style={{ minHeight: 48, fontSize: fs(18) }} onClick={() => { setAdding(true); setPick(""); setPerms([]); }}>
              + 회원에게 개인 권한 주기
            </button>
          )}
          {meAll && adding && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
              <b>개인 권한 주기</b>
              <div>
                <label className="l" htmlFor="ad-m">회원 고르기</label>
                <select id="ad-m" className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">회원을 골라 주세요</option>
                  {others.map((m) => <option key={m.id} value={m.id}>{m.name}{m.position ? ` · ${m.position}` : ""}</option>)}
                </select>
              </div>
              <div><span className="l">권한</span><PermPicker idp="add" value={perms} disabled={busy} onChange={setPerms} /></div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: fs(17) }} disabled={busy || !pick || perms.length === 0}
                  onClick={async () => {
                    const m = others.find((x) => x.id === pick);
                    if (m && (await setOwn(m, { perms: norm(perms), custom: false }, `${m.name} 님에게 권한을 줬어요.`))) setAdding(false);
                  }}>추가</button>
                <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: fs(17) }} onClick={() => setAdding(false)}>취소</button>
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
