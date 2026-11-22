"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popup } from "./Popup";
import { PhotoComments } from "./PhotoComments";
import { useDragScroll } from "./useDragScroll";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { MAX_SOURCE, shrink } from "@/lib/image-shrink";
import { limitMessage } from "@/lib/photo-limit";
import { zipSync } from "fflate";

// 일정 사진첩: 참석한 회원이 사진을 올리고 함께 본다(회원 일정 화면, 일정관리·클럽관리 › 일정 › 사진첩 탭).
// 사진은 이 기기에서 긴 변 1600px(원본)·400px(미리보기) JPEG 로 다시 그려 올린다(위치 정보 같은 EXIF 는 따라가지 않는다).
// 서버: /api/events/[id]/photos (lib/event-photos.ts)

type Photo = {
  id: string; memberId: string; name: string; caption: string; w: number; h: number;
  likes: number; liked: boolean; mine: boolean; createdAt: string;
};
// max: 이 일정의 최대 장수, requested: 내가 이미 장수 늘리기를 요청했는지
type List = { photos: Photo[]; canUpload: boolean; manager: boolean; attending: boolean; max: number; requested?: boolean };

const PREVIEW = 9; // 처음 보여 줄 사진 수(더 보기로 펼친다)

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const src = (eventId: string, id: string, thumb?: boolean) => `/api/events/${eventId}/photos/${id}${thumb ? "?size=thumb" : ""}`;

