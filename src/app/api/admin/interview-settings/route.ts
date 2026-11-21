import { NextResponse } from "next/server";
import { BASE_GUIDE } from "@/lib/ai-rules";
import { z } from "zod";
import { isAiEnabled } from "@/lib/ai";
import { AI_POINTS, pointKey } from "@/lib/ai-guides";
import { adminOrOfficer, bad, guard } from "@/lib/api";
import { DEFAULT_QUESTIONS, getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({
  questions: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  guidelines: z.string().trim().min(1).max(4000),
  followUpMax: z.number().int().min(0).max(12),
  // 지점별 추가 지침(비워도 됨). 보내지 않은 지점은 그대로 둔다.
  pointGuides: z.record(z.string(), z.string().trim().max(2000)).optional(),
});

// 인터뷰 필수 질문과 AI 지침. 모든 AI 호출의 지침에 포함된다.
export async function GET() {
  const g = await adminOrOfficer(["templates", "events"]);
  if ("err" in g) return g.err;
  return NextResponse.json({
    questions: await getSetting("interviewQuestions", DEFAULT_QUESTIONS),
    guidelines: BASE_GUIDE, // 기본 지침(코드, lib/ai-rules.ts). 활동 공통 지침이 비어 있을 때 쓴다
    followUpMax: await getSetting("followUpMax", 6),
    points: AI_POINTS,
    pointGuides: {}, // 세부 지침은 활동 템플릿에 적은 것만 쓴다(비어 있으면 없음)
    aiEnabled: isAiEnabled(),
  });
}

export async function PUT(req: Request) {
  const g = await guard("templates");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("질문은 1개 이상, 지침은 비어 있으면 안 돼요.");
  await setSetting("interviewQuestions", parsed.data.questions);
  await setSetting("aiGuidelines", parsed.data.guidelines);
  await setSetting("followUpMax", parsed.data.followUpMax);
  for (const p of AI_POINTS) {
    const v = parsed.data.pointGuides?.[p.key];
    if (v !== undefined) await setSetting(pointKey(p.key), v);
  }
  return NextResponse.json({ ok: true });
}
