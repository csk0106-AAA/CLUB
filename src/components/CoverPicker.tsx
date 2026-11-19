"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { focusPos } from "@/lib/cover-focus";
import { fs } from "@/lib/fs";
import { MAX_SOURCE, shrink } from "@/lib/image-shrink";
import { Popup } from "./Popup";

type F = { x: number; y: number };
const parseFocus = (s: string | undefined): F => {
  const [x, y] = (s ?? "50,50").split(",").map(Number);
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 };
};
// 미리보기 칸: 실제로 대표사진이 보이는 칸 모양들
const SHAPES = [
  { label: "홈 카드", ratio: "4 / 3.4" },
  { label: "일정 맨 위", ratio: "4 / 3.6" },
  { label: "로그인 화면", ratio: "16 / 10" },
  { label: "작은 사진", ratio: "1 / 1" },
];

// 대표사진 올리기·바꾸기·지우기(관리자 › 모임설정 = scope "org", 클럽관리 › 개요 = scope "club" + 클럽 이름,
// 일정 관리 › 개요 = scope "event" + 일정 id(club 자리에 넘긴다)).
// 보이는 칸 모양이 사진과 다르면 "보일 중심점"을 중심으로 잘라 보인다(처음엔 가운데).
// 사진을 더블클릭하거나 "보이는 영역 조정"을 누르면 중심점을 고를 수 있다. 사진을 새로 올리면 바로 조정 창이 열린다.
// 사진은 이 기기에서 긴 변 1600px·400px JPEG 로 줄여 올린다(위치 정보 같은 EXIF 는 따라가지 않는다).
export function CoverPicker({ scope, club, title, help }: { scope: "org" | "club" | "event"; club?: string; title: string; help: string }) {
  const q = scope === "org" ? "scope=org" : `scope=${scope}&name=${encodeURIComponent(club ?? "")}`;
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [adjust, setAdjust] = useState<F | null>(null); // 조정 창(고르는 중인 중심점)
  // 회원이 올린 사진에서 고르기(일정: 그 일정 사진첩, 클럽: 그 클럽 일정들, 모임: 모든 일정)
  const [gallery, setGallery] = useState<{ id: string; eventName: string; likes: number; url: string }[] | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [choose, setChoose] = useState(false); // "사진 업로드" → 회원 사진 / 내 파일 고르기 창
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    api<{ url: string }>(`/api/admin/covers?${q}`).then((r) => (r.ok ? setUrl(r.data.url) : setNote({ tone: "bad", text: r.error })));
  }, [q]);

  const cur = parseFocus(/#f=(\d+,\d+)$/.exec(url ?? "")?.[1]);

  // 새 사진은 바로 올리지 않고 "고르는 중"(pending)으로 둔다. 조정 창에서 "저장"을 눌러야 올라가고, "취소"하면 지금 대표사진 그대로.
  const [pending, setPending] = useState<null | { kind: "file"; full: Blob; thumb: Blob; preview: string } | { kind: "photo"; photoId: string; preview: string }>(null);
  function dropPending() {
    setPending((p) => {
      if (p?.kind === "file") URL.revokeObjectURL(p.preview);
      return null;
    });
  }

  // 내 파일에서 고르기: 이 기기에서 줄여 두고 조정 창을 연다(아직 안 올림)
  async function upload(f: File | undefined) {
    if (!f) return;
    setNote(null);
    if (f.size > MAX_SOURCE) return setNote({ tone: "bad", text: "원본 사진이 너무 커요(30MB까지)." });
    setBusy(true);
    try {
      const { full, thumb } = await shrink(f);
      dropPending();
      setPending({ kind: "file", full: full.blob, thumb: thumb.blob, preview: URL.createObjectURL(full.blob) });
      setAdjust({ x: 50, y: 50 });
    } catch {
      setNote({ tone: "bad", text: "이 기기에서 열 수 없는 사진이에요. 다른 사진을 골라 주세요." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openGallery() {
    setGalleryOpen(true);
    setGallery(null);
    const r = await api<{ photos: { id: string; eventName: string; likes: number; url: string }[] }>(`/api/admin/covers/photos?${q}`);
    if (!r.ok) { setGalleryOpen(false); return setNote({ tone: "bad", text: r.error }); }
    setGallery(r.data.photos);
  }
  // 회원 사진에서 고르기: 고른 사진으로 조정 창을 연다(아직 안 바꿈)
  function pickPhoto(p: { id: string; url: string }) {
    dropPending();
    setGalleryOpen(false);
    setPending({ kind: "photo", photoId: p.id, preview: p.url });
    setAdjust({ x: 50, y: 50 });
  }

  async function remove() {
    if (!window.confirm("대표사진을 지울까요?")) return;
    setBusy(true);
    const r = await api<{ url: string }>(`/api/admin/covers?${q}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setUrl("");
    setNote({ tone: "info", text: "대표사진을 지웠어요." });
  }

  // 조정 창 "저장": 새 사진이면 먼저 올리고(지금 대표사진이 바뀜), 그다음 보일 중심점을 저장한다
  async function saveFocus() {
    if (!adjust) return;
    setBusy(true);
    if (pending) {
      let ok = false;
      let err = "사진을 올리지 못했어요.";
      if (pending.kind === "file") {
        const fd = new FormData();
        fd.append("scope", scope);
        if (scope !== "org") fd.append("name", club ?? "");
        fd.append("file", new File([pending.full], "cover.jpg", { type: "image/jpeg" }));
        fd.append("thumb", new File([pending.thumb], "thumb.jpg", { type: "image/jpeg" }));
        const res = await fetch("/api/admin/covers", { method: "POST", body: fd, cache: "no-store" }).catch(() => null);
        const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "연결이 불안정해요. 잠시 후 다시 눌러 주세요." };
        ok = !!res?.ok;
        if (!ok) err = data.error ?? err;
      } else {
        const r = await api(`/api/admin/covers/photos`, { body: { scope, name: club ?? "", photoId: pending.photoId } });
        ok = r.ok;
        if (!r.ok) err = r.error;
      }
      if (!ok) {
        setBusy(false);
        return setNote({ tone: "bad", text: err });
      }
    }
    const r = await api<{ url: string }>(`/api/admin/covers`, { method: "PATCH", body: { scope, name: club ?? "", focus: adjust } });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setUrl(r.data.url);
    setNote({ tone: "info", text: pending ? "새 대표사진을 저장했어요." : "보이는 영역을 저장했어요. 모든 화면에서 고른 곳을 중심으로 보여요." });
    dropPending();
    setAdjust(null);
  }
  // 조정 창 "취소"·닫기: 새로 고른 사진은 올리지 않고 버린다(지금 대표사진 그대로)
  function cancelAdjust() {
    if (pending) setNote({ tone: "info", text: "새 사진을 올리지 않았어요. 대표사진은 그대로예요." });
    dropPending();
    setAdjust(null);
  }

  // 조정 창의 사진 위를 누르거나 끌면 그 자리가 중심점
  function pick(e: React.PointerEvent) {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    setAdjust({ x: Math.round(x), y: Math.round(y) });
  }
  const base = (url ?? "").replace(/#.*$/, "");
  const adjSrc = pending?.preview ?? base; // 조정 창에 보일 사진

  return (
    <section className="card" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>{title}</b>
      <span className="small">{help}</span>
      {/* 넓으면 사진 오른쪽에 버튼(세로), 휴대폰 폭이면 사진 가운데 + 버튼 두 개 같은 크기 한 줄(globals.css .cover-row) */}
      <div className="cover-row">
        <div className="cover-box" onDoubleClick={() => url && setAdjust(cur)} title={url ? "더블클릭해서 보이는 영역 조정" : undefined} style={{ cursor: url ? "zoom-in" : undefined, position: "relative" }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={base} alt={`${title} 미리보기`} style={{ objectPosition: focusPos(url) }} />
          ) : (
            <span className="small">{url === null ? "불러오는 중…" : "아직 없어요"}</span>
          )}
          {/* 지우기: 사진 위 휴지통 아이콘 */}
          {url && (
            <button type="button" className="ph-act cover-del" disabled={busy} aria-label={`${title} 지우기`} title="지우기"
              onClick={(e) => { e.stopPropagation(); remove(); }} onDoubleClick={(e) => e.stopPropagation()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
            </button>
          )}
        </div>
        <div className="cover-acts">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          {/* 사진 업로드: (있으면 지금 사진이 지워진다는 확인 뒤) 회원 사진에서 고르기 / 내 파일에서 고르기 */}
          <button type="button" className="btn" style={{ minHeight: 44 }} disabled={busy || url === null} aria-haspopup="dialog"
            onClick={() => { if (url && !window.confirm("새 사진을 올리면 지금 대표사진은 지워져요. 계속할까요?")) return; setChoose(true); }}>
            {busy && !adjust ? "준비하는 중…" : "사진 업로드"}
          </button>
          {url && <button type="button" className="btn white" style={{ minHeight: 44 }} disabled={busy} onClick={() => setAdjust(cur)}>보이는 영역 조정</button>}
        </div>
      </div>
      <Popup id={`cover-choose-${scope}`} width={420} title="사진 업로드" open={choose} onClose={() => setChoose(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" className="btn white" style={{ minHeight: 52 }} onClick={() => { setChoose(false); openGallery(); }}>회원 사진에서 고르기</button>
          <button type="button" className="btn white" style={{ minHeight: 52 }} onClick={() => { setChoose(false); fileRef.current?.click(); }}>내 파일에서 고르기</button>
        </div>
      </Popup>
      {url && <span className="hint">사진을 더블클릭하면 보일 부분을 고를 수 있어요.</span>}
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <Popup id={`cover-gallery-${scope}`} width={680} title="회원 사진에서 고르기" open={galleryOpen} onClose={() => setGalleryOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="small">
            {scope === "event" ? "이 일정 사진첩" : scope === "club" ? "이 클럽 일정들의 사진첩" : "모든 일정의 사진첩"}에 회원이 올린 사진이에요(좋아요 많은 순). 누르면 바로 대표사진이 돼요.
          </span>
          {gallery === null && <p className="small">불러오는 중이에요…</p>}
          {gallery && gallery.length === 0 && <div className="msg info">아직 회원이 올린 사진이 없어요. “사진 업로드 › 내 파일에서 고르기”로 올려 주세요.</div>}
          {gallery && gallery.length > 0 && (
            <div className="cover-gallery">
              {gallery.map((p) => (
                <button key={p.id} type="button" disabled={busy} onClick={() => pickPhoto(p)} aria-label={`${p.eventName} 사진${p.likes ? ` 좋아요 ${p.likes}` : ""} 대표사진으로`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" loading="lazy" />
                  <span className="cg-meta">{scope !== "event" && <span className="cg-ev">{p.eventName}</span>}{p.likes > 0 && <span>♥ {p.likes}</span>}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Popup>

      <Popup id={`cover-adjust-${scope}`} width={640} title="보이는 영역 조정" open={!!adjust && (!!url || !!pending)} onClose={cancelAdjust}>
        {adjust && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="small">사진에서 <b>꼭 보여야 할 곳</b>(얼굴·건물 등)을 누르거나 끌어 주세요. 칸 모양이 달라도 그곳을 중심으로 보여요.</span>
            <div ref={boxRef} className="focus-pick"
              onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pick(e); }}
              onPointerMove={(e) => dragging.current && pick(e)}
              onPointerUp={() => { dragging.current = false; }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={adjSrc} alt="" draggable={false} />
              <span className="focus-dot" style={{ left: `${adjust.x}%`, top: `${adjust.y}%` }} aria-hidden="true" />
            </div>
            <span className="small">이렇게 보여요</span>
            <div className="focus-previews">
              {SHAPES.map((s) => (
                <figure key={s.label}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={adjSrc} alt="" style={{ aspectRatio: s.ratio, objectPosition: `${adjust.x}% ${adjust.y}%` }} />
                  <figcaption>{s.label}</figcaption>
                </figure>
              ))}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn white" style={{ width: "auto", minWidth: 120 }} onClick={() => setAdjust({ x: 50, y: 50 })}>가운데로</button>
              <span className="grow" />
              <button type="button" className="btn white" style={{ width: "auto", minWidth: 100 }} onClick={cancelAdjust}>취소</button>
              <button type="button" className="btn" style={{ width: "auto", minWidth: 120 }} disabled={busy} onClick={saveFocus}>{busy ? "저장하는 중…" : "저장"}</button>
            </div>
          </div>
        )}
      </Popup>
    </section>
  );
}
