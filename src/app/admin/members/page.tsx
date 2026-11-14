"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate, PERM_LABELS } from "@/components/AdminGate";
import { DateField } from "@/components/DateField";
import { Popup } from "@/components/Popup";
import { api, fmtDate } from "@/lib/client";
import { parseMembers } from "@/lib/member-import";
import { fs } from "@/lib/fs";

type M = {
  id: string; no: string; name: string; kind: string; position: string; gender: string;
  company: string; title: string; birth: string; phone: string; ageGroup: string; perms: string[];
  clubs: Seat[]; // 소모임 [{name, role}] (role 이 비면 일반 회원)
  effective: string[]; // 최종 권한(그룹 ∪ 개인)
  fields: Record<string, string>; // 관리자가 만든 추가 항목(열)의 값
  genderEdit?: { from: string; to: string; at: string } | null; // 회원이 직접 바꾼 성별 기록
};
type Seat = { name: string; role: string };
type Lists = { memberKinds: { value: string; definition: string }[]; positions: string[]; clubs: string[]; clubRoles: string[] };
type Form = {
  name: string; kind: string; position: string; gender: string; company: string; title: string;
  birth: string; phone: string; ageGroup: string; clubs: Seat[]; fields: Record<string, string>;
};

const EMPTY: Form = {
  name: "", kind: "", position: "", gender: "", company: "", title: "", birth: "", phone: "", ageGroup: "", clubs: [], fields: {},
};
const OFF = " (목록에 없음)";
const clubsText = (c: Seat[]) => c.map((x) => (x.role ? `${x.name}(${x.role})` : x.name)).join(", ");

// 목록에서 고르는 칸. 지금 값이 목록에 없으면 "(목록에 없음)" 으로 함께 보여 준다.
function ListSelect({ id, value, options, onChange, label }: { id?: string; value: string; options: string[]; onChange: (v: string) => void; label?: string }) {
  return (
    <select id={id} aria-label={label} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택 안 함</option>
      {value && !options.includes(value) && <option value={value}>{value}{OFF}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// 소모임 고르기: 소모임마다 체크하고, 고른 소모임은 소모임 직책을 정한다(비우면 일반 회원).
function ClubsPicker({ value, clubs, roles, onChange }: { value: Seat[]; clubs: string[]; roles: string[]; onChange: (v: Seat[]) => void }) {
  const names = [...clubs, ...value.map((c) => c.name).filter((n) => !clubs.includes(n))];
  if (names.length === 0) return <span className="small">소모임이 없어요. <Link href="/admin/kinds">회원 구분</Link>에서 먼저 소모임을 더해 주세요.</span>;
  return (
    <div className="checks" role="group" aria-label="소모임">
      {names.map((n, i) => {
        const seat = value.find((c) => c.name === n);
        return (
          <label key={n} htmlFor={`f-club-${i}`} style={{ flexWrap: "wrap" }}>
            <input id={`f-club-${i}`} type="checkbox" checked={!!seat}
              onChange={(e) => onChange(e.target.checked ? [...value, { name: n, role: "" }] : value.filter((c) => c.name !== n))} />
            {n}{clubs.includes(n) ? "" : OFF}
            {seat && (
              <select aria-label={`${n} 소모임 직책`} value={seat.role} style={{ minHeight: 32, borderRadius: 8, border: "2px solid var(--line)", fontSize: fs(15) }}
                onChange={(e) => onChange(value.map((c) => (c.name === n ? { ...c, role: e.target.value } : c)))}>
                <option value="">일반 회원</option>
                {seat.role && !roles.includes(seat.role) && <option value={seat.role}>{seat.role}{OFF}</option>}
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </label>
        );
      })}
    </div>
  );
}

// 붙여 넣은 명단의 머리글에 추가 항목 이름이 있으면, 성명별로 그 열의 값을 모은다.
// (기본 항목은 member-import 가 읽고, 추가 항목만 여기서 따로 읽는다)
function customFromImport(text: string, fields: string[]): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2 || fields.length === 0) return out;
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string) => {
    const cells: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { cells.push(cur.trim()); cur = ""; } else cur += c;
    }
    cells.push(cur.trim());
    return cells;
  };
  const head = split(lines[0]).map((h) => h.replace(/\s/g, ""));
  const nameCol = head.findIndex((h) => h === "성명" || h === "이름");
  const cols = fields.map((f) => [f, head.indexOf(f.replace(/\s/g, ""))] as const).filter(([, i]) => i >= 0);
  if (nameCol < 0 || cols.length === 0) return out;
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const name = cells[nameCol];
    if (!name) continue;
    const v: Record<string, string> = {};
    for (const [f, i] of cols) if (cells[i]) v[f] = cells[i].slice(0, 200);
    out.set(name, v);
  }
  return out;
}

