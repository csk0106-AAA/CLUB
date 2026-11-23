"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateTime } from "@/lib/client";
import { Popup } from "../Popup";
import { fs } from "@/lib/fs";

// 회칙 조문 편집(관리자 › 모임설정 › 회칙 화면). 조문마다 "저장"을 누르면 바로 반영되고 변경 기록이 남는다.
// 조문마다 "공개"(기본 체크). 공개 조문만 회칙 글에 들어간다. 고치면 "저장"이 켜지고, 저장한 뒤 "게시글 업로드"로 올려야 회원 글에 반영된다. 전체 관리자만 쓸 수 있다(/api/admin/club/rules).
type Note = { tone: "bad" | "info"; text: string } | null;
type RuleLog = { at: string; by: string; what: string; before?: string };
type Rule = { id: string; chapter: string; article: string; body: string; version: string; public: boolean; history?: RuleLog[] };
type Parsed = { chapter: string; article: string; body: string };

const Msg = ({ n }: { n: Note }) => (n ? <div className={`msg ${n.tone}`} role={n.tone === "bad" ? "alert" : "status"}>{n.text}</div> : null);

// 붙여 넣은 회칙 글을 조문으로 나눈다. “제N장”(“제N절”) 줄은 장, “제N조” 줄은 조 제목, 그 아래는 내용이다.
export function splitRules(text: string): { rows: Parsed[]; skipped: number } {
  const rows: Parsed[] = [];
  let chapter = "";
  let section = "";
  let skipped = 0;
  // 구글 시트·엑셀에서 복사한 글: 칸 사이는 탭, 칸 안에서 줄을 바꾼 글은 "…"로 감싸지고 글 속 따옴표는 ""로 들어온다.
  // 탭은 공백으로, 감싼 따옴표는 떼고, ""는 "로 되돌린다.
  let inCell = false;
  // 부칙 바로 아래에 조 번호 없는 문장이 오면 "부칙" 조문 하나로 만든다(앞 조문 내용에 붙지 않게)
  let addendum = false;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    let line = raw.replace(/\t+/g, " ").trim();
    if (!inCell && line.startsWith('"') && !line.startsWith('""')) { inCell = true; line = line.slice(1); }
    if (inCell && line.endsWith('"') && !line.endsWith('""')) { inCell = false; line = line.slice(0, -1); }
    line = line.replace(/""/g, '"').trim();
    if (!line) {
      const last = rows[rows.length - 1];
      if (last && last.body) last.body += "\n";
      continue;
    }
    if (/^제\s*\d+\s*장/.test(line)) { chapter = line; section = ""; addendum = false; continue; }
    // "부칙"(부 칙 · 附則, 뒤에 날짜·괄호가 붙어도)은 따로 장으로 묶는다(앞 조문 내용에 붙거나 마지막 장에 섞이지 않게)
    if (/^(부\s*칙|附\s*則)(\s*[(（<〈［\[].*)?$/.test(line)) { chapter = line; section = ""; addendum = true; continue; }
    if (/^제\s*\d+\s*절/.test(line)) { section = line; continue; }
    const m = line.match(/^(제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:\([^)]*\)|（[^）]*）)?)\s*(.*)$/);
    if (m) {
      const ch = (section ? `${chapter} · ${section}` : chapter) || "기타";
      rows.push({ chapter: ch.slice(0, 60), article: m[1].trim().slice(0, 60), body: m[2] ?? "" });
      addendum = false; // 부칙에 조 번호가 있으면 보통 조문처럼
      continue;
    }
    if (addendum) {
      rows.push({ chapter: chapter.slice(0, 60), article: "부칙", body: line });
      addendum = false;
      continue;
    }
    const last = rows[rows.length - 1];
    if (last) last.body = last.body ? `${last.body.replace(/\n+$/, "")}\n${line}` : line;
    else skipped++;
  }
  rows.forEach((r) => (r.body = r.body.trim().slice(0, 4000)));
  return { rows, skipped };
}

