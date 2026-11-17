import { NextResponse } from "next/server";
import type { Row } from "./store/types";

// 일정 준비목록 파일: 한 파일 4MB, 일정 하나에 20개까지. 형식은 게시판 첨부와 같다(lib/board.ts checkFileType).
export const MAX_EVENT_FILES = 20;
export type EventFileMeta = { id: string; name: string; type: string; size: number; uploadedBy: string; createdAt: string };

export const fileMeta = (r: Row, nameOf: (id: string) => string): EventFileMeta => ({
  id: r.id, name: r.name, type: r.type, size: Number(r.size) || 0, uploadedBy: r.uploadedBy ? nameOf(r.uploadedBy) : "", createdAt: r.createdAt ?? "",
});

const ascii = (name: string) => name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_") || "file";

// 내려받기 응답(사진도 파일로 내려받는다)
export function fileResponse(r: Row): NextResponse {
  const body = Buffer.from(r.data ?? "", "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": r.type || "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="${ascii(r.name)}"; filename*=UTF-8''${encodeURIComponent(r.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=600",
    },
  });
}
