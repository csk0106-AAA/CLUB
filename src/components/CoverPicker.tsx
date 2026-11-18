"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { MAX_SOURCE, shrink } from "@/lib/image-shrink";

// 대표사진 올리기·바꾸기·지우기(관리자 › 모임설정 = scope "org", 클럽관리 › 개요 = scope "club" + 클럽 이름).
// 일정에 회원이 올린 사진이 없을 때 홈 다가오는 일정·타임라인·달력 카드에 이 사진이 보인다(lib/covers.ts).
// 사진은 이 기기에서 긴 변 1600px·400px JPEG 로 줄여 올린다(위치 정보 같은 EXIF 는 따라가지 않는다).
export function CoverPicker({ scope, club, title, help }: { scope: "org" | "club"; club?: string; title: string; help: string }) {
  const q = scope === "org" ? "scope=org" : `scope=club&name=${encodeURIComponent(club ?? "")}`;
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ url: string }>(`/api/admin/covers?${q}`).then((r) => (r.ok ? setUrl(r.data.url) : setNote({ tone: "bad", text: r.error })));
  }, [q]);

  async function upload(f: File | undefined) {
    if (!f) return;
    setNote(null);
    if (f.size > MAX_SOURCE) return setNote({ tone: "bad", text: "원본 사진이 너무 커요(30MB까지)." });
    setBusy(true);
    try {
      const { full, thumb } = await shrink(f);
      const fd = new FormData();
      fd.append("scope", scope);
      if (scope === "club") fd.append("name", club ?? "");
      fd.append("file", new File([full.blob], "cover.jpg", { type: "image/jpeg" }));
      fd.append("thumb", new File([thumb.blob], "thumb.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/admin/covers", { method: "POST", body: fd, cache: "no-store" }).catch(() => null);
      const data = res ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string }) : {};
      if (!res) return setNote({ tone: "bad", text: "연결이 불안정해요. 잠시 후 다시 눌러 주세요." });
      if (!res.ok) return setNote({ tone: "bad", text: data.error ?? "사진을 올리지 못했어요." });
      setUrl(data.url ?? "");
      setNote({ tone: "info", text: "대표사진을 저장했어요." });
    } catch {
      setNote({ tone: "bad", text: "이 기기에서 열 수 없는 사진이에요. 다른 사진을 골라 주세요." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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

  return (
    <section className="card" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>{title}</b>
      <span className="small">{help}</span>
      <div className="row" style={{ gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div className="cover-box">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`${title} 미리보기`} />
          ) : (
            <span className="small">{url === null ? "불러오는 중…" : "아직 없어요"}</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="btn" style={{ width: "auto", minWidth: 150, minHeight: 44 }} disabled={busy || url === null} onClick={() => fileRef.current?.click()}>
            {busy ? "올리는 중…" : url ? "사진 바꾸기" : "사진 올리기"}
          </button>
          {url && <button type="button" className="btn white" style={{ width: "auto", minWidth: 150, minHeight: 44 }} disabled={busy} onClick={remove}>지우기</button>}
        </div>
      </div>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
    </section>
  );
}
