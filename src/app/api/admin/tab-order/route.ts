import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 관리 화면 위쪽 메뉴(탭) 순서. 관리자가 끌어서 바꾸면 모든 관리자에게 같은 순서로 보인다.
// page: 어느 화면의 메뉴인지(예: "event" = 관리자 › 일정 관리)
const page = z.string().regex(/^[a-z-]{1,30}$/);
const key = (p: string) => `tabOrder:${p}`;

export async function GET(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const p = page.safeParse(new URL(req.url).searchParams.get("page") ?? "");
  if (!p.success) return bad("화면을 확인해 주세요.");
  return NextResponse.json({ keys: await getSetting<string[]>(key(p.data), []) });
}

const body = z.object({ page, keys: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/)).max(40) });

export async function PUT(req: Request) {
  const g = await guard(["events", "clubs"]);
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("메뉴 순서를 확인해 주세요.");
  await setSetting(key(parsed.data.page), [...new Set(parsed.data.keys)]);
  return NextResponse.json({ ok: true });
}
