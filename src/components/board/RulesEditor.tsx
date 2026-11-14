"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateTime } from "@/lib/client";
import { Popup } from "../Popup";
import { fs } from "@/lib/fs";

// 회칙 조문 편집(예전 관리자 > 회칙 탭에서 옮겨 옴). 조문마다 "저장"을 누르면 바로 반영되고 변경 기록이 남는다.
// "확정"으로 표시한 조문만 회원의 회칙 글에 보인다. 전체 관리자만 쓸 수 있다(/api/admin/club/rules).
type Note = { tone: "bad" | "info"; text: string } | null;
type RuleLog = { at: string; by: string; what: string; before?: string };
type Rule = { id: string; chapter: string; article: string; body: string; version: string; confirmed: boolean; history?: RuleLog[] };
type Parsed = { chapter: string; article: string; body: string };

const Msg = ({ n }: { n: Note }) => (n ? <div className={`msg ${n.tone}`} role={n.tone === "bad" ? "alert" : "status"}>{n.text}</div> : null);

// 붙여 넣은 회칙 글을 조문으로 나눈다. “제N장”(“제N절”) 줄은 장, “제N조” 줄은 조 제목, 그 아래는 내용이다.
export function splitRules(text: string): { rows: Parsed[]; skipped: number } {
  const rows: Parsed[] = [];
  let chapter = "";
  let section = "";
  let skipped = 0;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      const last = rows[rows.length - 1];
      if (last && last.body) last.body += "\n";
      continue;
    }
    if (/^제\s*\d+\s*장/.test(line)) { chapter = line; section = ""; continue; }
    if (/^제\s*\d+\s*절/.test(line)) { section = line; continue; }
    const m = line.match(/^(제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:\([^)]*\)|（[^）]*）)?)\s*(.*)$/);
    if (m) {
      const ch = (section ? `${chapter} · ${section}` : chapter) || "기타";
      rows.push({ chapter: ch.slice(0, 60), article: m[1].trim().slice(0, 60), body: m[2] ?? "" });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last) last.body = last.body ? `${last.body.replace(/\n+$/, "")}\n${line}` : line;
    else skipped++;
  }
  rows.forEach((r) => (r.body = r.body.trim().slice(0, 4000)));
  return { rows, skipped };
}

function RulesPaste({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const { rows, skipped } = splitRules(text);

  function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => setText(String(fr.result ?? ""));
    fr.onerror = () => setNote({ tone: "bad", text: "파일을 읽지 못했어요. 텍스트(.txt) 파일인지 확인해 주세요." });
    fr.readAsText(f, "utf-8");
    e.target.value = "";
  }

  async function addAll() {
    setBusy(true);
    setNote(null);
    let ok = 0;
    for (const r of rows) {
      const res = await api("/api/admin/club/rules", { body: { ...r, version: "v1", confirmed: false } });
      if (!res.ok) {
        setBusy(false);
        setNote({ tone: "bad", text: `${ok}개를 넣고 “${r.article}”에서 멈췄어요. ${res.error}` });
        onDone();
        return;
      }
      ok++;
    }
    setBusy(false);
    setText("");
    setNote({ tone: "info", text: `조문 ${ok}개를 추가했어요. 확인한 뒤 “확정”으로 표시해 주세요.` });
    onDone();
  }

  return (
    <section className="card" aria-label="회칙 붙여넣기" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `400 ${fs(19)} var(--display)` }}>회칙 붙여넣기</b>
      <span className="small">회칙 글을 통째로 붙여 넣거나 텍스트(.txt) 파일을 고르세요. “제1장”으로 시작하는 줄은 장, “제1조”로 시작하는 줄은 조로 나눠요.</span>
      <Msg n={note} />
      <label className="l" htmlFor="rp-file">텍스트 파일 고르기 (선택)</label>
      <input id="rp-file" type="file" accept=".txt,text/plain" onChange={readFile} />
      <label className="l" htmlFor="rp-text">회칙 글</label>
      <textarea id="rp-text" className="field" rows={8} style={{ padding: 12 }} value={text} placeholder={"제1장 총칙\n제1조 (명칭) 본 회는 ○○ 원우회라 한다.\n제2조 (목적) …"} onChange={(e) => setText(e.target.value)} />
      {rows.length > 0 && (
        <>
          <span className="small">조문 {rows.length}개로 나눴어요{skipped ? ` · 첫 조 앞의 ${skipped}줄은 넣지 않아요` : ""}. 미리 보기:</span>
          <div className="tblw" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="tbl" style={{ minWidth: 520 }}>
              <thead><tr><th>장</th><th>조</th><th>내용</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}><td>{r.chapter}</td><td><b>{r.article}</b></td><td className="small" style={{ whiteSpace: "pre-wrap" }}>{r.body.length > 120 ? `${r.body.slice(0, 120)}…` : r.body || "(내용 없음)"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {text.trim() && rows.length === 0 && <div className="msg info">“제1조”처럼 시작하는 줄을 찾지 못했어요.</div>}
      <button className="btn" type="button" disabled={busy || rows.length === 0} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(17) }} onClick={addAll}>
        {busy ? "추가하는 중…" : rows.length ? `조문 ${rows.length}개 추가` : "추가"}
      </button>
    </section>
  );
}

