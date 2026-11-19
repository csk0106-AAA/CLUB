import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 한 일정의 파일 목록(내용 data 는 빼고 읽는다 — 목록을 볼 때마다 파일 내용을 모두 내려받지 않게)
let sql: ReturnType<typeof neon> | null = null;
export async function listEventFileMeta(eventId: string): Promise<Row[]> {
  const s = await getStore();
  const url = process.env.DATABASE_URL;
  if (url) {
    sql ??= neon(url);
    const rows = (await sql.query(`SELECT data - 'data' AS data FROM app_rows WHERE tab = 'EventFiles' AND data->>'eventId' = $1 ORDER BY seq`, [eventId])) as { data: Row }[];
    return rows.map((r) => r.data);
  }
  return (await s.list("EventFiles")).filter((r) => r.eventId === eventId);
}

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