function Members() {
  const [list, setList] = useState<M[] | null>(null);
  const [lists, setLists] = useState<Lists>({ memberKinds: [], positions: [], clubs: [], clubRoles: [] });
  const kinds = lists.memberKinds;
  const [form, setForm] = useState<Form>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  // 회원 추가·수정 창
  const [formOpen, setFormOpen] = useState(false);
  const [formOrig, setFormOrig] = useState("");
  const [formErr, setFormErr] = useState("");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("전체");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const preview = useMemo(() => parseMembers(importText), [importText]);
  const [custom, setCustom] = useState<string[]>([]);
  const [colsOpen, setColsOpen] = useState(false);
  const [colsDraft, setColsDraft] = useState<string[]>([]);
  const [newCol, setNewCol] = useState("");
  const importCustom = useMemo(() => customFromImport(importText, custom), [importText, custom]);

  async function saveCols(next: string[]) {
    const r = await api<{ fields: string[] }>("/api/admin/members/fields", { method: "PUT", body: { fields: next } });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setCustom(r.data.fields);
    setColsDraft(r.data.fields);
    setMsg({ tone: "info", text: "항목을 저장했어요." });
  }

  async function importAll() {
    setBusy(true);
    setMsg(null);
    const rows = preview.rows.map((r) => ({ ...r, fields: importCustom.get(r.name) ?? {} }));
    const r = await api<{ added: number; skipped: string[] }>("/api/admin/members/bulk", { body: { rows } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    const sk = r.data.skipped;
    setMsg({ tone: "info", text: `${r.data.added}명을 추가했어요.${sk.length ? ` 이미 있는 ${sk.length}명(${sk.slice(0, 5).join(", ")}${sk.length > 5 ? " 외" : ""})은 건너뛰었어요.` : ""}` });
    setImportText("");
    setImportOpen(false);
    load();
  }

  const load = useCallback(async () => {
    const [m, s, f] = await Promise.all([
      api<{ members: M[] }>("/api/admin/members"),
      api<Lists>("/api/admin/lists"),
      api<{ fields: string[] }>("/api/admin/members/fields"),
    ]);
    if (f.ok) {
      setCustom(f.data.fields);
      setColsDraft(f.data.fields);
    }
    if (m.ok) setList(m.data.members.map((x) => ({ ...x, fields: x.fields ?? {} })));
    else setMsg({ tone: "bad", text: m.error });
    if (s.ok) setLists(s.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function startEdit(m: M) {
    const f: Form = {
      name: m.name, kind: m.kind ?? "", position: m.position ?? "", gender: m.gender ?? "", company: m.company ?? "", title: m.title ?? "",
      birth: m.birth ?? "", phone: m.phone ?? "", ageGroup: m.ageGroup ?? "", clubs: m.clubs ?? [], fields: m.fields ?? {},
    };
    setEditId(m.id);
    setForm(f);
    setFormOrig(JSON.stringify(f));
    setFormErr("");
    setMsg(null);
    setFormOpen(true);
  }
  function startAdd() {
    setEditId(null);
    setForm(EMPTY);
    setFormOrig(JSON.stringify(EMPTY));
    setFormErr("");
    setFormOpen(true);
  }
  function reset() {
    setFormOpen(false);
    setEditId(null);
    setForm(EMPTY);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormErr("");
    const r = editId
      ? await api(`/api/admin/members/${editId}`, { method: "PATCH", body: form })
      : await api("/api/admin/members", { body: form });
    setBusy(false);
    if (!r.ok) return setFormErr(r.error);
    setMsg({ tone: "info", text: editId ? "저장했어요." : "회원을 추가했어요." });
    reset();
    load();
  }

  // 회원이 직접 바꾼 성별을 확인했다(표시만 지우고 값은 그대로 둔다).
  async function ackGender(m: M) {
    const r = await api(`/api/admin/members/${m.id}/gender-ack`, { body: {} });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: `${m.name} 님의 성별 변경을 확인했어요.` });
    load();
  }

  async function remove(m: M) {
    if (!window.confirm(`${m.name} 님을 명단에서 지울까요?`)) return;
    const r = await api(`/api/admin/members/${m.id}`, { method: "DELETE" });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "지웠어요." });
    load();
  }

  const counts = new Map<string, number>();
  list?.forEach((m) => counts.set(m.kind || "미지정", (counts.get(m.kind || "미지정") ?? 0) + 1));
  const shown = list?.filter((m) => filter === "전체" || (m.kind || "미지정") === filter) ?? [];
  const admins = list?.filter((m) => m.effective.length > 0) ?? [];
  const kindTabs = [...kinds.map((k) => k.value), ...[...counts.keys()].filter((k) => k !== "미지정" && !kinds.some((x) => x.value === k))];

  return (
    <>
      <p className="small" style={{ margin: 0 }}>회원정보(회사·연락처·생년월일)는 관리자에게만 보이고 일반 회원에게는 노출되지 않아요.</p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {list && list.some((m) => m.genderEdit) && (
        <div className="msg info" role="status">
          회원이 직접 성별을 바꾼 회원이 {list.filter((m) => m.genderEdit).length}명 있어요({list.filter((m) => m.genderEdit).map((m) => m.name).join(", ")}). 명단의 “회원 수정” 표시를 보고 “확인”을 눌러 주세요.
        </div>
      )}

      {/* 요약: 한 줄로 간단히 */}
      {list && (
        <div className="row" role="group" aria-label="회원 요약" style={{ flexWrap: "wrap", gap: 6 }}>
          <span className="pill blue">전체 {list.length}명</span>
          {[...counts.entries()].map(([k, n]) => <span key={k} className="pill gray">{k} {n}</span>)}
          <span className="pill gray">남 {list.filter((m) => m.gender === "남").length} · 여 {list.filter((m) => m.gender === "여").length}{list.some((m) => !m.gender) ? ` · 미입력 ${list.filter((m) => !m.gender).length}` : ""}</span>
          <Link href="/admin/admins" className="pill gray" style={{ textDecoration: "none" }}>권한자 {admins.length} ›</Link>
        </div>
      )}

      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="mini" type="button" aria-expanded={importOpen} onClick={() => setImportOpen(!importOpen)}>{importOpen ? "붙여넣기 닫기" : "명단 붙여넣기 (CSV·엑셀)"}</button>
        <button className="mini" type="button" aria-haspopup="dialog" onClick={startAdd}>+ 회원 추가</button>
        <button className="mini" type="button" aria-expanded={colsOpen} onClick={() => { setColsOpen(!colsOpen); setColsDraft(custom); }}>+ 항목 추가</button>
      </div>

      {colsOpen && (
        <section className="card" aria-label="항목 추가" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: `400 ${fs(20)} var(--display)` }}>항목 추가</b>
          <span className="small">기본 항목 외에 필요한 항목(예: 기수, 이메일, 차량 여부)을 더할 수 있어요. 회원 입력 칸과 명단 표에 함께 보이고, 붙여넣기 머리글에 같은 이름이 있으면 그 값도 읽어요. 항목을 지워도 이미 적은 값은 남아 있어서 다시 만들면 보여요.</span>
          <div className="checks" aria-label="추가 항목">
            {colsDraft.map((c) => (
              <label key={c}>{c}<button type="button" className="mini danger" style={{ minHeight: 28, padding: "0 8px" }} aria-label={`${c} 항목 빼기`} onClick={() => setColsDraft(colsDraft.filter((x) => x !== c))}>×</button></label>
            ))}
            {colsDraft.length === 0 && <span className="small">추가한 항목이 없어요</span>}
          </div>
          <form className="row" style={{ flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); const v = newCol.trim(); if (v && !colsDraft.includes(v)) setColsDraft([...colsDraft, v]); setNewCol(""); }}>
            <input aria-label="새 항목 이름" className="field" style={{ flex: "1 1 200px", width: "auto", minHeight: 46 }} maxLength={20} placeholder="새 항목 이름" value={newCol} onChange={(e) => setNewCol(e.target.value)} />
            <button className="mini" type="submit" disabled={!newCol.trim()}>+ 항목 더하기</button>
          </form>
          <div className="row">
            <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: fs(17) }} disabled={JSON.stringify(colsDraft) === JSON.stringify(custom)} onClick={() => saveCols(colsDraft)}>항목 저장</button>
            <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: fs(17) }} onClick={() => setColsOpen(false)}>닫기</button>
          </div>
        </section>
      )}

      {importOpen && (
        <section className="card" aria-label="명단 붙여넣기" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: `400 ${fs(20)} var(--display)` }}>명단 한 번에 넣기</b>
          <span className="small">
            엑셀이나 구글 시트에서 표를 복사해 붙여 넣거나, CSV 내용을 붙여 넣으세요. 첫 줄에 머리글(성명, 회원구분, 직책, 성별, 회사명, 직위, 생년월일, 연락처, 연령대)이 있으면 그 순서를 따르고,
            없으면 이 순서로 읽어요. 이미 있는 이름은 건너뛰고, 관리자 권한은 여기서 줄 수 없어요.
          </span>
          <label className="l" htmlFor="imp">붙여 넣을 명단</label>
          <textarea id="imp" className="field" rows={6} style={{ padding: 12, fontFamily: "inherit" }} value={importText}
            placeholder={"성명,회원구분,직책,성별,회사명,직위,생년월일,연락처\n김하늘,정회원,회장,여,예시상사,대표,1970-01-01,010-0000-0001"}
            onChange={(e) => setImportText(e.target.value)} />
          {preview.rows.length > 0 && (
            <>
              {importCustom.size > 0 && <span className="small">추가 항목({custom.filter((c) => [...importCustom.values()].some((v) => c in v)).join(", ")}) 값도 함께 넣어요.</span>}
              <span className="small">{preview.rows.length}명을 읽었어요{preview.rows.filter((r) => list?.some((m) => m.name === r.name)).length ? ` · 그중 ${preview.rows.filter((r) => list?.some((m) => m.name === r.name)).length}명은 이미 있어서 건너뛰어요` : ""}. 앞의 5명:</span>
              <div className="tblw">
                <table className="tbl" style={{ minWidth: 760 }}>
                  <thead><tr><th>성명</th><th>구분</th><th>직책</th><th>성별</th><th>회사명</th><th>직위</th><th>생년월일</th><th>연락처</th></tr></thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}><td><b>{r.name}</b></td><td>{r.kind}</td><td>{r.position}</td><td>{r.gender}</td><td>{r.company}</td><td>{r.title}</td><td className="num">{fmtDate(r.birth)}</td><td className="num">{r.phone}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {preview.problems.length > 0 && <div className="msg info">{preview.problems.slice(0, 5).join(" ")}{preview.problems.length > 5 ? ` 외 ${preview.problems.length - 5}건` : ""}</div>}
          <button className="btn" type="button" style={{ width: "auto", minWidth: 180, alignSelf: "flex-start" }} disabled={busy || preview.rows.length === 0} onClick={importAll}>
            {preview.rows.length ? `${preview.rows.length}명 추가하기` : "추가하기"}
          </button>
        </section>
      )}

      <Popup id="member-form" width={760} title={editId ? "회원 수정" : "회원 추가"} open={formOpen} onClose={reset} dirty={JSON.stringify(form) !== formOrig}>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {formErr && <div className="msg bad" role="alert">{formErr}</div>}
        <div className="grid2">
          <div><label className="l" htmlFor="f-name">성명</label><input id="f-name" className="field" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div>
            <label className="l" htmlFor="f-kind">회원구분</label>
            <ListSelect id="f-kind" value={form.kind} options={kinds.map((k) => k.value)} onChange={(v) => set("kind", v)} />
          </div>
          <div>
            <label className="l" htmlFor="f-pos">원우회 직책</label>
            <ListSelect id="f-pos" value={form.position} options={lists.positions} onChange={(v) => set("position", v)} />
          </div>
          <div>
            <label className="l" htmlFor="f-gender">성별</label>
            <select id="f-gender" className="field" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">선택 안 함</option><option>남</option><option>여</option>
            </select>
          </div>
          <div><label className="l" htmlFor="f-co">회사명</label><input id="f-co" className="field" value={form.company} onChange={(e) => set("company", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-ti">직위</label><input id="f-ti" className="field" value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-birth">생년월일</label><DateField id="f-birth" mode="date" value={form.birth} onChange={(v) => set("birth", v)} /></div>
          <div><label className="l" htmlFor="f-phone">연락처</label><input id="f-phone" className="field" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-age">연령대 (팀 구성에 사용)</label><input id="f-age" className="field" placeholder="50대" value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} /></div>
          {custom.map((c, i) => (
            <div key={c}><label className="l" htmlFor={`f-x${i}`}>{c}</label><input id={`f-x${i}`} className="field" maxLength={200} value={form.fields[c] ?? ""} onChange={(e) => set("fields", { ...form.fields, [c]: e.target.value })} /></div>
          ))}
        </div>
        <div>
          <span className="l">소모임 (고른 소모임마다 소모임 직책을 정해요)</span>
          <ClubsPicker value={form.clubs} clubs={lists.clubs} roles={lists.clubRoles} onChange={(v) => set("clubs", v)} />
        </div>
        <span className="small">관리자 권한은 직책·소모임 직책에 따라 정해져요. 개인 권한은 <Link href="/admin/admins">권한설정</Link>에서 바꿔요.</span>
        <div className="row">
          <button className="btn" type="submit" disabled={busy || !form.name.trim()} style={{ width: "auto", minWidth: 160 }}>{editId ? "저장" : "추가"}</button>
          <button className="btn white" type="button" style={{ width: "auto", minWidth: 120 }} onClick={reset}>취소</button>
        </div>
      </form>
      </Popup>

      <div className="subnav" aria-label="회원구분 보기">
        {["전체", ...kindTabs, "미지정"].map((k) => (
          <a key={k} className={filter === k ? "on" : ""} href="#" onClick={(e) => { e.preventDefault(); setFilter(k); }}>{k}</a>
        ))}
      </div>

      {!list && <p className="small">불러오는 중이에요…</p>}
      {list && shown.length === 0 && <div className="msg info">해당하는 회원이 없어요.</div>}
      {shown.length > 0 && (
        <div className="tblw">
          <table className="tbl" style={{ minWidth: 1000 + custom.length * 110 }}>
            <thead><tr><th>NO</th><th>성명</th><th>구분</th><th>직책</th><th>소모임</th><th>성별</th><th>회사명</th><th>직위</th><th>생년월일</th><th>연락처</th>{custom.map((c) => <th key={c}>{c}</th>)}<th>권한</th><th></th></tr></thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td className="num">{m.no}</td><td><b>{m.name}</b></td>
                  <td>{m.kind}{m.kind && !kinds.some((k) => k.value === m.kind) && <span className="small">{OFF}</span>}</td>
                  <td>{m.position}{m.position && !lists.positions.includes(m.position) && <span className="small">{OFF}</span>}</td>
                  <td>{clubsText(m.clubs ?? [])}</td>
                  <td>
                    {m.gender}
                    {m.genderEdit && (
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 6, flexWrap: "wrap" }}>
                        <span className="pill warn" title="회원이 설정에서 직접 바꾼 성별이에요">
                          회원 수정 ({m.genderEdit.from || "없음"}→{m.genderEdit.to}, {fmtDate(m.genderEdit.at)})
                        </span>
                        <button className="mini" type="button" style={{ minHeight: 32 }} onClick={() => ackGender(m)}>확인</button>
                      </span>
                    )}
                  </td>
                  <td>{m.company}</td><td>{m.title}</td><td className="num">{fmtDate(m.birth)}</td><td className="num">{m.phone}</td>
                  {custom.map((c) => <td key={c}>{m.fields[c] ?? ""}</td>)}
                  <td>{(m.effective ?? []).map((p) => <span key={p} className={`pill ${p === "all" ? "ok" : "blue"}`} style={{ marginRight: 4 }}>{PERM_LABELS[p] ?? p}</span>)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="mini" type="button" onClick={() => startEdit(m)}>수정</button>{" "}
                    <button className="mini danger" type="button" onClick={() => remove(m)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function MembersPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/members"><Members /></AdminGate>;
}
