import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { checkFileType, MAX_FILE_BYTES } from "@/lib/board";
import { fileMeta, listEventFileMeta, MAX_EVENT_FILES } from "@/lib/event-files";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 일정관리 › 준비목록 파일 목록(관리자·작성자·편집자)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [rows, members] = await Promise.all([listEventFileMeta(id), s.list("Members")]);
  const nameOf = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";
  const files = rows.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")).map((r) => fileMeta(r, nameOf));
  return NextResponse.json({ files });
}

// 파일 올리기 (multipart/form-data, 필드 이름 "file"). 한 파일 4MB, 일정 하나에 20개까지.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_FILE_BYTES + 64 * 1024) return bad("파일은 하나에 4MB까지 올릴 수 있어요.", 413);
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  if ((await listEventFileMeta(id)).length >= MAX_EVENT_FILES) return bad(`파일은 일정 하나에 ${MAX_EVENT_FILES}개까지 올릴 수 있어요.`);
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!f || typeof f === "string") return bad("파일을 골라 주세요.");
  if (f.size === 0) return bad("빈 파일이에요.");
  if (f.size > MAX_FILE_BYTES) return bad("파일은 하나에 4MB까지 올릴 수 있어요.", 413);
  const name = (f.name || "file").replace(/[\\/\r\n\t\0"]/g, "_").slice(-120);
  const kind = checkFileType(name, f.type);
  if (!kind) return bad("올릴 수 없는 파일 형식이에요. 사진(jpg, png, webp, gif)이나 문서(pdf, 오피스, hwp, zip, txt)만 올릴 수 있어요.");
  const buf = Buffer.from(await f.arrayBuffer());
  const row = await s.insert("EventFiles", {
    eventId: id, name, type: kind.type, size: String(buf.length), data: buf.toString("base64"), uploadedBy: g.s.mid, createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ file: fileMeta(row, () => g.s.name) });
}
