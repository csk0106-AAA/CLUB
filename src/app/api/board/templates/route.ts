import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseJson } from "@/lib/api";
import { DATA_SCHEMA, isWriteForm, templateInput, zodMessage, type Template } from "@/lib/board";
import { getSetting, setSetting } from "@/lib/store";
import { forbid, getMe } from "../_lib/server";

export const dynamic = "force-dynamic";

const body = templateInput.extend({ form: z.string() });

// 양식의 기본 템플릿 저장: 관리자(all/board) + 관리자 2차 비밀번호 통과. 회칙 양식은 전체 관리자만.
// reset: true 면 기본값으로 되돌린다.
export async function PUT(req: Request) {
  const m = await getMe();
  if ("err" in m) return m.err;
  if (!m.me.tplAdmin) return forbid(m.me.manage ? "관리자 비밀번호를 먼저 확인해 주세요. (관리자 탭에서 확인할 수 있어요)" : "템플릿은 관리자만 바꿀 수 있어요.");
  const raw = await req.json().catch(() => null);
  const parsed = body.safeParse(raw);
  if (!parsed.success) return bad(zodMessage(parsed.error));
  const { form } = parsed.data;
  if (!isWriteForm(form)) return bad("양식을 골라 주세요.");
  if (form === "rules" && !m.me.isAll) return forbid("회칙 양식은 전체 관리자만 바꿀 수 있어요.");
  const saved = await getSetting<Record<string, Template>>("boardTemplates", {});
  if ((raw as { reset?: boolean })?.reset === true) {
    delete saved[form];
  } else {
    const d = DATA_SCHEMA[form].safeParse(parsed.data.data ?? {});
    if (!d.success) return bad(zodMessage(d.error, "양식 내용을 확인해 주세요."));
    saved[form] = { title: parsed.data.title, body: parsed.data.body, data: parseJson(JSON.stringify(d.data), {}) };
  }
  await setSetting("boardTemplates", saved);
  return NextResponse.json({ ok: true });
}