export function RulesEditor() {
  const [items, setItems] = useState<Rule[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [add, setAdd] = useState({ chapter: "", article: "", body: "", version: "v1", confirmed: false });
  const [paste, setPaste] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ items: Rule[] }>("/api/admin/club/rules");
    if (r.ok) setItems(r.data.items);
    else setNote({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const upd = (id: string, patch: Partial<Rule>) => setItems((l) => l && l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function create() {
    setErr("");
    const r = await api("/api/admin/club/rules", { body: add });
    if (!r.ok) return setErr(r.error);
    setNote({ tone: "info", text: "조문을 추가했어요." });
    setAdd({ chapter: "", article: "", body: "", version: "v1", confirmed: false });
    setOpen(false);
    load();
  }
  async function save(x: Rule) {
    const r = await api(`/api/admin/club/rules/${x.id}`, { method: "PATCH", body: { chapter: x.chapter, article: x.article, body: x.body, version: x.version, confirmed: x.confirmed } });
    setNote(r.ok ? { tone: "info", text: `“${x.article || x.chapter}”을 저장했어요.` } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(x: Rule) {
    if (!window.confirm(`“${x.article || x.chapter}” 조문을 지울까요?`)) return;
    const r = await api(`/api/admin/club/rules/${x.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  return (
    <section aria-label="회칙 조문 편집" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `400 ${fs(20)} var(--display)` }}>회칙 조문</b>
      <span className="small">조문마다 “저장”을 누르면 바로 반영돼요(글 저장과 따로예요). “확정”으로 표시한 조문만 회원에게 보여요. 저장할 때마다 변경 기록이 남아요.</span>
      <Msg n={note} />
      <div className="row"><button className="mini" type="button" aria-expanded={paste} onClick={() => setPaste(!paste)}>{paste ? "붙여넣기 닫기" : "회칙 붙여넣기 · 파일"}</button></div>
      {paste && <RulesPaste onDone={load} />}
      {!items && <p className="small">불러오는 중이에요…</p>}
      {items?.map((r) => (
        <div key={r.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="grid2">
            <div><label className="l" htmlFor={`rc-${r.id}`}>장</label><input id={`rc-${r.id}`} className="field" value={r.chapter} onChange={(e) => upd(r.id, { chapter: e.target.value })} /></div>
            <div><label className="l" htmlFor={`ra-${r.id}`}>조</label><input id={`ra-${r.id}`} className="field" value={r.article} onChange={(e) => upd(r.id, { article: e.target.value })} /></div>
          </div>
          <label className="l" htmlFor={`rb-${r.id}`}>내용</label>
          <textarea id={`rb-${r.id}`} className="field" rows={4} style={{ padding: 12 }} value={r.body} onChange={(e) => upd(r.id, { body: e.target.value })} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input aria-label="버전" className="field" style={{ width: 90, minHeight: 42 }} value={r.version} onChange={(e) => upd(r.id, { version: e.target.value })} />
            <div className="checks"><label><input type="checkbox" checked={r.confirmed} onChange={(e) => upd(r.id, { confirmed: e.target.checked })} />확정</label></div>
            <button className="mini" type="button" onClick={() => save(r)}>저장</button>
            <button className="mini danger" type="button" onClick={() => remove(r)}>삭제</button>
          </div>
          {r.history && r.history.length > 0 && (
            <details>
              <summary className="small" style={{ cursor: "pointer" }}>변경 기록 {r.history.length}건 · 최근 {fmtDateTime(r.history[0].at)} {r.history[0].by}</summary>
              <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                {r.history.map((h, i) => (
                  <li key={i} className="small">
                    <b>{fmtDateTime(h.at)}</b> · {h.by} · {h.what}
                    {h.before !== undefined && (
                      <details><summary style={{ cursor: "pointer" }}>바꾸기 전 내용</summary><p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{h.before || "(비어 있음)"}</p></details>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      ))}
      <button className="btn white" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(17) }} onClick={() => { setErr(""); setOpen(true); }}>+ 조문 추가</button>
      <Popup id="rule-new" width={640} title="조문 추가" open={open} onClose={() => setOpen(false)} dirty={!!(add.chapter.trim() || add.article.trim() || add.body.trim())}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div className="msg bad" role="alert">{err}</div>}
        <div className="grid2">
          <div><label className="l" htmlFor="rn-c">장 (예: 제1장 총칙)</label><input id="rn-c" className="field" value={add.chapter} onChange={(e) => setAdd({ ...add, chapter: e.target.value })} /></div>
          <div><label className="l" htmlFor="rn-a">조 (예: 제1조 (명칭))</label><input id="rn-a" className="field" value={add.article} onChange={(e) => setAdd({ ...add, article: e.target.value })} /></div>
        </div>
        <label className="l" htmlFor="rn-b">내용</label>
        <textarea id="rn-b" className="field" rows={4} style={{ padding: 12 }} value={add.body} onChange={(e) => setAdd({ ...add, body: e.target.value })} />
        <span className="small">추가한 조문은 “확정”으로 표시해야 회원에게 보여요.</span>
        <button className="btn" type="button" disabled={!add.chapter.trim()} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(17) }} onClick={create}>조문 추가</button>
      </div>
      </Popup>
    </section>
  );
}
