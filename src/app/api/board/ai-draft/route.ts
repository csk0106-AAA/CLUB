import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, extractJson, isAiEnabled } from "@/lib/ai";
import { bad } from "@/lib/api";
import { FORM_LABEL, isWriteForm } from "@/lib/board";
import { buildRefContext, REF_KEYS } from "@/lib/board-ai-context";
import { getLists } from "@/lib/lists";
import { getMe } from "../_lib/server";

// 글쓰기 "AI에게 작성 요청하기": 요청 내용(과 지금 적은 제목·내용)으로 제목·내용 초안을 만들어 돌려준다.
// 저장은 하지 않는다. 회원이 초안을 보고 고친 뒤 직접 올린다.
const input = z.object({
  form: z.string(),
  request: z.string().trim().min(1, "AI에게 요청할 내용을 적어 주세요.").max(2000, "요청은 2000자까지 쓸 수 있어요."),
  title: z.string().max(100).optional().default(""),
  body: z.string().max(10000).optional().default(""),
  // 참고할 앱 정보(모임 정보·회비·회칙·일정)와 소모임 이름들
  refs: z.array(z.enum(REF_KEYS)).max(REF_KEYS.length).optional().default([]),
  clubs: z.array(z.string().trim().max(40)).max(10).optional().default([]),
});

export async function POST(req: Request) {
  const m = await getMe();
  if ("err" in m) return m.err;
  if (!m.me.canWrite) return bad("글은 관리자와 소모임 직책자만 쓸 수 있어요.", 403);
  if (!isAiEnabled()) return bad("AI 기능이 꺼져 있어요. 직접 작성해 주세요.", 503);

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues.find((i) => /[가-힣]/.test(i.message))?.message ?? "요청 내용을 확인해 주세요.");
  const { form, request, title, body, refs } = parsed.data;
  if (!isWriteForm(form)) return bad("양식을 먼저 골라 주세요.");
  const known = (await getLists()).clubs;
  const clubs = [...new Set(parsed.data.clubs)].filter((c) => known.includes(c));
  const ref = await buildRefContext(refs, clubs, m.me.row.id);

  const system = [
    "당신은 모임(원우회) 게시판 글을 대신 써 주는 편집자입니다. 반드시 한국어로 답하세요.",
    `글 양식: ${FORM_LABEL[form]}${form === "general" ? "" : " (설문·투표·퀴즈 항목은 따로 입력하므로, 내용에는 안내 글만 쓰세요)"}`,
    "회원들이 읽는 게시글답게 정중하고 읽기 쉽게, 필요하면 줄바꿈과 '-' 목록을 쓰세요. 마크다운 제목(#)이나 굵게(**)는 쓰지 마세요.",
    "요청과 [참고 정보]에 없는 날짜·장소·금액·사람 이름 같은 사실은 지어내지 말고 [ ] 로 비워 두세요.",
    "[참고 정보]는 관리자가 앱에 저장해 둔 실제 내용입니다. 요청과 관련된 부분은 정확히 그대로 옮겨 쓰고, 관련 없는 부분은 쓰지 마세요.",
    '답은 JSON 하나만: {"title": "제목(100자 이내)", "body": "내용"}',
  ].join("\n");
  const cur = title.trim() || body.trim() ? `\n\n[지금 적어 둔 글]\n제목: ${title.trim() || "(없음)"}\n내용:\n${body.trim() || "(없음)"}` : "";
  const refText = ref ? `\n\n[참고 정보]\n${ref}` : "";
  const out = await ask(system, [{ role: "user", content: `[요청]\n${request}${cur}${refText}` }], 3000);
  const j = extractJson(out) as { title?: unknown; body?: unknown } | null;
  const draftBody = typeof j?.body === "string" ? j.body.trim() : "";
  if (!draftBody) return bad("AI가 초안을 만들지 못했어요. 잠시 뒤 다시 요청하거나 직접 작성해 주세요.", 502);
  const draftTitle = typeof j?.title === "string" ? j.title.trim().slice(0, 100) : "";
  return NextResponse.json({ title: draftTitle, body: draftBody.slice(0, 10000) });
}