// 회칙 내려받기: 저장된 조문(고치는 중인 내용은 빼고)을 장별로 묶어 워드(.doc) 또는 텍스트(.txt) 파일로 만든다.
//  텍스트 파일은 "회칙 붙여넣기 · 파일"로 그대로 다시 넣을 수 있는 모양이다.
function rulesFile(rules: Rule[], kind: "doc" | "txt") {
  const groups: { chapter: string; rows: Rule[] }[] = [];
  for (const r of rules) {
    const last = groups[groups.length - 1];
    if (last && last.chapter === r.chapter) last.rows.push(r);
    else groups.push({ chapter: r.chapter, rows: [r] });
  }
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const name = `회칙_${day}.${kind}`;
  let blob: Blob;
  const BOM = String.fromCharCode(0xfeff); // 메모장·워드에서 한글이 깨지지 않게
  if (kind === "txt") {
    const text = groups.map((g) => [g.chapter, ...g.rows.map((r) => [r.article, r.body].filter(Boolean).join(" "))].join("\n\n")).join("\n\n\n");
    blob = new Blob([BOM + text + "\n"], { type: "text/plain;charset=utf-8" });
  } else {
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = groups.map((g) => `<h2>${esc(g.chapter)}</h2>` + g.rows.map((r) => `<p><b>${esc(r.article)}</b> ${esc(r.body).replace(/\n/g, "<br>")}</p>`).join("")).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>회칙</title>
<style>body{font-family:"맑은 고딕",sans-serif;font-size:11pt;line-height:1.6}h1{text-align:center;font-size:18pt}h2{font-size:13pt;margin-top:18pt}p{margin:6pt 0}.d{text-align:right;color:#666;font-size:9pt}</style></head>
<body><h1>회칙</h1><p class="d">${day} 기준</p>${body}</body></html>`;
    blob = new Blob([BOM + html], { type: "application/msword" });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RulesDownload({ saved }: { saved: Rule[] }) {
  const [all, setAll] = useState(false);
  const list = all ? saved : saved.filter((r) => r.public);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>회칙 내려받기</b>
      <span className="small">저장된 조문만 담아요. 고치는 중인 조문은 먼저 저장해 주세요.</span>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="mini primary" type="button" disabled={!list.length} onClick={() => rulesFile(list, "doc")}>워드 파일</button>
        <button className="mini" type="button" disabled={!list.length} onClick={() => rulesFile(list, "txt")}>텍스트 파일</button>
        <div className="checks"><label><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />비공개 조문도 넣기</label></div>
        <span className="small">조문 {list.length}개</span>
      </div>
    </div>
  );
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
      const res = await api("/api/admin/club/rules", { body: { ...r, version: "v1" } });
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
    setNote({ tone: "info", text: `조문 ${ok}개를 추가했어요. 확인하고 고친 뒤 아래 “게시글 업로드”로 올려 주세요.` });
    onDone();
  }

  return (
    <section className="card" aria-label="회칙 붙여넣기" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>회칙 붙여넣기</b>
      <span className="small">회칙 글을 통째로 붙여 넣거나 텍스트(.txt) 파일을 고르세요. “제1장”으로 시작하는 줄은 장, “제1조”로 시작하는 줄은 조로 나눠요.
        구글 시트·엑셀에 써 둔 회칙은 회칙이 있는 칸을 모두 골라(Ctrl+A) 복사한 뒤 그대로 붙여 넣으면 돼요.</span>
      <Msg n={note} />
      <label className="l" htmlFor="rp-file">텍스트 파일 고르기 (선택)</label>
      <input id="rp-file" type="file" accept=".txt,text/plain" onChange={readFile} />
      <label className="l" htmlFor="rp-text">회칙 글</label>
      <textarea id="rp-text" className="field" rows={8} style={{ padding: 12 }} value={text} placeholder={"제1장 총칙\n제1조 (명칭) 본 회는 ○○ 모임이라 한다.\n제2조 (목적) …"} onChange={(e) => setText(e.target.value)} />
      {rows.length > 0 && (
        <>
          <span className="small">조문 {rows.length}개로 나눴어요{skipped ? ` · 첫 조 앞의 ${skipped}줄은 넣지 않아요` : ""}. 미리 보기:</span>
          {/* 화면 너비에 맞춘 표(옆으로 넘길 필요 없음): 내용은 자르지 않고 줄을 바꿔 전부 보여 준다. 길면 위아래로만 넘긴다 */}
          <div className="tblw" style={{ maxHeight: 420, overflowY: "auto", overflowX: "hidden" }}>
            <table className="tbl" style={{ minWidth: 0, tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "22%" }} /><col style={{ width: "22%" }} /><col /></colgroup>
              <thead><tr><th>장</th><th>조</th><th>내용</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ verticalAlign: "top" }}>
                    <td style={{ overflowWrap: "anywhere" }}>{r.chapter}</td>
                    <td style={{ overflowWrap: "anywhere" }}><b>{r.article}</b></td>
                    <td className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body || "(내용 없음)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {text.trim() && rows.length === 0 && <div className="msg info">“제1조”처럼 시작하는 줄을 찾지 못했어요.</div>}
      <button className="btn" type="button" disabled={busy || rows.length === 0} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={addAll}>
        {busy ? "추가하는 중…" : rows.length ? `조문 ${rows.length}개 추가` : "추가"}
      </button>
    </section>
  );
}

export function RulesEditor() {
  const [items, setItems] = useState<Rule[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [add, setAdd] = useState({ chapter: "", article: "", body: "", version: "v1" });
  const [paste, setPaste] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  // 조문마다 저장 상태: 마지막으로 저장된 값(고친 게 있는지 비교), 저장 중·방금 저장·실패
  const [saved, setSaved] = useState<Record<string, Rule>>({});
  const [rowState, setRowState] = useState<Record<string, { kind: "saving" | "done" | "bad"; text?: string }>>({});
  const dirtyOf = (x: Rule) => {
    const b = saved[x.id];
    return !b || b.chapter !== x.chapter || b.article !== x.article || b.body !== x.body || b.version !== x.version || b.public !== x.public;
  };

  const load = useCallback(async () => {
    const r = await api<{ items: Rule[] }>("/api/admin/club/rules");
    if (r.ok) {
      setItems(r.data.items);
      setSaved(Object.fromEntries(r.data.items.map((x) => [x.id, x])));
    } else setNote({ tone: "bad", text: r.error });
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
    setAdd({ chapter: "", article: "", body: "", version: "v1" });
    setOpen(false);
    load();
  }
  async function save(x: Rule) {
    setRowState((m) => ({ ...m, [x.id]: { kind: "saving" } }));
    const r = await api(`/api/admin/club/rules/${x.id}`, { method: "PATCH", body: { chapter: x.chapter, article: x.article, body: x.body, version: x.version, public: x.public } });
    if (!r.ok) return setRowState((m) => ({ ...m, [x.id]: { kind: "bad", text: r.error } }));
    setRowState((m) => ({ ...m, [x.id]: { kind: "done", text: "저장했어요 · 아래 “게시글 업로드”로 올리거나 업데이트하면 회원에게 반영돼요" } }));
    await load();
    // 잠시 뒤 안내를 지운다(버튼은 계속 "저장됨 ✓")
    window.setTimeout(() => setRowState((m) => (m[x.id]?.kind === "done" ? { ...m, [x.id]: { kind: "done" } } : m)), 5000);
  }
  // 공개 전체 선택/해제: 모든 조문의 "공개"만 바로 저장한다(다른 칸에서 고치던 내용은 그대로 두고 저장하지 않는다).
  // 그 뒤에도 조문마다 "공개"를 따로 누를 수 있다.
  const [allBusy, setAllBusy] = useState(false);
  async function setAllPublic(on: boolean) {
    if (!items) return;
    const targets = items.filter((x) => (saved[x.id]?.public ?? x.public) !== on);
    setItems((l) => l && l.map((x) => ({ ...x, public: on })));
    if (targets.length === 0) return;
    setAllBusy(true);
    let failed = 0;
    for (const x of targets) {
      const b = saved[x.id] ?? x; // 저장된 내용 그대로, 공개만 바꿔 저장
      const r = await api(`/api/admin/club/rules/${x.id}`, { method: "PATCH", body: { chapter: b.chapter, article: b.article, body: b.body, version: b.version, public: on } });
      if (r.ok) setSaved((m) => ({ ...m, [x.id]: { ...b, public: on } }));
      else failed++;
    }
    setAllBusy(false);
    setNote(failed ? { tone: "bad", text: `${failed}개 조문은 저장하지 못했어요. 그 조문에서 “저장”을 눌러 주세요.` } : { tone: "info", text: `조문을 모두 ${on ? "공개" : "비공개"}로 저장했어요 · 아래 “게시글 업로드”로 올리거나 업데이트하면 회원에게 반영돼요.` });
  }
  const allPublic = !!items?.length && items.every((x) => x.public);
  const somePublic = !!items?.some((x) => x.public);

  async function remove(x: Rule) {
    if (!window.confirm(`“${x.article || x.chapter}” 조문을 지울까요?`)) return;
    const r = await api(`/api/admin/club/rules/${x.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  return (
    <section aria-label="회칙 조문 편집" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>회칙 조문</b>
      <span className="small">조문을 고치거나 “공개” 체크를 바꾸면 “저장됨”이 “저장”으로 바뀌어요. 공개를 풀면 회칙 글에서 빠져요. 다 고친 뒤 “저장”을 누르고, 아래 “게시글 업로드”로 올리거나 업데이트하면 회원의 회칙 글에 반영돼요. 저장할 때마다 변경 기록이 남아요.</span>
      <Msg n={note} />
      <div className="row">
        <button className="mini" type="button" aria-expanded={paste} onClick={() => setPaste(!paste)}>{paste ? "붙여넣기 닫기" : "회칙 붙여넣기 · 파일"}</button>
        <span className="grow" />
        {/* 공개 전체 선택/해제(일부만 공개면 가운데 표시). 그 뒤에도 조문마다 따로 바꿀 수 있다 */}
        {!!items?.length && (
          <div className="checks"><label title="모든 조문의 공개를 한 번에 켜거나 꺼요(바로 저장)">
            <input type="checkbox" checked={allPublic} disabled={allBusy}
              ref={(el) => { if (el) el.indeterminate = somePublic && !allPublic; }}
              onChange={(e) => setAllPublic(e.target.checked)} />
            {allBusy ? "저장하는 중…" : "공개 전체 선택"}
          </label></div>
        )}
      </div>
      {paste && <RulesPaste onDone={load} />}
      {!!items?.length && <RulesDownload saved={items.map((x) => saved[x.id]).filter((x): x is Rule => !!x)} />}
      {!items && <p className="small">불러오는 중이에요…</p>}
      {items?.map((r) => (
        <div key={r.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="grid2">
            <div><label className="l" htmlFor={`rc-${r.id}`}>장</label><input id={`rc-${r.id}`} className="field" value={r.chapter} onChange={(e) => upd(r.id, { chapter: e.target.value })} /></div>
            <div><label className="l" htmlFor={`ra-${r.id}`}>조</label><input id={`ra-${r.id}`} className="field" value={r.article} onChange={(e) => upd(r.id, { article: e.target.value })} /></div>
          </div>
          <label className="l" htmlFor={`rb-${r.id}`}>내용</label>
          <textarea id={`rb-${r.id}`} className="field" rows={4} style={{ padding: 12 }} value={r.body} onChange={(e) => upd(r.id, { body: e.target.value })} />
          {(() => {
            // 버튼 줄(버전 · 저장 · 공개 · 삭제)은 늘 같은 자리. 저장 상태 안내는 그 아래 줄(높이를 미리 잡아 두어 움직이지 않게)
            const st = rowState[r.id];
            const dirty = dirtyOf(r);
            const saving = st?.kind === "saving";
            return (
              <>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <input aria-label="버전" className="field" style={{ width: 90, minHeight: 42 }} value={r.version} onChange={(e) => upd(r.id, { version: e.target.value })} />
                  <button className={`mini${dirty ? " primary" : ""}`} type="button" disabled={saving || !dirty} onClick={() => save(r)} style={{ minWidth: 84 }}>
                    {saving ? "저장 중…" : dirty ? "저장" : "저장됨 ✓"}
                  </button>
                  <div className="checks"><label title="체크를 풀고 저장하면 다음 업로드·업데이트 때 회칙 글에서 빠져요"><input type="checkbox" checked={r.public} onChange={(e) => upd(r.id, { public: e.target.checked })} />공개</label></div>
                  <button className="mini danger" type="button" onClick={() => remove(r)}>삭제</button>
                </div>
                <div className="small" aria-live="polite" style={{ minHeight: "1.5em", marginTop: -4 }}>
                  {st?.kind === "bad" ? <span role="alert" style={{ color: "var(--red-t)" }}>{st.text}</span>
                    : dirty && !saving ? <span style={{ color: "var(--red-t)" }}>저장 안 됨</span>
                    : st?.kind === "done" && st.text ? <span style={{ color: "var(--violet-t)" }}>{st.text}</span>
                    : null}
                </div>
              </>
            );
          })()}
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
      <button className="btn white" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={() => { setErr(""); setOpen(true); }}>+ 조문 추가</button>
      <Popup id="rule-new" width={640} title="조문 추가" open={open} onClose={() => setOpen(false)} dirty={!!(add.chapter.trim() || add.article.trim() || add.body.trim())}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div className="msg bad" role="alert">{err}</div>}
        <div className="grid2">
          <div><label className="l" htmlFor="rn-c">장 (예: 제1장 총칙)</label><input id="rn-c" className="field" value={add.chapter} onChange={(e) => setAdd({ ...add, chapter: e.target.value })} /></div>
          <div><label className="l" htmlFor="rn-a">조 (예: 제1조 (명칭))</label><input id="rn-a" className="field" value={add.article} onChange={(e) => setAdd({ ...add, article: e.target.value })} /></div>
        </div>
        <label className="l" htmlFor="rn-b">내용</label>
        <textarea id="rn-b" className="field" rows={4} style={{ padding: 12 }} value={add.body} onChange={(e) => setAdd({ ...add, body: e.target.value })} />
        <span className="small">추가한 조문은 아래 “게시글 업로드”로 올리면 회원에게 보여요.</span>
        <button className="btn" type="button" disabled={!add.chapter.trim()} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={create}>조문 추가</button>
      </div>
      </Popup>
    </section>
  );
}
