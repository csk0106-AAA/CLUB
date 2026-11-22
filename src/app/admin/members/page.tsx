"use client";

import { ActionNote } from "@/components/ActionNote";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminGate, PERM_LABELS } from "@/components/AdminGate";
import { AdminIssues } from "@/components/AdminIssues";
import { Avatar, type AvatarView } from "@/components/Avatars";
import { DateField } from "@/components/DateField";
import { Popup } from "@/components/Popup";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { eduYes, norm, parseMembers, splitTable } from "@/lib/member-import";
import { downloadXlsx, excelDate, readXlsx } from "@/lib/xlsx";
import { DragHandle, useDragSort } from "@/components/DragSort";
import { phoneKey } from "@/lib/phone";
import { ageGroupOf, normBirth } from "@/lib/age-group";
import { inBook, isGuest, isWithdrawn } from "@/lib/member-kind";
import { typePhone } from "@/lib/phone";
import { fs } from "@/lib/fs";

type M = {
  id: string; no: string; name: string; kind: string; position: string; gender: string;
  company: string; title: string; birth: string; phone: string; ageGroup: string; perms: string[];
  clubs: Seat[]; // 클럽 [{name, role}] (role 이 비면 일반 회원)
  effective: string[]; // 최종 권한(그룹 ∪ 개인)
  hasPin?: boolean; hasAdminPin?: boolean; // 로그인 PIN·관리자용 PIN 을 만들었는지
  fields: Record<string, string>; // 관리자가 만든 추가 항목(열)의 값
  genderEdit?: { from: string; to: string; at: string } | null; // 회원이 직접 바꾼 성별 기록
  approvedAt?: string; // 관리자가 회원 승인한 마지막 날짜(직접 넣은 회원은 넣은 날짜)
  avatar?: AvatarView; // 프로필 사진·캐릭터(없으면 이름 첫 글자)
  edu?: boolean; // 교육 이수
  memo?: string; // 관리자 메모(명예회원 등록 사유 등)
  bookHidden?: string; // "true"면 프로필 북에 안 나옴
  app?: AppMark;
  history?: { at: string; what: string; from?: string; to?: string; by?: string; note?: string }[]; // 가입·탈퇴 이력 // 회원 신청 "승인 전" / "반려"
};
type AppMark = { id: string; status: "pending" | "rejected"; type: string; reason: string; at: string } | null;
type Seat = { name: string; role: string };
type Lists = { memberKinds: { value: string; definition: string }[]; positions: string[]; clubs: string[]; clubRoles: string[] };
type Form = {
  name: string; kind: string; position: string; gender: string; company: string; title: string;
  birth: string; phone: string; ageGroup: string; clubs: Seat[]; fields: Record<string, string>;
  edu: boolean; memo: string; bookShown: boolean;
};

const EMPTY: Form = {
  name: "", kind: "", position: "", gender: "", company: "", title: "", birth: "", phone: "", ageGroup: "", clubs: [], fields: {},
  edu: false, memo: "", bookShown: true,
};
const OFF = " (목록에 없음)";
const clubsText = (c: Seat[]) => c.map((x) => (x.role ? `${x.name}(${x.role})` : x.name)).join(", ");

// 회원 신청 라벨: "승인 전"(회원신청관리로) / "반려"(누르면 사유)
function AppLabel({ app }: { app: NonNullable<AppMark> }) {
  if (app.status === "pending") {
    return <Link href="/admin/member-apps" className="pill warn" style={{ textDecoration: "none", whiteSpace: "nowrap" }} title={`${fmtDate(app.at)} ${app.type === "observe" ? "참관" : "회원"} 요청 · 회원신청관리에서 확인`}>승인 전</Link>;
  }
  return (
    <button type="button" className="pill bad" style={{ border: 0, cursor: "pointer", whiteSpace: "nowrap" }} aria-label="반려 사유 보기"
      onClick={() => window.alert(`반려 사유 (${fmtDate(app.at)})\n\n${app.reason || "(적힌 사유가 없어요)"}`)}>반려</button>
  );
}

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