export function EventPhotos({ eventId, admin, carousel }: { eventId: string; admin?: boolean; carousel?: boolean }) {
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"new" | "best" | "mine">("new");
  const [more, setMore] = useState(!!admin);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 장수가 찼을 때 "관리자 요청 / 취소" 창
  const [full, setFull] = useState(false);
  const [reqNote, setReqNote] = useState("");
  // PC 마우스로 사진 줄을 잡고 끌어 넘기기(components/useDragScroll.ts)
  const dragHandlers = useDragScroll("start");
  // 전체 사진 내려받기: 이 기기에서 사진을 하나씩 받아 zip 파일 하나로 묶는다(서버 응답 크기 제한을 피하려고 화면에서 묶는다)
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  async function downloadAll() {
    if (!list || list.photos.length === 0 || zipping) return;
    const all = list.photos;
    setZipping({ done: 0, total: all.length });
    const files: Record<string, [Uint8Array, { level: 0 }]> = {};
    let failed = 0;
    for (let i = 0; i < all.length; i++) {
      const res = await fetch(src(eventId, all[i].id), { cache: "force-cache" }).catch(() => null);
      if (res?.ok) {
        const type = res.headers.get("content-type") ?? "";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const who = (all[i].name || "회원").replace(/[\\/:*?"<>|]/g, ""); // 파일 이름에 못 쓰는 글자 빼기
        files[`${String(i + 1).padStart(3, "0")}_${who}.${ext}`] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }]; // 사진은 이미 압축돼 있어 묶기만 한다
      } else failed++;
      setZipping({ done: i + 1, total: all.length });
    }
    setZipping(null);
    if (Object.keys(files).length === 0) return setError("사진을 받지 못했어요. 잠시 후 다시 눌러 주세요.");
    const blob = new Blob([new Uint8Array(zipSync(files))], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `사진첩-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    if (failed) setError(`${failed}장은 받지 못해서 빼고 묶었어요.`);
  }
  const dlIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
  // "+ 사진" 옆: 전체 ⬇ (사진이 있을 때)
  const dlAll = (cls: string) => list && list.photos.length > 0 && (
    <button type="button" className={cls} disabled={!!zipping} onClick={downloadAll} aria-label={`사진 ${list.photos.length}장 모두 내려받기(zip)`} title="사진 전체 내려받기(zip 파일)">
      {zipping ? `받는 중 ${zipping.done}/${zipping.total}` : <>전체 {dlIcon}</>}
    </button>
  );

  const load = useCallback(async () => {
    const r = await api<List>(`/api/events/${eventId}/photos`);
    if (r.ok) setList(r.data);
    else if (r.status !== 404) setError(r.error);
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  // 볼 수 없는 일정(참석 대상이 아님)이면 사진첩을 그리지 않는다
  if (!list) return error ? <div className="msg bad" role="alert">{error}</div> : null;

  const photos = [...list.photos]
    .filter((p) => sort !== "mine" || p.mine)
    .sort((a, b) => (sort === "best" ? b.likes - a.likes || b.createdAt.localeCompare(a.createdAt) : 0));
  const shown = more ? photos : photos.slice(0, PREVIEW);
  const people = new Set(list.photos.map((p) => p.memberId)).size;
  const cur = open ? photos.find((p) => p.id === open) ?? null : null;
  const curIdx = cur ? photos.indexOf(cur) : -1;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const pick = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (pick.length === 0) return setError("사진 파일을 골라 주세요.");
    // 이미 가득 찼으면 올리지 않고 "관리자 요청" 창을 연다
    if (list && list.photos.length >= list.max) {
      if (fileRef.current) fileRef.current.value = "";
      return void (carousel ? setFull(true) : setError(`${limitMessage(list?.max ?? 0)} 관리자는 개요 탭의 “사진 최대 장수”에서 늘릴 수 있어요.`));
    }
    const errs: string[] = [];
    let hitLimit = false;
    setProgress({ done: 0, total: pick.length });
    for (let i = 0; i < pick.length; i++) {
      const f = pick[i];
      try {
        if (f.size > MAX_SOURCE) throw new Error("원본 사진이 너무 커요(30MB까지).");
        const { full, thumb } = await shrink(f);
        const fd = new FormData();
        fd.append("file", new File([full.blob], "photo.jpg", { type: "image/jpeg" }));
        fd.append("thumb", new File([thumb.blob], "thumb.jpg", { type: "image/jpeg" }));
        fd.append("w", String(full.w));
        fd.append("h", String(full.h));
        const res = await fetch(`/api/events/${eventId}/photos`, { method: "POST", body: fd, cache: "no-store" }).catch(() => null);
        if (!res) throw new Error("연결이 불안정해요.");
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; limit?: boolean };
          if (data.limit) { hitLimit = true; break; } // 장수가 차면 멈추고 "관리자 요청" 창
          throw new Error(data.error ?? "올리지 못했어요.");
        }
      } catch (e) {
        const m = e instanceof Error && e.message && !/canvas|encode|decode/i.test(e.message) ? e.message : "이 기기에서 열 수 없는 사진이에요.";
        errs.push(`${f.name}: ${m}`);
        if (/까지 올릴 수 있어요/.test(m)) break; // 장수 한도에 닿으면 멈춘다
      }
      setProgress({ done: i + 1, total: pick.length });
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
    if (errs.length) setError(errs.slice(0, 3).join("\n") + (errs.length > 3 ? `\n외 ${errs.length - 3}장` : ""));
    await load();
    if (hitLimit) carousel ? setFull(true) : setError(`${limitMessage(list?.max ?? 0)} 관리자는 개요 탭의 “사진 최대 장수”에서 늘릴 수 있어요.`);
  }

  // 관리자에게 장수 늘리기 요청(그 일정을 관리하는 관리자에게 알림 + 처리할 일)
  async function askAdmin() {
    const r = await api<{ already: boolean }>(`/api/events/${eventId}/photos/request`, { method: "POST" });
    setFull(false);
    if (!r.ok) return setError(r.error);
    setList((l) => l && { ...l, requested: true });
    setReqNote(r.data.already ? "이미 요청했어요. 관리자가 장수를 늘리면 다시 올릴 수 있어요." : "관리자에게 요청했어요. 장수가 늘어나면 다시 올릴 수 있어요.");
  }

  async function like(p: Photo) {
    // 화면 먼저 바꾸고 서버에 알린다
    setList((l) => l && { ...l, photos: l.photos.map((x) => (x.id === p.id ? { ...x, liked: !p.liked, likes: x.likes + (p.liked ? -1 : 1) } : x)) });
    const r = await api<{ photo: Photo }>(`/api/events/${eventId}/photos/${p.id}`, { method: "PATCH", body: { like: !p.liked } });
    if (r.ok) setList((l) => l && { ...l, photos: l.photos.map((x) => (x.id === p.id ? r.data.photo : x)) });
  }

  async function caption(p: Photo) {
    const v = window.prompt("사진 설명(100자까지)", p.caption);
    if (v === null) return;
    const r = await api<{ photo: Photo }>(`/api/events/${eventId}/photos/${p.id}`, { method: "PATCH", body: { caption: v } });
    if (!r.ok) return setError(r.error);
    setList((l) => l && { ...l, photos: l.photos.map((x) => (x.id === p.id ? r.data.photo : x)) });
  }

  async function remove(p: Photo) {
    if (!window.confirm(p.mine ? "이 사진을 지울까요?" : `${p.name} 님이 올린 사진을 지울까요?`)) return;
    const r = await api(`/api/events/${eventId}/photos/${p.id}`, { method: "DELETE" });
    if (!r.ok) return setError(r.error);
    setOpen(null);
    await load();
  }

  const chip = (k: typeof sort, label: string) => (
    <button key={k} type="button" className={`ph-sort${sort === k ? " on" : ""}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>
  );

  // 사진 크게 보기 창(두 모양이 함께 쓴다)
  const viewer = (
    <Popup id="event-photo" open={!!cur} onClose={() => setOpen(null)} title={cur ? `${cur.name} 님의 사진` : "사진"} width={720}
      footer={cur && (cur.mine || list.manager) && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {(cur.mine || list.manager) && <button type="button" className="btn white" style={{ width: "auto" }} onClick={() => caption(cur)}>설명 {cur.caption ? "고치기" : "쓰기"}</button>}
          {(cur.mine || list.manager) && <button type="button" className="btn white" style={{ width: "auto", color: "var(--red-t)" }} onClick={() => remove(cur)}>지우기</button>}
        </div>
      )}>
      {cur && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="ph-view">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(eventId, cur.id)} alt={cur.caption || `${cur.name} 님이 올린 사진`} />
            {curIdx > 0 && <button type="button" className="ph-nav l" aria-label="이전 사진" onClick={() => setOpen(photos[curIdx - 1].id)}>‹</button>}
            {curIdx < photos.length - 1 && <button type="button" className="ph-nav r" aria-label="다음 사진" onClick={() => setOpen(photos[curIdx + 1].id)}>›</button>}
            {/* 사진 오른쪽 아래: 좋아요 · 내려받기(목록 사진과 같은 아이콘) */}
            <div className="ph-acts">
              <button type="button" className={`ph-act${cur.liked ? " on" : ""}`} aria-pressed={cur.liked} aria-label={`좋아요 ${cur.likes}개${cur.liked ? ", 누름" : ""}`} onClick={() => like(cur)}>
                <span aria-hidden="true">{cur.liked ? "♥" : "♡"}</span>{cur.likes > 0 && <span>{cur.likes}</span>}
              </button>
              <a className="ph-act" href={`${src(eventId, cur.id)}?dl=1`} download aria-label={`${cur.name} 님의 사진 내려받기`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
              </a>
            </div>
          </div>
          {cur.caption && <p style={{ margin: 0, overflowWrap: "anywhere" }}>{cur.caption}</p>}
          <span className="small">{cur.name} · {when(cur.createdAt)} · {curIdx + 1}/{photos.length}</span>
          {/* 사진 댓글: 좋아요·답글 */}
          <PhotoComments eventId={eventId} photoId={cur.id} canWrite />
        </div>
      )}
    </Popup>
  );

  const picker = list.canUpload && <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />;

  // 회원 일정 화면: 세로로 긴 사진을 옆으로 넘겨 보기. 사진마다 ♥ 좋아요·⬇ 내려받기, 오른쪽 위 "+ 사진"으로 올리기
  if (carousel) {
    return (
      <section className="card ph-card ph-carousel" aria-label="사진첩">
        <div className="row" style={{ gap: 8 }}>
          <span className="grow" style={{ minWidth: 0 }}>
            <b style={{ font: `700 ${fs(18)} var(--display)` }}>사진첩</b>
            {list.photos.length > 0 && <span className="small" style={{ marginLeft: 8 }}>{list.photos.length}/{list.max}장 · {people}명</span>}
          </span>
          {picker}
          {list.canUpload && (
            <button type="button" className="ph-add" disabled={!!progress} onClick={() => fileRef.current?.click()} aria-label="사진 올리기">
              {progress ? `올리는 중 ${progress.done}/${progress.total}` : "+ 사진"}
            </button>
          )}
          {dlAll("ph-add ph-dl")}
        </div>
        {progress && (
          <div className="ph-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="사진 올리는 중">
            <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
        {error && <div className="msg bad" role="alert" style={{ whiteSpace: "pre-line" }}>{error}</div>}
        {reqNote && <div className="msg info" role="status">{reqNote}</div>}
        {/* 정렬: 최신순 / 베스트(좋아요 많은 순) / 내 사진 */}
        {list.photos.length > 0 && (
          <div className="row" style={{ gap: 6, marginRight: 16 }} role="group" aria-label="사진 정렬">
            {chip("new", "최신순")}
            {chip("best", "베스트 ♥")}
            {list.photos.some((x) => x.mine) && chip("mine", "내 사진")}
          </div>
        )}
        {list.photos.length === 0 ? (
          <div className="ph-empty">
            <span>{list.canUpload ? "아직 사진이 없어요. “+ 사진”으로 첫 사진을 올려 주세요!" : list.attending ? "아직 사진이 없어요." : "참석 신청한 회원이 사진을 올릴 수 있어요."}</span>
          </div>
        ) : (
          <ul className="ph-track" aria-label="사진 목록(옆으로 넘겨 보기)" {...dragHandlers}>
            {photos.map((p, i) => (
              <li key={p.id} className="ph-slide">
                <button type="button" className="ph-open" onClick={() => setOpen(p.id)} aria-label={`${i + 1}/${photos.length}: ${p.name} 님의 사진${p.caption ? `, ${p.caption}` : ""} 크게 보기`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src(eventId, p.id)} alt="" loading={i < 2 ? "eager" : "lazy"} decoding="async" />
                </button>
                <div className="ph-acts">
                  <button type="button" className={`ph-act${p.liked ? " on" : ""}`} aria-pressed={p.liked} aria-label={`좋아요 ${p.likes}개${p.liked ? ", 누름" : ""}`} onClick={() => like(p)}>
                    <span aria-hidden="true">{p.liked ? "♥" : "♡"}</span>{p.likes > 0 && <span>{p.likes}</span>}
                  </button>
                  <a className="ph-act" href={`${src(eventId, p.id)}?dl=1`} download aria-label={`${p.name} 님의 사진 내려받기`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                  </a>
                  {/* 내가 올린 사진만: 지우기 */}
                  {p.mine && (
                    <button type="button" className="ph-act" aria-label="내 사진 지우기" onClick={() => remove(p)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!list.canUpload && list.photos.length > 0 && !list.attending && <p className="small" style={{ margin: 0 }}>좋아요·댓글·내려받기는 누구나 할 수 있고, 사진은 참석 신청한 회원이 올려요.</p>}
        {viewer}
        {/* 장수가 찼을 때: 관리자 요청 / 취소 */}
        <Popup id="photo-full" open={full} onClose={() => setFull(false)} title="사진이 가득 찼어요" width={420}
          footer={
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn white" style={{ width: "auto", minWidth: 96 }} onClick={() => setFull(false)}>취소</button>
              {!list.requested && <button type="button" className="btn" style={{ width: "auto", minWidth: 120 }} onClick={askAdmin}>관리자 요청</button>}
            </div>
          }>
          <p style={{ margin: 0 }}>{limitMessage(list.max)}</p>
          {list.requested && <p className="small" style={{ margin: 0 }}>이미 요청했어요. 관리자가 장수를 늘리면 다시 올릴 수 있어요.</p>}
        </Popup>
      </section>
    );
  }

  return (
    <section className="card ph-card" aria-label="사진첩">
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <span className="grow" style={{ minWidth: 0 }}>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>📸 사진첩</b>
          <span className="small" style={{ display: "block" }}>
            {list.photos.length ? `사진 ${list.photos.length}장 · ${people}명이 올렸어요` : "함께한 순간을 모아 봐요"}
          </span>
        </span>
        {list.canUpload && (
          <>
            {picker}
            <button type="button" className="btn ph-up" disabled={!!progress} onClick={() => fileRef.current?.click()} aria-label="사진 올리기">
              {progress ? `올리는 중 ${progress.done}/${progress.total}` : "+ 사진"}
            </button>
          </>
        )}
        {dlAll("btn white ph-up ph-dl")}
      </div>

      {progress && (
        <div className="ph-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="사진 올리는 중">
          <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      {error && <div className="msg bad" role="alert" style={{ whiteSpace: "pre-line" }}>{error}</div>}

      {list.photos.length > 0 && (
        <div className="row" style={{ gap: 6 }} role="group" aria-label="사진 정렬">
          {chip("new", "최신순")}
          {chip("best", "베스트 ♥")}
          {list.photos.some((p) => p.mine) && chip("mine", "내 사진")}
        </div>
      )}

      {list.photos.length === 0 ? (
        <div className="ph-empty">
          <span aria-hidden="true" style={{ fontSize: fs(28) }}>🖼️</span>
          <span>{list.canUpload ? "아직 사진이 없어요. 첫 사진을 올려 주세요!" : list.attending ? "아직 사진이 없어요." : "참석 신청한 회원이 사진을 올릴 수 있어요."}</span>
        </div>
      ) : (
        <ul className="ph-grid" aria-label="사진 목록">
          {shown.map((p) => (
            <li key={p.id} className="ph-cell-wrap">
              <button type="button" className="ph-cell" onClick={() => setOpen(p.id)} aria-label={`${p.name} 님의 사진${p.caption ? `: ${p.caption}` : ""} 크게 보기`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(eventId, p.id, true)} alt="" loading="lazy" decoding="async" />
              </button>
              {/* 회원 화면 사진첩과 같은 아이콘: 좋아요 · 내려받기 · 지우기(관리자는 모든 사진) */}
              <div className="ph-acts sm">
                <button type="button" className={`ph-act${p.liked ? " on" : ""}`} aria-pressed={p.liked} aria-label={`좋아요 ${p.likes}개${p.liked ? ", 누름" : ""}`} onClick={() => like(p)}>
                  <span aria-hidden="true">{p.liked ? "♥" : "♡"}</span>{p.likes > 0 && <span>{p.likes}</span>}
                </button>
                <a className="ph-act" href={`${src(eventId, p.id)}?dl=1`} download aria-label={`${p.name} 님의 사진 내려받기`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                </a>
                {(p.mine || list.manager) && (
                  <button type="button" className="ph-act" aria-label={p.mine ? "내 사진 지우기" : `${p.name} 님의 사진 지우기`} onClick={() => remove(p)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!more && photos.length > PREVIEW && (
        <button type="button" className="btn white" onClick={() => setMore(true)}>사진 {photos.length - PREVIEW}장 더 보기 ▾</button>
      )}
      {!list.canUpload && list.photos.length > 0 && !list.attending && (
        <p className="small" style={{ margin: 0 }}>좋아요·댓글·내려받기는 누구나 할 수 있고, 사진은 참석 신청한 회원이 올려요.</p>
      )}

      {viewer}
    </section>
  );
}
