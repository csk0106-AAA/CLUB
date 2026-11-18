"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popup } from "./Popup";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { MAX_SOURCE, shrink } from "@/lib/image-shrink";

// 일정 사진첩: 참석한 회원이 사진을 올리고 함께 본다(회원 일정 화면, 일정관리·클럽관리 › 일정 › 사진첩 탭).
// 사진은 이 기기에서 긴 변 1600px(원본)·400px(미리보기) JPEG 로 다시 그려 올린다(위치 정보 같은 EXIF 는 따라가지 않는다).
// 서버: /api/events/[id]/photos (lib/event-photos.ts)

type Photo = {
  id: string; memberId: string; name: string; caption: string; w: number; h: number;
  likes: number; liked: boolean; mine: boolean; createdAt: string;
};
type List = { photos: Photo[]; canUpload: boolean; manager: boolean; attending: boolean; max: number };

const PREVIEW = 9; // 처음 보여 줄 사진 수(더 보기로 펼친다)

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const src = (eventId: string, id: string, thumb?: boolean) => `/api/events/${eventId}/photos/${id}${thumb ? "?size=thumb" : ""}`;

export function EventPhotos({ eventId, admin }: { eventId: string; admin?: boolean }) {
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"new" | "best" | "mine">("new");
  const [more, setMore] = useState(!!admin);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const errs: string[] = [];
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
          const data = (await res.json().catch(() => ({}))) as { error?: string };
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
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
            <button type="button" className="btn ph-up" disabled={!!progress} onClick={() => fileRef.current?.click()}>
              {progress ? `올리는 중 ${progress.done}/${progress.total}` : "+ 사진 올리기"}
            </button>
          </>
        )}
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
            <li key={p.id}>
              <button type="button" className="ph-cell" onClick={() => setOpen(p.id)} aria-label={`${p.name} 님의 사진${p.caption ? `: ${p.caption}` : ""} 크게 보기`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(eventId, p.id, true)} alt="" loading="lazy" decoding="async" />
                {p.likes > 0 && <span className="ph-likes" aria-hidden="true">♥ {p.likes}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!more && photos.length > PREVIEW && (
        <button type="button" className="btn white" onClick={() => setMore(true)}>사진 {photos.length - PREVIEW}장 더 보기 ▾</button>
      )}
      {!list.canUpload && list.photos.length > 0 && !list.attending && (
        <p className="small" style={{ margin: 0 }}>참석 신청하면 사진을 올릴 수 있어요.</p>
      )}

      <Popup id="event-photo" open={!!cur} onClose={() => setOpen(null)} title={cur ? `${cur.name} 님의 사진` : "사진"} width={720}
        footer={cur && (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button type="button" className={`btn ${cur.liked ? "" : "white"}`} style={{ width: "auto", minWidth: 96 }} aria-pressed={cur.liked} onClick={() => like(cur)}>
              {cur.liked ? "♥" : "♡"} {cur.likes}
            </button>
            <a className="btn white" style={{ width: "auto", minWidth: 96, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              href={`${src(eventId, cur.id)}?dl=1`} download>내려받기</a>
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
            </div>
            {cur.caption && <p style={{ margin: 0, overflowWrap: "anywhere" }}>{cur.caption}</p>}
            <span className="small">{cur.name} · {when(cur.createdAt)} · {curIdx + 1}/{photos.length}</span>
          </div>
        )}
      </Popup>
    </section>
  );
}