// 붙여 넣은 명단의 머리글에 추가 항목 이름이 있으면, 성명별로 그 열의 값을 모은다.
// (기본 항목은 member-import 가 읽고, 추가 항목만 여기서 따로 읽는다)
function customFromImport(text: string, fields: string[]): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  if (!text.trim() || fields.length === 0) return out;
  const first = text.replace(/\r/g, "").split("\n").find((l) => l.trim()) ?? "";
  const table = splitTable(text, first.includes("\t") ? "\t" : ",");
  if (table.length < 2) return out;
  const head = table[0].cells.map(norm);
  const nameCol = head.findIndex((h) => ["성명", "이름", "성함", "회원명", "회원이름", "name"].includes(h));
  const cols = fields.map((f) => [f, head.indexOf(norm(f))] as const).filter(([, i]) => i >= 0);
  if (nameCol < 0 || cols.length === 0) return out;
  for (const { cells } of table.slice(1)) {
    const name = cells[nameCol];
    if (!name) continue;
    const v: Record<string, string> = {};
    // 빈 칸도 넣는다(엑셀로 고칠 때 지운 값을 지우려고). 새 회원은 빈 값을 저장하지 않는다.
    for (const [f, i] of cols) v[f] = (cells[i] ?? "").slice(0, 200);
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
  // 고른 회원구분(비어 있으면 전체)
  const [filter, setFilter] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const preview = useMemo(() => parseMembers(importText), [importText]);
  const [custom, setCustom] = useState<string[]>([]);
  const [colsOpen, setColsOpen] = useState(false);
  const [colsDraft, setColsDraft] = useState<string[]>([]);
  const [newCol, setNewCol] = useState("");
  const [requirement, setRequirement] = useState(""); // 정회원 필수 조건(모임개요)
  const importCustom = useMemo(() => customFromImport(importText, custom), [importText, custom]);
  // 이미 있는 회원과 비교: new(새 회원) | same(이름·연락처가 같거나 한쪽 연락처가 비어 있음 → 건너뜀) | dup(이름만 같고 연락처가 다름 → 관리자가 고름)
  type Dup = "skip" | "update" | "new";
  const [dupChoice, setDupChoice] = useState<Record<string, Dup>>({});
  const dupKey = (r: { name: string; line?: number }) => `${r.line}:${r.name}`;
  // 엑셀받기로 받은 파일(회원ID 열)을 고쳐 올리면: edit(바뀐 항목이 있음 → 고침) | nochange(그대로)
  const has = (k: string) => preview.present.includes(k);
  const changesOf = useCallback((r: (typeof preview.rows)[number], ex: M): string[] => {
    const out: string[] = [];
    const cmp = (label: string, key: string, a: string, b: string, show = (x: string) => x || "(빈칸)") => {
      if (has(key) && a.trim() !== b.trim()) out.push(`${label} ${show(b.trim())} → ${show(a.trim())}`);
    };
    cmp("성명", "name", r.name, ex.name);
    cmp("회원구분", "kind", r.kind, ex.kind ?? "");
    if (has("edu") && eduYes(r.edu) !== !!ex.edu) out.push(`교육이수 ${ex.edu ? "YES" : "NO"} → ${eduYes(r.edu) ? "YES" : "NO"}`);
    cmp("직책", "position", r.position, ex.position ?? "");
    cmp("성별", "gender", r.gender, ex.gender ?? "");
    cmp("회사명", "company", r.company, ex.company ?? "");
    cmp("직위", "title", r.title, ex.title ?? "");
    if (has("birth") && (normBirth(r.birth) || r.birth.trim()) !== (ex.birth ?? "")) out.push(`생년월일 ${ex.birth || "(빈칸)"} → ${normBirth(r.birth) || r.birth || "(빈칸)"}`);
    if (has("phone") && phoneKey(r.phone) !== phoneKey(ex.phone)) out.push(`연락처 ${ex.phone || "(빈칸)"} → ${r.phone || "(빈칸)"}`);
    cmp("메모", "memo", r.memo, ex.memo ?? "", (x) => (x ? (x.length > 20 ? `${x.slice(0, 20)}…` : x) : "(빈칸)"));
    const cf = importCustom.get(r.name) ?? {};
    for (const c of Object.keys(cf)) if ((cf[c] ?? "").trim() !== (ex.fields[c] ?? "").trim()) out.push(`${c} ${ex.fields[c] || "(빈칸)"} → ${cf[c] || "(빈칸)"}`);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.present, importCustom]);
  const classify = useMemo(() => {
    const byName = new Map((list ?? []).map((m) => [m.name.trim(), m]));
    const byId = new Map((list ?? []).map((m) => [m.id, m]));
    return preview.rows.map((r) => {
      const mine = r.id ? byId.get(r.id.trim()) : undefined;
      if (mine) {
        const changes = changesOf(r, mine);
        return { kind: changes.length ? ("edit" as const) : ("nochange" as const), ex: mine, changes };
      }
      const ex = byName.get(r.name.trim());
      if (!ex) return { kind: "new" as const, ex: null, changes: [] as string[] };
      const a = phoneKey(r.phone), b = phoneKey(ex.phone);
      return { kind: !a || !b || a === b ? ("same" as const) : ("dup" as const), ex, changes: [] as string[] };
    });
  }, [preview.rows, list, changesOf]);
  const editRows = preview.rows.map((r, i) => ({ r, c: classify[i] })).filter((x) => x.c?.kind === "edit");
  const dupRows = preview.rows.map((r, i) => ({ r, c: classify[i] })).filter((x) => x.c.kind === "dup");
  const dupLeft = dupRows.filter((x) => !dupChoice[dupKey(x.r)]).length;
  const willAdd = preview.rows.filter((r, i) => classify[i]?.kind === "new" || (classify[i]?.kind === "dup" && dupChoice[dupKey(r)] === "new")).length;
  const tail4 = (p?: string) => { const d = phoneKey(p); return d ? `끝자리 ${d.slice(-4)}` : "없음"; };

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
    // 1) 회원ID 로 찾은 회원: 표에 있는 항목만 고친다
    let editNote = "";
    if (editRows.length) {
      const upd = editRows.map(({ r }) => ({
        id: r.id.trim(),
        ...(has("name") ? { name: r.name } : {}),
        ...(has("kind") ? { kind: r.kind } : {}),
        ...(has("position") ? { position: r.position } : {}),
        ...(has("gender") ? { gender: r.gender } : {}),
        ...(has("company") ? { company: r.company } : {}),
        ...(has("title") ? { title: r.title } : {}),
        ...(has("birth") ? { birth: r.birth } : {}),
        ...(has("phone") ? { phone: r.phone } : {}),
        ...(has("edu") ? { edu: eduYes(r.edu) } : {}),
        ...(has("memo") ? { memo: r.memo.slice(0, 500) } : {}),
        ...(importCustom.has(r.name) ? { fields: importCustom.get(r.name) } : {}),
      }));
      const u = await api<{ updated: number; renamed: { from: string; to: string }[] }>("/api/admin/members/bulk-update", { body: { rows: upd } });
      if (!u.ok) { setBusy(false); return setMsg({ tone: "bad", text: `회원 정보를 고치지 못했어요. ${u.error}` }); }
      editNote = `${u.data.updated}명의 정보를 고쳤어요.${u.data.renamed.length ? ` (${u.data.renamed.map((x) => `${x.from}→${x.to}`).join(", ")}: 같은 이름이 있어 알파벳을 붙였어요)` : ""} `;
    }
    // 2) 나머지 줄: 새 회원 추가(이미 있는 회원은 건너뜀)
    const rows = preview.rows.filter((_, i) => classify[i]?.kind !== "edit" && classify[i]?.kind !== "nochange").map(({ line, edu, memo, id: _id, ...r }) => ({
      ...r, edu: eduYes(edu), ...(memo ? { memo: memo.slice(0, 500) } : {}),
      fields: importCustom.get(r.name) ?? {}, dup: dupChoice[dupKey({ name: r.name, line })],
    }));
    if (!rows.length) {
      setBusy(false);
      setMsg({ tone: "info", text: editNote.trim() || "바뀐 내용이 없어요." });
      setImportText(""); setDupChoice({}); setImportOpen(false); load();
      return;
    }
    const r = await api<{ added: number; skipped: string[]; renamed?: { from: string; to: string }[]; updated?: string[] }>("/api/admin/members/bulk", { body: { rows } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: `${editNote}${r.error}` });
    const sk = r.data.skipped;
    const rn = r.data.renamed ?? [];
    if (rn.length) window.alert(`같은 이름의 회원이 있어서(연락처가 달라 다른 사람으로 봤어요) 이름 뒤에 알파벳을 붙였어요.\n${rn.slice(0, 10).map((x) => `${x.from} → ${x.to}`).join("\n")}${rn.length > 10 ? `\n외 ${rn.length - 10}명` : ""}`);
    const up = r.data.updated ?? [];
    setMsg({ tone: "info", text: `${editNote}${r.data.added}명을 추가했어요.${rn.length ? ` 동명이인 ${rn.length}명은 이름 뒤에 알파벳을 붙였어요.` : ""}${up.length ? ` ${up.length}명(${up.slice(0, 5).join(", ")}${up.length > 5 ? " 외" : ""})은 기존 회원의 연락처를 새 번호로 고쳤어요.` : ""}${sk.length ? ` 이미 있는 ${sk.length}명(${sk.slice(0, 5).join(", ")}${sk.length > 5 ? " 외" : ""})은 건너뛰었어요.` : ""}` });
    setImportText("");
    setDupChoice({});
    setImportOpen(false);
    load();
  }

  const load = useCallback(async () => {
    const [m, s, f] = await Promise.all([
      api<{ members: M[] }>("/api/admin/members"),
      api<Lists>("/api/admin/lists"),
      api<{ fields: string[] }>("/api/admin/members/fields"),
    ]);
    api<{ requirement: string }>("/api/public/club").then((c) => c.ok && setRequirement(c.data.requirement ?? ""));
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
    // 같은 회원을 다시 누르면 접는다. 다른 회원을 펼칠 때 고치던 내용이 있으면 한 번 묻는다.
    if (editId === m.id) {
      if (JSON.stringify(form) !== formOrig && !window.confirm("저장하지 않은 내용이 있어요. 접을까요?")) return;
      return reset();
    }
    if (editId && JSON.stringify(form) !== formOrig && !window.confirm("저장하지 않은 내용이 있어요. 다른 회원을 펼칠까요?")) return;
    const f: Form = {
      name: m.name, kind: m.kind ?? "", position: m.position ?? "", gender: m.gender ?? "", company: m.company ?? "", title: m.title ?? "",
      birth: m.birth ?? "", phone: m.phone ?? "", ageGroup: m.ageGroup ?? "", clubs: m.clubs ?? [], fields: m.fields ?? {},
      edu: !!m.edu, memo: m.memo ?? "", bookShown: m.bookHidden !== "true",
    };
    setEditId(m.id);
    setForm(f);
    setFormOrig(JSON.stringify(f));
    setFormErr("");
    setMsg(null);
    setFormOpen(false); // 회원 수정은 팝업이 아니라 명단에서 펼친다
    // 펼친 칸이 보이게
    requestAnimationFrame(() => document.querySelector(`[data-medit="${m.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
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
    type Res = { renamed?: { from: string; to: string } };
    const r = editId
      ? await api<Res>(`/api/admin/members/${editId}`, { method: "PATCH", body: { ...form, clubs: undefined } })
      : await api<Res>("/api/admin/members", { body: { ...form, clubs: [] } });
    setBusy(false);
    if (!r.ok) return setFormErr(r.error);
    // 동명이인: 서버가 이름 뒤에 알파벳을 붙였으면 알림으로 알려 준다(회원 명단에서 다시 고칠 수 있다)
    const rn = r.data.renamed;
    if (rn) window.alert(`“${rn.from}” 이름의 회원이 이미 있어서 “${rn.to}”(으)로 저장했어요.\n로그인 화면에서 서로 구분되도록 이름 뒤에 알파벳을 붙였어요. 필요하면 회원 명단에서 이름을 다시 고칠 수 있어요.`);
    setMsg({ tone: "info", text: rn ? `같은 이름이 있어서 “${rn.to}”(으)로 ${editId ? "저장" : "추가"}했어요.` : editId ? "저장했어요." : "회원을 추가했어요." });
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

  // 탈퇴 해지: 탈퇴 전 회원구분으로 되돌려 다시 로그인·활동할 수 있게
  async function restore(m: M) {
    if (!window.confirm(`${m.name} 님의 탈퇴를 해지할까요?\n탈퇴 전 회원구분으로 돌아가고 다시 로그인할 수 있어요.`)) return;
    setBusy(true);
    const r = await api<{ kind: string }>(`/api/admin/members/${m.id}/restore`, { body: {} });
    setBusy(false);
    if (!r.ok) return setFormErr(r.error);
    reset();
    setMsg({ tone: "info", text: `${m.name} 님의 탈퇴를 해지했어요. 회원구분: ${r.data.kind}` });
    load();
  }

  async function remove(m: M) {
    if (!window.confirm(`${m.name} 님을 명단에서 지울까요?\n지우면 되돌릴 수 없고, 이 회원은 더 이상 로그인할 수 없어요.`)) return;
    const r = await api(`/api/admin/members/${m.id}`, { method: "DELETE" });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "지웠어요." });
    load();
  }

  const counts = new Map<string, number>();
  list?.forEach((m) => counts.set(m.kind || "미지정", (counts.get(m.kind || "미지정") ?? 0) + 1));
  const shown = list?.filter((m) => filter.length === 0 || filter.includes(m.kind || "미지정")) ?? [];
  const admins = list?.filter((m) => m.effective.length > 0) ?? [];

  // 끌어서 순서 바꾸기: 보이는 목록(구분 필터 적용)에서 옮기면 전체 명단에서 그 회원들이 있던 자리 안에서 순서가 바뀐다.
  // NO 를 1부터 다시 매겨 바로 저장한다. 휴대폰 목록과 PC 표는 따로 끈다(보이는 쪽만 쓴다).
  function reorder(next: M[]) {
    if (!list) return;
    const ids = new Set(next.map((m) => m.id));
    const queue = [...next];
    const merged = list.map((m) => (ids.has(m.id) ? (queue.shift() as M) : m)).map((m, i) => ({ ...m, no: String(i + 1) }));
    setList(merged);
    api("/api/admin/members/order", { method: "PUT", body: { ids: merged.map((m) => m.id) } }).then((r) => {
      if (!r.ok) { setMsg({ tone: "bad", text: `순서를 저장하지 못했어요. ${r.error}` }); load(); }
    });
  }
  const xlsRef = useRef<HTMLInputElement>(null);

  // 프로필 북 노출·교육 이수 바꾸기(한 명 또는 여러 명)
  async function setFlags(ids: string[], flags: { bookShown?: boolean; edu?: boolean }, ok: (n: number) => string) {
    // 누르자마자 화면에 반영하고, 저장에 실패하면 되돌린 뒤 알림 창으로 알린다(위쪽 안내는 스크롤하면 안 보여서)
    const before = list;
    setList((l) => (l ?? []).map((m) => (ids.includes(m.id) ? {
      ...m,
      ...(flags.bookShown !== undefined ? { bookHidden: flags.bookShown ? "" : "true" } : {}),
      ...(flags.edu !== undefined ? { edu: flags.edu } : {}),
    } : m)));
    const r = await api<{ changed: number }>("/api/admin/members/flags", { body: { ids, ...flags } });
    if (!r.ok) {
      setList(before);
      window.alert(`저장하지 못했어요.\n${r.error}`);
      return setMsg({ tone: "bad", text: r.error });
    }
    setMsg({ tone: "info", text: ok(r.data.changed) });
    load();
  }
  const toggleBook = (m: M) => {
    // 대기회원·참관회원·탈퇴회원은 프로필 북에 공개할 수 없다(체크는 꺼진 모양)
    if (isGuest(m.kind)) return void window.alert("회원정보를 수정해야 합니다.\n대기회원·참관회원은 프로필 북에 공개되지 않아요. 회원구분을 먼저 바꿔 주세요.");
    const show = m.bookHidden === "true";
    setFlags([m.id], { bookShown: show }, () => `${m.name} 님을 프로필 북${show ? "에 보이게 했어요" : "에서 뺐어요"}.`);
  };
  const dsNarrow = useDragSort(shown, reorder);
  const dsWide = useDragSort(shown, reorder);

  /* ── 엑셀 ── */
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  // 엑셀받기: 올리기 양식과 같은 모양에 지금 보이는 회원정보를 채워 받는다(구분 필터 적용).
  // 맨 끝 "회원ID" 열로 회원을 찾으므로, 고쳐서 올리면 그 회원의 정보가 바뀐다. 빈 줄에 적으면 새 회원으로 들어간다.
  const ID_HEAD = "회원ID(수정 금지)";
  const TEMPLATE_HEAD = () => ["성명", "회원구분", "교육이수", "직책", "성별", "회사명", "직위", "생년월일", "연락처", ...custom, "메모", ID_HEAD];
  function downloadMembers() {
    const rows = shown.map((m) => [
      m.name, m.kind ?? "", m.edu ? "YES" : "NO", m.position ?? "", m.gender ?? "", m.company ?? "", m.title ?? "",
      m.birth ?? "", m.phone ?? "", ...custom.map((c) => m.fields[c] ?? ""), m.memo ?? "", m.id,
    ]);
    const label = filter.length ? `_${filter.join("·")}` : "";
    downloadTemplate(rows, `회원명단${label}_${today}.xlsx`);
  }
  // 올리기용 양식(빈 양식 또는 회원정보를 채운 양식) + 작성 방법 시트
  function downloadTemplate(data: string[][] = [], file = "회원명단_올리기양식.xlsx") {
    const head = TEMPLATE_HEAD();
    const guide: string[][] = [
      ["항목", "적는 방법"],
      ["성명", "꼭 적어 주세요. 이미 있는 회원과 이름·연락처가 같으면 건너뛰어요."],
      ["회원구분", kinds.map((k) => k.value).join(", ") || "회원구분 목록의 이름"],
      ["교육이수", `YES 또는 NO${requirement ? ` (“${requirement}” 여부)` : ""}`],
      ["직책", lists.positions.join(", ") || "직책 목록의 이름 (없으면 비워 두세요)"],
      ["성별", "남 또는 여"],
      ["생년월일", "1970-01-01 처럼 (1970.1.1, 700101 도 읽어요). 연령대는 자동으로 계산돼요."],
      ["연락처", "010-1234-5678 처럼 (숫자만 적어도 돼요)"],
      ...custom.map((c) => [c, "추가 항목 (자유롭게)"]),
      ["메모", "관리자만 보는 메모 (500자까지)"],
      ["", ""],
      [ID_HEAD, "엑셀받기로 받은 회원의 번호예요. 고치거나 지우지 마세요. 이 번호가 있는 줄은 그 회원의 정보를 고치고, 없는 줄(새로 적은 줄)은 새 회원으로 넣어요."],
      ["", ""],
      ["참고", "‘회원명단’ 시트의 첫 줄(머리글)은 지우거나 바꾸지 마세요. 둘째 줄부터 한 줄에 한 명씩 적어요."],
      ["참고", "고친 파일을 ‘엑셀올리기’로 올리면, 바뀐 내용을 미리 보여 준 뒤 확인하면 반영해요. 칸을 비우면 그 값이 지워져요."],
      ["참고", "관리자 권한과 클럽은 여기서 바꿀 수 없어요. 회원 수정·클럽관리에서 정해 주세요. 회원을 지우는 것도 회원명단에서 해요(줄을 지워도 회원은 그대로예요)."],
      ["예시", "김하늘 · 정회원 · YES · 회장 · 여 · 예시상사 · 대표 · 1970-01-01 · 010-0000-0001"],
    ];
    downloadXlsx(file, [
      { name: "회원명단", rows: [head, ...data], boldFirst: true, widths: head.map((h) => (h === "메모" ? 30 : h === ID_HEAD ? 38 : h === "회사명" ? 18 : 12)) },
      { name: "작성 방법", rows: guide, boldFirst: true, widths: [12, 90] },
    ]);
  }
  // 엑셀 올리기: 첫 시트를 읽어 "명단 한 번에 넣기" 칸에 넣는다(미리보기에서 확인한 뒤 추가)
  async function uploadExcel(file: File) {
    try {
      const { rows, numeric } = readXlsx(new Uint8Array(await file.arrayBuffer()));
      if (rows.length < 2) return setMsg({ tone: "bad", text: "엑셀에 회원이 없어요. 첫 줄은 머리글, 둘째 줄부터 회원을 적어 주세요." });
      const head = rows[0].map(norm);
      const birthCol = head.findIndex((h) => ["생년월일", "생일", "생년", "출생", "birth"].includes(h));
      const phoneCol = head.findIndex((h) => ["연락처", "전화", "전화번호", "휴대폰", "휴대전화", "핸드폰", "휴대폰번호", "hp", "phone", "mobile"].includes(h));
      const fixed = rows.map((r, i) => r.map((v, j) => {
        if (i === 0 || !numeric[i]?.[j] || !v) return v;
        // 엑셀이 숫자로 바꿔 저장한 날짜(일련번호)·연락처(앞의 0 빠짐)를 되돌린다
        if (j === birthCol && /^\d+(\.\d+)?$/.test(v) && Number(v) < 80000) return excelDate(Number(v));
        if (j === phoneCol && /^1\d{8,9}$/.test(v)) return `0${v}`;
        return v;
      }));
      const cell = (v: string) => (/["\t\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      setImportText(fixed.map((r) => r.map(cell).join("\t")).join("\n"));
      setDupChoice({});
      setImportOpen(true);
      setMsg({ tone: "info", text: `“${file.name}”에서 ${fixed.length - 1}줄을 읽었어요. 아래 미리보기를 확인하고 “추가하기”를 눌러 주세요.` });
    } catch {
      setMsg({ tone: "bad", text: "엑셀 파일을 읽지 못했어요. .xlsx 파일인지 확인해 주세요(예전 .xls 는 엑셀에서 .xlsx 로 다시 저장해 주세요)." });
    }
  }
  const kindTabs = [...kinds.map((k) => k.value), ...[...counts.keys()].filter((k) => k !== "미지정" && !kinds.some((x) => x.value === k))];

  // PIN 초기화: 회원 PIN(회원관리 권한) / 관리자용 PIN(모든 권한). 지운 뒤 회원에게 알림이 간다.
  async function resetPin(m: M, kind: "member" | "admin") {
    const what = kind === "member" ? "로그인 PIN" : "관리자용 PIN";
    if (!window.confirm(`${m.name} 님의 ${what}을 초기화할까요?\n${kind === "member" ? "다음 로그인 때 연락처 뒷자리 4자리로 들어와 새 PIN 을 만들어요." : "관리자 화면에 들어갈 때 공용 관리자 비밀번호를 거쳐 새 PIN 을 만들어요."}`)) return;
    setBusy(true);
    const r = await api(`/api/admin/members/${m.id}/pin`, { body: { kind } });
    setBusy(false);
    if (!r.ok) return window.alert(r.error);
    window.alert(`${m.name} 님의 ${what}을 초기화했어요. 회원에게 알림이 갔어요.`);
    await load();
  }

  // 회원 추가(팝업)와 회원 수정(명단에서 펼침)이 함께 쓰는 입력 양식
  const memberForm = (
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {formErr && <div className="msg bad" role="alert">{formErr}</div>}
        {/* 한 줄씩: (성명 · 성별 · 연락처) (생년월일 · 연령대) (회원구분 · 모임직책) (회사명 · 직위) */}
        <div className="mf-row" style={{ gridTemplateColumns: "minmax(0, 1fr) 64px minmax(148px, 1.4fr)" }}>
          <div><label className="l" htmlFor="f-name">성명</label><input id="f-name" className="field" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div>
            <label className="l" htmlFor="f-gender">성별</label>
            <select id="f-gender" className="field" style={{ paddingLeft: 8, paddingRight: 4 }} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">-</option><option>남</option><option>여</option>
            </select>
          </div>
          <div><label className="l" htmlFor="f-phone">연락처</label><input id="f-phone" className="field" style={{ paddingLeft: 8, paddingRight: 8 }} inputMode="tel" placeholder="010-0000-0000" value={form.phone} onChange={(e) => set("phone", typePhone(e.target.value))} /></div>
        </div>
        <div className="mf-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div><label className="l" htmlFor="f-birth">생년월일</label><DateField id="f-birth" mode="date" value={form.birth} onChange={(v) => set("birth", v)} /></div>
          <div>
            <label className="l" htmlFor="f-age">연령대 (팀 구성에 사용)</label>
            {ageGroupOf(form.birth) ? (
              <input id="f-age" className="field" readOnly value={ageGroupOf(form.birth)} aria-describedby="f-age-d" style={{ background: "var(--soft)" }} />
            ) : (
              <input id="f-age" className="field" placeholder="50대" value={form.ageGroup} aria-describedby="f-age-d" onChange={(e) => set("ageGroup", e.target.value)} />
            )}
            <span id="f-age-d" className="small" style={{ display: "block", marginTop: 4 }}>{ageGroupOf(form.birth) ? "생년월일로 자동 계산돼요." : "생년월일을 넣으면 자동으로 채워져요."}</span>
          </div>
        </div>
        <div className="mf-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div>
            <label className="l" htmlFor="f-kind">회원구분</label>
            <ListSelect id="f-kind" value={form.kind} options={kinds.map((k) => k.value)} onChange={(v) => set("kind", v)} />
          </div>
          <div>
            <label className="l" htmlFor="f-pos">모임 직책</label>
            <ListSelect id="f-pos" value={form.position} options={lists.positions} onChange={(v) => set("position", v)} />
          </div>
        </div>
        <div className="mf-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div><label className="l" htmlFor="f-co">회사명</label><input id="f-co" className="field" value={form.company} onChange={(e) => set("company", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-ti">직위</label><input id="f-ti" className="field" value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
        </div>
        <div className="grid2">
          <div>
            {/* 교육 이수: 로그인 화면 회원 신청처럼 정회원 필수 조건(모임개요)을 "○○ 하셨나요?"로 묻는다 */}
            <span className="l" id="f-edu-l">“{requirement || "교육과정 수료"}” 하셨나요?</span>
            <div className="seg" role="group" aria-labelledby="f-edu-l" style={{ width: 160 }}>
              <button type="button" aria-pressed={form.edu} onClick={() => set("edu", true)} style={{ minHeight: 46 }}>YES</button>
              <button type="button" aria-pressed={!form.edu} onClick={() => set("edu", false)} style={{ minHeight: 46 }}>NO</button>
            </div>
          </div>
          <div>
            {/* 프로필 북 노출: 회원이 설정에서도 바꿀 수 있다 */}
            <span className="l" id="f-book-l">프로필 북 노출</span>
            <label className="row" style={{ gap: 8, minHeight: 46, cursor: "pointer" }}>
              <input type="checkbox" checked={form.bookShown && !isGuest(form.kind)} style={{ width: 20, height: 20 }} aria-labelledby="f-book-l"
                onChange={(e) => {
                  if (e.target.checked && isGuest(form.kind)) return void window.alert("회원정보를 수정해야 합니다.\n대기회원·참관회원은 프로필 북에 공개되지 않아요. 회원구분을 먼저 바꿔 주세요.");
                  set("bookShown", e.target.checked);
                }} />
              <span>{isGuest(form.kind) ? `${form.kind}은 프로필 북에 안 나와요` : form.bookShown ? "프로필 북에 보여요" : "프로필 북에서 빠져요"}</span>
            </label>
          </div>
          {custom.map((c, i) => (
            <div key={c}><label className="l" htmlFor={`f-x${i}`}>{c}</label><input id={`f-x${i}`} className="field" maxLength={200} value={form.fields[c] ?? ""} onChange={(e) => set("fields", { ...form.fields, [c]: e.target.value })} /></div>
          ))}
        </div>
        <div>
          <label className="l" htmlFor="f-memo">메모 (관리자만 보여요{form.kind === "명예회원" ? " · 명예회원 등록 사유" : ""})</label>
          <textarea id="f-memo" className="field" rows={2} maxLength={500} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }}
            placeholder={form.kind === "명예회원" ? "예) 교육과정 주관사 대표로 명예회원 등록" : "관리자 메모"} value={form.memo} onChange={(e) => set("memo", e.target.value)} />
          {form.kind === "명예회원" && !form.memo.trim() && <span className="small">명예회원은 관리자 등록으로만 정해져요. 등록 사유를 메모로 남겨 주세요.</span>}
        </div>
        <div>
          <span className="l">클럽</span>
          {/* 클럽 회원과 클럽 직책은 클럽관리에서만 정한다(여기서는 보기만) */}
          <span className="small" style={{ display: "block" }}>
            {form.clubs.length ? clubsText(form.clubs) : "들어간 클럽이 없어요."} 클럽 회원과 클럽 직책은 <Link href="/admin/clubs">클럽관리</Link>에서 정해요.
          </span>
        </div>
        <span className="small">관리자 권한은 직책·클럽 직책에 따라 정해져요. 개인 권한은 <Link href="/admin/admins">권한설정</Link>에서 바꿔요.</span>
        {editId && (() => {
          const m = list?.find((x) => x.id === editId);
          if (!m) return null;
          const h = m.history ?? [];
          return (
            <>
              {/* 탈퇴회원: 탈퇴 해지(다시 로그인·활동) */}
              {isWithdrawn(m.kind) && (
                <div className="msg bad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span>탈퇴한 회원이에요. 로그인할 수 없고 프로필 북에서 빠져 있어요. 활동 기록(투표·설문·퀴즈·댓글·일정·활동)은 남아 있어요.</span>
                  <button className="btn" type="button" disabled={busy} style={{ width: "auto", alignSelf: "flex-start", minHeight: 44 }} onClick={() => restore(m)}>탈퇴 해지</button>
                </div>
              )}
              {/* 로그인 PIN·관리자용 PIN: 볼 수는 없고 초기화만 */}
              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="small">로그인 PIN</span>
                <span className={`pill ${m.hasPin ? "ok" : "gray"}`}>{m.hasPin ? "만듦" : "아직 없음(연락처 4자리로 로그인)"}</span>
                {m.hasPin && <button className="mini" type="button" disabled={busy} onClick={() => resetPin(m, "member")}>PIN 초기화</button>}
                {m.effective.length > 0 && (
                  <>
                    <span className="small" style={{ marginLeft: 8 }}>관리자용 PIN</span>
                    <span className={`pill ${m.hasAdminPin ? "ok" : "gray"}`}>{m.hasAdminPin ? "만듦" : "아직 없음"}</span>
                    {m.hasAdminPin && <button className="mini" type="button" disabled={busy} onClick={() => resetPin(m, "admin")}>관리자용 PIN 초기화</button>}
                  </>
                )}
              </div>
              {/* 가입·탈퇴 이력 */}
              <details open={isWithdrawn(m.kind) || undefined}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: fs(14) }}>가입·탈퇴 이력 ({h.length})</summary>
                {h.length === 0 ? (
                  <span className="small" style={{ display: "block", marginTop: 6 }}>남은 기록이 없어요(관리자가 명단에 직접 넣은 회원은 신청 기록이 없어요).</span>
                ) : (
                  <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                    {h.map((x, i) => (
                      <li key={i} className="small" style={{ overflowWrap: "anywhere" }}>
                        <b style={{ color: "var(--ink)" }}>{x.what}</b> · {fmtDateTime(x.at)}
                        {x.from && x.to ? ` · ${x.from} → ${x.to}` : x.from ? ` · 이전 구분: ${x.from}` : x.to ? ` · ${x.to}` : ""}
                        {x.by ? ` · 처리: ${x.by}` : ""}{x.note ? ` · ${x.note}` : ""}
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            </>
          );
        })()}
        {/* 저장 · 취소 · 삭제: 같은 크기로 한 줄 */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${editId && list?.some((x) => x.id === editId) ? 3 : 2}, minmax(0, 1fr))`, gap: 8 }}>
          <button className="btn" type="submit" disabled={busy || !form.name.trim()} style={{ width: "100%", whiteSpace: "nowrap" }}>{editId ? "저장" : "추가"}</button>
          <button className="btn white" type="button" style={{ width: "100%", whiteSpace: "nowrap" }} onClick={reset}>취소</button>
          {editId && (() => {
            const m = list?.find((x) => x.id === editId);
            return m ? <button className="btn red" type="button" style={{ width: "100%", whiteSpace: "nowrap" }} onClick={() => { reset(); remove(m); }}>삭제</button> : null;
          })()}
        </div>
      </form>
  );

  return (
    <>
      <ActionNote msg={msg} />
      {list && list.some((m) => m.app?.status === "pending") && (
        <div className="msg info" role="status">
          승인 전 회원 신청이 {list.filter((m) => m.app?.status === "pending").length}건 있어요. <Link href="/admin/member-apps">회원신청관리</Link>에서 확인해 주세요.
        </div>
      )}
      {list && list.some((m) => m.genderEdit) && (
        <div className="msg info" role="status">
          회원이 직접 성별을 바꾼 회원이 {list.filter((m) => m.genderEdit).length}명 있어요({list.filter((m) => m.genderEdit).map((m) => m.name).join(", ")}). 명단의 “회원 수정” 표시를 보고 “확인”을 눌러 주세요.
        </div>
      )}

      {/* 한 줄: 회원추가 · 항목추가 · 명단붙이기 · 엑셀받기(지금 보이는 명단을 양식 모양으로). 빈 양식 받기·엑셀 업로드는 명단붙이기 안에 */}
      <div role="group" aria-label="회원 명단 도구" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1.5fr)", gap: 4 }}>
        {(() => {
          const b = { minHeight: 36, padding: "0 2px", fontSize: fs(12), whiteSpace: "nowrap", justifyContent: "center", width: "100%" } as const;
          return (
            <>
              <button className="btn" type="button" aria-haspopup="dialog" onClick={startAdd} style={b}>회원추가</button>
              <button className="mini" type="button" aria-expanded={colsOpen} onClick={() => { setColsOpen(!colsOpen); setColsDraft(custom); }} style={b}>항목추가</button>
              <button className="mini" type="button" aria-expanded={importOpen} aria-pressed={importOpen} onClick={() => setImportOpen(!importOpen)} style={b}>명단붙이기</button>
              <button className="mini" type="button" disabled={!shown.length} onClick={downloadMembers} style={b}
                title={filter.length ? `지금 보이는 ${shown.length}명을 엑셀 양식으로 받아요(고쳐서 명단붙이기 › 엑셀 업로드로 올리면 반영)` : "회원정보를 엑셀 양식으로 받아요(고쳐서 명단붙이기 › 엑셀 업로드로 올리면 반영)"}>회원정보다운로드</button>
            </>
          );
        })()}
        <input ref={xlsRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadExcel(f); }} />
      </div>

      {colsOpen && (
        <section className="card" aria-label="항목 추가" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>항목 추가</b>
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
            <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: fs(15) }} disabled={JSON.stringify(colsDraft) === JSON.stringify(custom)} onClick={() => saveCols(colsDraft)}>항목 저장</button>
            <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={() => setColsOpen(false)}>닫기</button>
          </div>
        </section>
      )}

      {importOpen && (
        <section className="card" aria-label="명단 붙여넣기" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <b className="grow" style={{ font: `700 ${fs(17)} var(--display)` }}>명단 한 번에 넣기</b>
            <button className="mini" type="button" onClick={() => downloadTemplate()} style={{ fontSize: fs(12) }}>⬇ 엑셀 양식 받기</button>
            <button className="mini" type="button" onClick={() => xlsRef.current?.click()} style={{ fontSize: fs(12) }} title="양식에 적었거나 엑셀받기로 받아 고친 파일을 올려요(미리보기 후 반영)">⬆ 엑셀 업로드</button>
          </div>
          <span className="small">
            “엑셀 양식 받기”(빈 양식)에 적거나 “회원정보다운로드”로 받은 파일을 고친 뒤 “엑셀 업로드”로 올리면 여기에 채워져요. 표를 복사해 붙여 넣어도 돼요.
            새로 적은 줄은 새 회원으로 넣고, 회원ID가 있는 줄은 그 회원의 바뀐 정보만 고쳐요(넣기 전에 아래에서 확인해요). 관리자 권한·클럽은 여기서 바꿀 수 없어요.
          </span>
          <label className="l" htmlFor="imp">붙여 넣을 명단</label>
          <textarea id="imp" className="field" rows={6} style={{ padding: 12, fontFamily: "inherit" }} value={importText}
            placeholder={"성명,회원구분,직책,성별,회사명,직위,생년월일,연락처\n김하늘,정회원,회장,여,예시상사,대표,1970-01-01,010-0000-0001"}
            onChange={(e) => setImportText(e.target.value)} />
          {preview.rows.length > 0 && (
            <>
              {importCustom.size > 0 && <span className="small">추가 항목({custom.filter((c) => [...importCustom.values()].some((v) => c in v)).join(", ")}) 값도 함께 넣어요.</span>}
              <span className="small">
                {preview.rows.length}명을 읽었어요 · 새 회원 {classify.filter((c) => c.kind === "new").length}명
                {classify.some((c) => c.kind === "same") ? ` · 이미 있는 같은 회원 ${classify.filter((c) => c.kind === "same").length}명(이름·연락처가 같아 건너뛰어요)` : ""}
                {editRows.length ? ` · 정보를 고칠 회원 ${editRows.length}명` : ""}
                {classify.some((c) => c.kind === "nochange") ? ` · 바뀐 것 없는 회원 ${classify.filter((c) => c.kind === "nochange").length}명` : ""}
                {dupRows.length ? ` · 이름은 같고 연락처가 다른 회원 ${dupRows.length}명(아래에서 골라 주세요)` : ""}. 아래 표를 위아래로 넘겨 모두 확인해 보세요.
              </span>
              {/* 회원정보다운로드로 받은 파일을 고쳐 올렸을 때: 회원별로 바뀌는 내용 */}
              {editRows.length > 0 && (
                <section className="card" aria-label="고칠 회원 정보" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--soft)", maxHeight: 320, overflowY: "auto" }}>
                  <b>이렇게 고쳐져요 ({editRows.length}명)</b>
                  {editRows.map(({ r, c }) => (
                    <div key={`${r.line}-${r.id}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span><b>{c.ex?.name}</b> <span className="small">({r.line}번째 줄)</span></span>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>{c.changes.map((x, i) => <li key={i} className="small" style={{ overflowWrap: "anywhere" }}>{x}</li>)}</ul>
                    </div>
                  ))}
                </section>
              )}
              {dupRows.length > 0 && (
                <section className="card" aria-label="이름이 같은 회원 처리" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
                  <b>이름은 같은데 연락처가 달라요 ({dupRows.length}명)</b>
                  <span className="small">앱에 이미 있는 회원과 이름이 같지만 연락처가 달라요. 같은 사람인지 다른 사람인지 골라 주세요. 같은 사람을 새로 넣으면 회원이 둘이 돼요.</span>
                  {dupRows.map(({ r, c }) => {
                    const k = dupKey(r);
                    const opts: [Dup, string][] = [["skip", "같은 사람 · 건너뛰기"], ["update", "같은 사람 · 연락처를 새 번호로 고치기"], ["new", `다른 사람 · “${r.name}B”처럼 새로 넣기`]];
                    return (
                      <div key={k} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10 }}>
                        <span><b>{r.name}</b> <span className="small">({r.line}번째 줄)</span></span>
                        <span className="small">명단 연락처: {tail4(r.phone)} · 앱에 있는 연락처: {tail4(c.ex?.phone)}{c.ex?.company ? ` · 앱의 회사: ${c.ex.company}` : ""}{r.company ? ` · 명단의 회사: ${r.company}` : ""}</span>
                        <div className="checks" role="radiogroup" aria-label={`${r.name} 처리`}>
                          {opts.map(([v, l]) => (
                            <label key={v}><input type="radio" name={`dup-${k}`} checked={dupChoice[k] === v} onChange={() => setDupChoice({ ...dupChoice, [k]: v })} />{l}</label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
              {/* 읽은 명단 전체: 세로 스크롤(머리글 고정), 맨 앞은 순서와 붙여 넣은 글의 줄 번호 */}
              <div className="tblw" style={{ maxHeight: 360, overflowY: "auto" }}>
                <table className="tbl" style={{ minWidth: 820 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--card, #fff)" }}><tr><th>#</th><th>줄</th><th>처리</th><th>성명</th><th>구분</th><th>직책</th><th>성별</th><th>회사명</th><th>직위</th><th>생년월일</th><th>연락처</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i}><td className="num">{i + 1}</td><td className="num small">{r.line}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{(() => {
                          const c = classify[i]?.kind;
                          const ch = dupChoice[dupKey(r)];
                          if (c === "same") return <span className="chip line">건너뜀</span>;
                          if (c === "edit") return <span className="chip warn">고침</span>;
                          if (c === "nochange") return <span className="chip line">그대로</span>;
                          if (c === "dup") return <span className={`chip ${ch ? "violet" : "warn"}`}>{ch === "skip" ? "건너뜀" : ch === "update" ? "연락처 고침" : ch === "new" ? "새로(동명이인)" : "골라 주세요"}</span>;
                          return <span className="chip violet">새로</span>;
                        })()}</td>
                        <td><b>{r.name}</b></td><td>{r.kind}</td><td>{r.position}</td><td>{r.gender}</td><td>{r.company}</td><td>{r.title}</td><td className="num">{fmtDate(r.birth)}</td><td className="num">{r.phone}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {preview.problems.length > 0 && (
            <div className="msg info" style={{ maxHeight: 160, overflowY: "auto" }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{preview.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          <button className="btn" type="button" style={{ width: "auto", minWidth: 180, alignSelf: "flex-start" }} disabled={busy || preview.rows.length === 0 || dupLeft > 0 || (willAdd === 0 && !editRows.length && !dupRows.some((x) => dupChoice[dupKey(x.r)] === "update"))} onClick={importAll}>
            {!preview.rows.length ? "추가하기" : [
              editRows.length ? `${editRows.length}명 고치기` : "",
              willAdd || !editRows.length ? `${willAdd}명 추가하기` : "",
              dupRows.some((x) => dupChoice[dupKey(x.r)] === "update") ? "연락처 고치기" : "",
            ].filter(Boolean).join(" · ")}
          </button>
          {dupLeft > 0 && <span className="small" style={{ color: "var(--red-t)" }}>이름이 같은 회원 {dupLeft}명을 어떻게 할지 위에서 골라 주세요.</span>}
        </section>
      )}

      <Popup id="member-form" width={760} title="회원 추가" open={formOpen && !editId} onClose={reset} dirty={JSON.stringify(form) !== formOrig}>
      {memberForm}
      </Popup>

      {/* 요약: 권한자·남·여 (구분별 명수는 아래 필터 버튼에) */}
      {list && (
        <p className="small" role="group" aria-label="회원 요약" style={{ margin: "0 0 -6px", fontSize: fs(13) }}>
          <Link href="/admin/admins">권한자 {admins.length}</Link>
          <span>, 남 {list.filter((m) => m.gender === "남").length}, 여 {list.filter((m) => m.gender === "여").length}</span>
          {/* 프로필 북에 실제로 나오는 회원(대기회원·참관회원 제외, 노출을 끈 회원 제외) */}
          <span title="대기회원·참관회원과 프로필 북 노출을 끈 회원은 빼고 세요">, 프로필북공개 {list.filter((m) => inBook(m)).length}</span>
        </p>
      )}
      {/* 회원구분 보기: 한 줄, "전체" 외에는 여러 개를 함께 고를 수 있다(아무것도 안 고르면 전체) */}
      <div className="fpills" role="group" aria-label="회원구분 보기 (여러 개 선택 가능)">
        <button type="button" aria-pressed={filter.length === 0} onClick={() => setFilter([])}>전체 {list?.length ?? 0}</button>
        {[...kindTabs, ...(counts.get("미지정") || filter.includes("미지정") ? ["미지정"] : [])].map((k) => {
          const on = filter.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} aria-label={`${k} ${counts.get(k) ?? 0}명`}
              onClick={() => setFilter(on ? filter.filter((x) => x !== k) : [...filter, k])}>
              {on ? "✓ " : ""}{k} {counts.get(k) ?? 0}
            </button>
          );
        })}
      </div>

      {!list && <p className="small">불러오는 중이에요…</p>}
      {list && shown.length === 0 && <div className="msg info">해당하는 회원이 없어요.</div>}
      {/* 휴대폰: 한 줄 목록(아바타 · 이름/직책 · 회사·클럽 · 구분 칩 · 수정) */}
      {shown.length > 0 && (
        <ul className="rows bleed only-narrow" aria-label="회원 목록">
          {shown.map((m, i) => (
            <Fragment key={m.id}>
            <li className={`mrow${editId === m.id ? " open" : ""}`} ref={dsNarrow.item(i).ref} style={{ ...dsNarrow.item(i).style, paddingLeft: 4, gap: 6 }}>
              <DragHandle plain {...dsNarrow.handle(i, m.name)} />
              <Avatar member={m} size={36} />
              <span className="who">
                <b style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                  <span style={{ font: "inherit", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}{m.position ? <small>{m.position}</small> : null}</span>
                  {m.app && <AppLabel app={m.app} />}
                </b>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[[m.company, m.title].filter(Boolean).join(" "), clubsText(m.clubs ?? []), m.approvedAt ? `승인 ${fmtDate(m.approvedAt)}` : ""].filter(Boolean).join(" · ") || "정보를 입력해 주세요"}</span>
                {m.genderEdit && (
                  <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                    <span className="chip warn">성별 회원 수정 ({m.genderEdit.from || "없음"}→{m.genderEdit.to})</span>
                    <button className="mini" type="button" style={{ minHeight: 32 }} onClick={() => ackGender(m)}>확인</button>
                  </span>
                )}
              </span>
              {/* 한 줄: 회원구분 · 프로필 북 체크 · 삭제 · 수정(맨 오른쪽) */}
              <span className={`chip ${isWithdrawn(m.kind) ? "red" : "line"}`} style={{ flex: "none", whiteSpace: "nowrap" }}>{m.kind || "미지정"}</span>
              <label className="small" title="프로필 북 노출" style={{ display: "inline-flex", alignItems: "center", gap: 2, cursor: "pointer", whiteSpace: "nowrap", fontSize: fs(11), flex: "none" }}>
                <input type="checkbox" checked={inBook(m)} onChange={() => toggleBook(m)} style={{ width: 16, height: 16 }} aria-label={`${m.name} 프로필 북 노출`} />북
              </label>
              <button className="edit" type="button" aria-label={`${m.name} 삭제`} title="삭제" style={{ color: "var(--red-t)", width: 36 }} onClick={() => remove(m)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
              </button>
              <button className="edit" type="button" aria-label={`${m.name} 수정`} aria-expanded={editId === m.id} title="수정" style={{ width: 36, marginRight: -8 }} onClick={() => startEdit(m)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </button>
            </li>
            {/* 회원 수정: 이 줄 바로 아래로 펼친다 */}
            {editId === m.id && <li className="medit" data-medit={m.id} aria-label={`${m.name} 회원 수정`}>{memberForm}</li>}
            </Fragment>
          ))}
        </ul>
      )}
      {list && <p className="small only-narrow" style={{ margin: 0, fontSize: fs(12) }}>⠿ 손잡이를 끌어서 순서를 바꾸고(바로 저장돼요), 휴지통 아이콘으로 삭제, 맨 오른쪽 연필 아이콘으로 수정해요. “북” 체크를 끄면 그 회원은 프로필 북에서 빠져요. 권한·연락처 등 전체 항목은 넓은 화면(PC)의 표에서 볼 수 있어요. 회원정보(회사·연락처·생년월일)는 관리자에게만 보여요.</p>}
      {list && <p className="small only-wide" style={{ margin: 0, fontSize: fs(12) }}>NO 옆 ⠿ 손잡이를 끌어서 순서를 바꿔요(바로 저장돼요). “프로필북” 체크를 끄면 그 회원은 프로필 북에서 빠져요(회원도 설정에서 바꿀 수 있어요). 회원정보(회사·연락처·생년월일)는 관리자에게만 보이고 일반 회원에게는 노출되지 않아요.</p>}
      {shown.length > 0 && (
        <div className="tblw only-wide">
          <table className="tbl" style={{ minWidth: 1200 + custom.length * 110 }}>
            <thead><tr><th>NO</th><th>성명</th><th>구분</th><th>승인일</th><th>교육이수</th><th>프로필북</th><th>직책</th><th>클럽</th><th>성별</th><th>회사명</th><th>직위</th><th>생년월일</th><th>연락처</th>{custom.map((c) => <th key={c}>{c}</th>)}<th>메모</th><th>권한</th><th></th></tr></thead>
            <tbody>
              {shown.map((m, i) => (
                <Fragment key={m.id}>
                <tr ref={dsWide.item(i).ref} style={dsWide.item(i).style} className={editId === m.id ? "open" : undefined}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><DragHandle plain {...dsWide.handle(i, m.name)} />{m.no}</span>
                  </td>
                  <td><b>{m.name}</b></td>
                  <td>{isWithdrawn(m.kind) ? <span className="chip red">탈퇴회원</span> : m.kind}{m.kind && !isWithdrawn(m.kind) && !kinds.some((k) => k.value === m.kind) && <span className="small">{OFF}</span>}{m.app && <> {m.app && <AppLabel app={m.app} />}</>}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{m.approvedAt ? fmtDate(m.approvedAt) : <span className="small">-</span>}</td>
                  <td className="center">{m.edu ? "YES" : "NO"}</td>
                  <td className="center">
                    <input type="checkbox" checked={inBook(m)} onChange={() => toggleBook(m)} style={{ width: 18, height: 18, cursor: "pointer" }}
                      aria-label={`${m.name} 프로필 북 노출`} title={m.bookHidden === "true" ? "프로필 북에서 빠져 있어요" : "프로필 북에 보여요"} />
                  </td>
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
                  <td style={{ maxWidth: 220, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} className="small">{m.memo}</td>
                  <td>{(m.effective ?? []).map((p) => <span key={p} className={`pill ${p === "all" ? "ok" : "blue"}`} style={{ marginRight: 4 }}>{PERM_LABELS[p] ?? p}</span>)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="mini danger" type="button" onClick={() => remove(m)}>삭제</button>{" "}
                    <button className="mini" type="button" aria-expanded={editId === m.id} onClick={() => startEdit(m)}>{editId === m.id ? "접기" : "수정"}</button>
                  </td>
                </tr>
                {/* 회원 수정: 이 줄 바로 아래로 펼친다(표가 넓어도 화면 왼쪽에 붙어 보이게) */}
                {editId === m.id && (
                  <tr className="medit-tr">
                    <td colSpan={15 + custom.length}>
                      <div className="medit" data-medit={m.id} aria-label={`${m.name} 회원 수정`}>{memberForm}</div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function MembersPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/members"><AdminIssues /><Members /></AdminGate>;
}
