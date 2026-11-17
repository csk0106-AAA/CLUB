"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudiencePicker } from "@/components/AudiencePicker";
import type { Audience } from "@/lib/audience";
import {
  checkFileType, FILE_ACCEPT, FORM_HINT, FORM_LABEL, fmtSize, IMAGE_ACCEPT, MAX_FILE_BYTES, MAX_FILES,
  type FileMeta, type Form, WRITE_FORMS,
} from "@/lib/board";
import { api } from "@/lib/client";
import { FormFields } from "./FormFields";
import { fileUrl, type BoardMeta, type PostFull } from "./types";
import { fs } from "@/lib/fs";

type Note = { tone: "bad" | "info"; text: string } | null;

// "AI에게 작성 요청하기": 요청을 적으면 AI가 제목·내용 초안을 만든다. 초안은 미리 보고 "내용에 넣기"를 눌러야
// 제목·내용 칸에 들어가고, 넣은 뒤에는 칸에서 직접 고쳐서 올린다(AI가 바로 올리지 않는다).
function AiDraftBox({ form, title, body, onApply }: { form: Form; title: string; body: string; onApply: (title: string, body: string) => void }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [useCur, setUseCur] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const hasCur = !!(title.trim() || body.trim());

  async function ask() {
    setBusy(true);
    setErr("");
    const r = await api<{ title: string; body: string }>("/api/board/ai-draft", {
      body: { form, request, ...(useCur && hasCur ? { title, body } : {}) },
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDraft(r.data);
  }

  function apply() {
    if (!draft) return;
    if (body.trim() && !window.confirm("지금 적힌 제목·내용이 AI 초안으로 바뀌어요. 바꿀까요?")) return;
    onApply(draft.title, draft.body);
    setDraft(null);
    setOpen(false);
    setRequest("");
  }

  if (!open) {
    return (
      <button className="btn white" type="button" style={{ alignSelf: "flex-start", width: "auto", minHeight: 44, fontSize: fs(15) }} onClick={() => setOpen(true)}>
        ✨ AI에게 작성 요청하기
      </button>
    );
  }
  return (
    <section className="card" aria-label="AI에게 작성 요청하기" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--soft)" }}>
      <b style={{ font: `700 ${fs(16)} var(--display)` }}>✨ AI에게 작성 요청하기</b>
      <label className="small" htmlFor={`${uid}-r`}>어떤 글을 쓸지 알려 주세요. 날짜·장소·금액처럼 꼭 들어갈 내용을 함께 적으면 더 정확해요.</label>
      <textarea id={`${uid}-r`} className="field" rows={3} maxLength={2000} style={{ padding: 10, lineHeight: 1.5 }}
        placeholder="예) 12월 정기모임 안내 글. 12월 10일 저녁 7시, 광화문 ○○호텔, 회비 5만 원, 참석 여부는 댓글로."
        value={request} onChange={(e) => setRequest(e.target.value)} />
      {hasCur && (
        <label className="row" style={{ gap: 8, fontSize: fs(14), cursor: "pointer" }}>
          <input type="checkbox" checked={useCur} onChange={(e) => setUseCur(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span>지금 적어 둔 제목·내용도 참고하게 하기</span>
        </label>
      )}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="mini" type="button" disabled={busy || !request.trim()} onClick={ask}>{busy ? "AI가 쓰는 중…" : draft ? "다시 요청하기" : "초안 만들기"}</button>
        <button className="mini" type="button" disabled={busy} onClick={() => { setOpen(false); setDraft(null); setErr(""); }}>닫기</button>
      </div>
      {err && <div className="msg bad" role="alert">{err}</div>}
      {draft && (
        <div className="card" role="region" aria-label="AI 초안" style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--card, #fff)" }}>
          <span className="small">AI 초안 · “내용에 넣기”를 누른 뒤 위 제목·내용 칸에서 직접 고칠 수 있어요.</span>
          {draft.title && <b style={{ overflowWrap: "anywhere" }}>{draft.title}</b>}
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, overflowWrap: "anywhere", maxHeight: 320, overflowY: "auto" }}>{draft.body}</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="mini" type="button" style={{ fontWeight: 700 }} onClick={apply}>내용에 넣기</button>
            <button className="mini" type="button" onClick={() => setDraft(null)}>버리기</button>
          </div>
        </div>
      )}
    </section>
  );
}
const ALL_AUD: Audience = { mode: "all", events: [], clubs: [], memberIds: [] };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// 글쓰기·수정 화면(회칙·회비 글은 관리 화면에서 올린다). 양식을 고르면 그 양식의 기본 템플릿(제목·내용·양식 내용)을 불러온다.
// 팝업 창 안에서 쓸 때: onDone(저장 후 글 id), onCancel(취소), onDirty(작성 중인지) 를 넘긴다.
export function PostEditor({ initial, onDone, onCancel, onDirty }: {
  initial?: PostFull;
  onDone?: (id: string) => void;
  onCancel?: () => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [meta, setMeta] = useState<BoardMeta | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [form, setForm] = useState<Form | null>(initial?.form ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [data, setData] = useState<Record<string, unknown>>(initial?.data ?? {});
  const [audience, setAudience] = useState<Audience>(initial?.audience ?? ALL_AUD);
  const [notice, setNotice] = useState(initial?.notice ?? false);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [files, setFiles] = useState<FileMeta[]>(initial?.files ?? []);
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState(initial?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onDirty?.(dirty || pending.length > 0);
  }, [dirty, pending.length, onDirty]);

  useEffect(() => {
    api<BoardMeta>("/api/board/meta").then((r) => {
      if (r.ok) setMeta(r.data);
      else if (r.status === 401) router.replace("/");
      else setNote({ tone: "bad", text: r.error });
    });
  }, [router]);

  const touch = <T,>(fn: (v: T) => void) => (v: T) => { setDirty(true); fn(v); };

  function pickForm(f: Form) {
    if (!meta) return;
    if (form && dirty && f !== form && !window.confirm("양식을 바꾸면 지금 적은 내용이 그 양식의 기본 템플릿으로 바뀌어요. 바꿀까요?")) return;
    const t = meta.templates[f];
    setForm(f);
    setTitle(t.title);
    setBody(t.body);
    setData(clone(t.data));
    setDirty(false);
    setNote(null);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const errs: string[] = [];
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (files.length + pending.length + ok.length >= MAX_FILES) { errs.push(`파일은 글 하나에 ${MAX_FILES}개까지 올릴 수 있어요.`); break; }
      if (!checkFileType(f.name, f.type)) { errs.push(`“${f.name}”은 올릴 수 없는 형식이에요.`); continue; }
      if (f.size > MAX_FILE_BYTES) { errs.push(`“${f.name}”은 4MB보다 커요.`); continue; }
      if (f.size === 0) { errs.push(`“${f.name}”은 빈 파일이에요.`); continue; }
      ok.push(f);
    }
    setPending((p) => [...p, ...ok]);
    if (ok.length) setDirty(true);
    setNote(errs.length ? { tone: "bad", text: errs.join(" ") } : null);
  }

  async function removeSaved(f: FileMeta) {
    if (!window.confirm(`“${f.name}” 파일을 지울까요? 바로 지워져요.`)) return;
    const r = await api(`/api/board/files/${encodeURIComponent(f.id)}`, { method: "DELETE" });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setFiles((l) => l.filter((x) => x.id !== f.id));
  }

  async function upload(id: string): Promise<string[]> {
    const fails: string[] = [];
    const left: File[] = [];
    for (const f of pending) {
      const fd = new FormData();
      fd.append("file", f, f.name);
      try {
        const r = await fetch(`/api/board/${encodeURIComponent(id)}/files`, { method: "POST", body: fd });
        const j = (await r.json().catch(() => ({}))) as { file?: FileMeta; error?: string };
        if (r.ok && j.file) setFiles((l) => [...l, j.file as FileMeta]);
        else { fails.push(`“${f.name}”: ${j.error ?? "올리지 못했어요."}`); left.push(f); }
      } catch {
        fails.push(`“${f.name}”: 연결이 불안정해요.`);
        left.push(f);
      }
    }
    setPending(left);
    return fails;
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setNote(null);
    const payload = { form, title, body, data, audience, notice, pinned };
    const r = savedId
      ? await api<{ id: string }>(`/api/board/${encodeURIComponent(savedId)}`, { method: "PATCH", body: payload })
      : await api<{ id: string }>("/api/board", { body: payload });
    if (!r.ok) {
      setBusy(false);
      return setNote({ tone: "bad", text: r.error });
    }
    const id = r.data.id;
    setSavedId(id);
    const fails = pending.length ? await upload(id) : [];
    setBusy(false);
    setDirty(false);
    if (fails.length) return setNote({ tone: "bad", text: `글은 저장했지만 파일 몇 개를 올리지 못했어요. ${fails.join(" ")} 다시 “저장”을 누르면 남은 파일을 올려요.` });
    if (onDone) onDone(id);
    else router.push(`/board/${id}`);
  }

  async function saveTemplate(reset = false) {
    if (!form) return;
    if (reset && !window.confirm(`“${FORM_LABEL[form]}” 양식을 처음 기본 템플릿으로 되돌릴까요?`)) return;
    const r = await api("/api/board/templates", { method: "PUT", body: reset ? { form, reset: true, data: {} } : { form, title, body, data } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: reset ? "기본 템플릿을 처음 값으로 되돌렸어요." : `지금 내용을 “${FORM_LABEL[form]}” 양식의 기본 템플릿으로 저장했어요.` });
    const m = await api<BoardMeta>("/api/board/meta");
    if (m.ok) setMeta(m.data);
  }

  if (!meta) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  if (!initial && !meta.me.canWrite) return <div className="msg bad" role="alert">글은 관리자와 소모임 직책자만 쓸 수 있어요.</div>;

  const forms = WRITE_FORMS;
  const canTpl = meta.me.tplAdmin && !!form;
  const images = files.filter((f) => f.image);
  const docs = files.filter((f) => !f.image);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!initial && (
        <fieldset className="card" style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <legend style={{ font: `700 ${fs(16)} var(--display)`, padding: "0 4px" }}>양식</legend>
          <div className="pick" role="radiogroup" aria-label="양식" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {forms.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={form === f} aria-pressed={form === f} className="opt" style={{ minHeight: 0, padding: "10px 12px" }} onClick={() => pickForm(f)}>
                <span style={{ font: `700 ${fs(16)} var(--display)` }}>{FORM_LABEL[f]}</span>
                <span className="small" style={{ fontSize: fs(13) }}>{FORM_HINT[f]}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {initial && <span className="pill blue" style={{ alignSelf: "flex-start" }}>{FORM_LABEL[initial.form]}</span>}

      {form && (
        <>
          <div>
            <label className="l" htmlFor={`${uid}-t`}>제목</label>
            <input id={`${uid}-t`} className="field" maxLength={100} value={title} onChange={(e) => touch(setTitle)(e.target.value)} />
          </div>
          <div>
            <label className="l" htmlFor={`${uid}-b`}>내용</label>
            <textarea id={`${uid}-b`} className="field" rows={form === "general" ? 10 : 5} maxLength={10000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }} value={body} onChange={(e) => touch(setBody)(e.target.value)} />
          </div>

          {meta.aiEnabled && (
            <AiDraftBox form={form} title={title} body={body} onApply={(t, b) => { setDirty(true); if (t) setTitle(t); setBody(b); }} />
          )}

          <FormFields form={form} data={data} onChange={touch(setData)} kinds={meta.kinds} positions={meta.positions} agendaLabels={meta.agendaLabels} />

          <AudiencePicker value={audience} onChange={touch(setAudience)} />

          <div className="checks" role="group" aria-label="게시 옵션">
            <label><input type="checkbox" checked={notice} onChange={(e) => touch(setNotice)(e.target.checked)} />공지 (목록에 공지 표시)</label>
            <label><input type="checkbox" checked={pinned} onChange={(e) => touch(setPinned)(e.target.checked)} />상단 고정</label>
          </div>

          <section className="card" aria-label="사진과 파일" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: `700 ${fs(16)} var(--display)` }}>사진 · 파일</b>
            <span className="small">사진(jpg, png, webp, gif)과 문서(pdf, 오피스, hwp, zip, txt)를 하나에 4MB까지, 글 하나에 {MAX_FILES}개까지 올릴 수 있어요.</span>
            {images.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {images.map((f) => (
                  <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 4, width: 96 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(f.id)} alt={f.name} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
                    <button className="mini danger" type="button" aria-label={`${f.name} 지우기`} onClick={() => removeSaved(f)}>지우기</button>
                  </div>
                ))}
              </div>
            )}
            {docs.map((f) => (
              <div key={f.id} className="row">
                <span className="grow" style={{ overflowWrap: "anywhere" }}>📎 {f.name} <span className="small">({fmtSize(f.size)})</span></span>
                <button className="mini danger" type="button" aria-label={`${f.name} 지우기`} onClick={() => removeSaved(f)}>지우기</button>
              </div>
            ))}
            {pending.map((f, i) => (
              <div key={`${f.name}-${i}`} className="row">
                <span className="grow" style={{ overflowWrap: "anywhere" }}>{checkFileType(f.name, f.type)?.image ? "🖼" : "📎"} {f.name} <span className="small">({fmtSize(f.size)} · 저장할 때 올라가요)</span></span>
                <button className="mini" type="button" aria-label={`${f.name} 빼기`} onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>빼기</button>
              </div>
            ))}
            <div className="row" style={{ flexWrap: "wrap" }}>
              <input ref={imgRef} type="file" accept={IMAGE_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={fileRef} type="file" accept={FILE_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <button className="mini" type="button" disabled={files.length + pending.length >= MAX_FILES} onClick={() => imgRef.current?.click()}>+ 사진 올리기</button>
              <button className="mini" type="button" disabled={files.length + pending.length >= MAX_FILES} onClick={() => fileRef.current?.click()}>+ 파일 올리기</button>
            </div>
          </section>

          {meta.me.manage && form && (
            <section className="card" aria-label="양식 템플릿" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--soft)" }}>
              <b>양식 템플릿 (관리자)</b>
              {canTpl ? (
                <>
                  <span className="small">지금 적은 제목·내용·양식 내용을 “{FORM_LABEL[form]}” 양식을 고를 때 처음 불러오는 기본값으로 저장해요.</span>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <button className="mini" type="button" onClick={() => saveTemplate(false)}>이 양식의 기본 템플릿으로 저장</button>
                    <button className="mini" type="button" onClick={() => saveTemplate(true)}>처음 기본값으로 되돌리기</button>
                  </div>
                </>
              ) : (
                <span className="small">템플릿을 바꾸려면 관리자 탭에서 관리자 비밀번호를 먼저 확인해 주세요.</span>
              )}
            </section>
          )}

          {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
          <div className="footer-actions">
            <button className="btn" type="button" disabled={busy || !title.trim()} onClick={save}>{busy ? "저장하는 중…" : savedId ? "저장" : "올리기"}</button>
            <button className="btn white" type="button" onClick={() => (onCancel ? onCancel() : router.push(savedId ? `/board/${savedId}` : "/board"))}>{savedId ? "글로 돌아가기" : "취소"}</button>
          </div>
        </>
      )}
      {!form && note && <div className={`msg ${note.tone}`} role="alert">{note.text}</div>}
    </div>
  );
}
