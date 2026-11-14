"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, CHARACTERS, type AvatarView } from "./Avatars";
import { Popup } from "./Popup";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 설정 > 내 정보 맨 위 "프로필 사진": 지금 사진(크게) + 바꾸기. 바꾸기 창에서 캐릭터를 고르거나 사진을 올린다.
// 사진은 이 기기에서 가운데를 정사각형으로 잘라 256×256 JPEG 로 다시 그려 올린다(위치 정보 같은 EXIF 는 따라가지 않는다).

const OUT = 256;
const MAX_SOURCE = 20 * 1024 * 1024; // 고르는 원본 사진 크기 한도(줄인 뒤 올리는 파일은 2MB 까지)
const ACCEPT = "image/jpeg,image/png,image/webp";

async function squareJpeg(file: File): Promise<Blob> {
  let src: CanvasImageSource & { width: number; height: number };
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // createImageBitmap 을 못 쓰는 브라우저
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      src = img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const side = Math.min(src.width, src.height);
  if (!side) throw new Error("empty");
  const c = document.createElement("canvas");
  c.width = OUT;
  c.height = OUT;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff"; // 투명한 PNG 는 흰 바탕으로
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, OUT, OUT);
  if ("close" in src && typeof src.close === "function") src.close();
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.88));
  if (!blob) throw new Error("encode");
  return blob;
}

const tabBtn = (on: boolean) => ({
  flex: 1, minHeight: 44, borderRadius: 12, cursor: "pointer",
  border: `2px solid ${on ? "var(--blue)" : "var(--line)"}`,
  background: on ? "var(--blue-bg)" : "var(--card)", color: on ? "var(--blue-t)" : "var(--ink)",
  font: `700 ${fs(16)} var(--body)`,
}) as const;

export function AvatarPicker({ name, avatar, onChange }: { name: string; avatar: AvatarView; onChange: (a: AvatarView, text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"character" | "photo">("character");
  const [pick, setPick] = useState<string>("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // 미리보기 주소는 바뀌거나 창이 닫히면 풀어 준다
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  function start() {
    setTab(avatar?.type === "photo" ? "photo" : "character");
    setPick(avatar?.type === "character" ? avatar.key : "");
    setPhoto(null);
    setErr("");
    setOpen(true);
  }
  const curKey = avatar?.type === "character" ? avatar.key : "";
  const dirty = (tab === "character" && pick !== "" && pick !== curKey) || (tab === "photo" && photo !== null);

  async function choose(f: File | undefined) {
    setErr("");
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) return setErr("jpg, png, webp 사진만 고를 수 있어요.");
    if (f.size > MAX_SOURCE) return setErr("사진이 너무 커요. 20MB보다 작은 사진을 골라 주세요.");
    try {
      const blob = await squareJpeg(f);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setErr("이 사진은 열 수 없어요. 다른 사진을 골라 주세요.");
    }
  }

  async function save() {
    setErr("");
    setBusy(true);
    try {
      if (tab === "character") {
        const r = await api<{ avatar: AvatarView }>("/api/me/avatar", { method: "PUT", body: { type: "character", key: pick } });
        if (!r.ok) return setErr(r.error);
        onChange(r.data.avatar, "프로필을 캐릭터로 바꿨어요.");
      } else if (photo) {
        const fd = new FormData();
        fd.append("file", new File([photo.blob], "avatar.jpg", { type: "image/jpeg" }));
        const res = await fetch("/api/me/avatar/photo", { method: "POST", body: fd, cache: "no-store" }).catch(() => null);
        const data = res ? ((await res.json().catch(() => ({}))) as { avatar?: AvatarView; error?: string }) : {};
        if (!res) return setErr("연결이 불안정해요. 잠시 후 다시 눌러 주세요.");
        if (!res.ok) return setErr(data.error ?? "사진을 올리지 못했어요.");
        onChange(data.avatar ?? null, "프로필 사진을 바꿨어요.");
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("프로필을 기본 모양으로 되돌릴까요? 올린 사진은 지워져요.")) return;
    setBusy(true);
    const r = await api("/api/me/avatar", { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onChange(null, "프로필을 기본으로 되돌렸어요.");
    setOpen(false);
  }

  return (
    <div className="row" style={{ gap: 14 }}>
      <Avatar member={{ name, avatar }} size={72} fallback="mascot" label={`${name} 님의 프로필 사진`} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <span className="l" style={{ marginBottom: 0 }}>프로필 사진</span>
        <span className="small">{avatar?.type === "photo" ? "올린 사진" : avatar?.type === "character" ? `캐릭터 · ${CHARACTERS.find((c) => c.key === avatar.key)?.label ?? ""}` : "기본 모양"}</span>
      </div>
      <button className="btn white" type="button" aria-haspopup="dialog" onClick={start}
        style={{ width: "auto", minHeight: 44, fontSize: fs(16), flex: "none" }}>
        바꾸기
      </button>

      <Popup
        id="avatar" open={open} onClose={() => setOpen(false)} title="프로필 사진 바꾸기" dirty={dirty && !busy} width={520}
        footer={(
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <button className="btn white" type="button" disabled={busy || !avatar} onClick={reset}
              style={{ width: "auto", minHeight: 46, fontSize: fs(16) }}>
              기본으로
            </button>
            <button className="btn" type="button" disabled={busy || !dirty} onClick={save}
              style={{ width: "auto", minHeight: 46, fontSize: fs(17) }}>
              {busy ? "저장하는 중…" : "저장"}
            </button>
          </div>
        )}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="row" role="group" aria-label="프로필 종류" style={{ gap: 8 }}>
            <button type="button" aria-pressed={tab === "character"} style={tabBtn(tab === "character")} onClick={() => { setTab("character"); setErr(""); }}>캐릭터</button>
            <button type="button" aria-pressed={tab === "photo"} style={tabBtn(tab === "photo")} onClick={() => { setTab("photo"); setErr(""); }}>사진</button>
          </div>

          {tab === "character" ? (
            <div role="group" aria-label="캐릭터 고르기"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
              {CHARACTERS.map((c) => {
                const on = pick === c.key;
                return (
                  <button key={c.key} type="button" aria-pressed={on} onClick={() => setPick(c.key)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 4px", borderRadius: 14, cursor: "pointer",
                      border: `3px solid ${on ? "var(--blue)" : "var(--line)"}`, background: on ? "var(--blue-bg)" : "var(--card)",
                      color: on ? "var(--blue-t)" : "var(--ink)", font: `700 ${fs(14)} var(--body)`,
                    }}>
                    {c.render(56)}
                    {c.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              {photo ? (
                <img src={photo.url} alt="올릴 사진 미리보기" width={160} height={160} style={{ width: 160, height: 160, borderRadius: "50%", objectFit: "cover" }} />
              ) : avatar?.type === "photo" ? (
                <Avatar member={{ name, avatar }} size={160} label="지금 프로필 사진" />
              ) : (
                <div className="small" style={{ textAlign: "center" }}>사진을 고르면 가운데를 동그랗게 잘라 미리 보여 드려요.</div>
              )}
              <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
              <button className="btn white" type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                style={{ width: "auto", minHeight: 46, fontSize: fs(16) }}>
                {photo || avatar?.type === "photo" ? "다른 사진 고르기" : "사진 고르기"}
              </button>
              <span className="small" style={{ textAlign: "center" }}>jpg, png, webp 사진을 올릴 수 있어요. 로그인한 회원에게만 보여요.</span>
            </div>
          )}
          <div aria-live="polite" role="status">{err && <div className="msg bad">{err}</div>}</div>
        </div>
      </Popup>
    </div>
  );
}
