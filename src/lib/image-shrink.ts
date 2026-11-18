// 사진 줄이기(브라우저에서만): 원본을 긴 변 FULL px(원본용)·THUMB px(미리보기용) JPEG 로 다시 그린다.
// 다시 그리므로 위치 정보 같은 EXIF 는 따라가지 않는다. 일정 사진첩(components/EventPhotos.tsx)과 대표사진(components/CoverPicker.tsx)이 함께 쓴다.

export const FULL = 1600;
export const THUMB = 400;
export const MAX_FULL_BYTES = 1_500_000;
export const MAX_SOURCE = 30 * 1024 * 1024; // 고르는 원본 한 장

type Src = CanvasImageSource & { width: number; height: number };

async function decode(file: File): Promise<Src> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function draw(src: Src, max: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff"; // 투명한 PNG 는 흰 바탕으로
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok({ blob: b, w, h }) : no(new Error("encode"))), "image/jpeg", quality));
}

export async function shrink(file: File) {
  const src = await decode(file);
  try {
    let full = await draw(src, FULL, 0.85);
    if (full.blob.size > MAX_FULL_BYTES) full = await draw(src, FULL, 0.7);
    if (full.blob.size > MAX_FULL_BYTES) full = await draw(src, 1200, 0.7);
    const thumb = await draw(src, THUMB, 0.75);
    return { full, thumb };
  } finally {
    if ("close" in src && typeof src.close === "function") src.close();
  }
}
