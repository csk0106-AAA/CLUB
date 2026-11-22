import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { isGuest } from "@/lib/member-kind";
import { getSetting, getStore, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 명리학 풀이 다시 받기(lib/saju-run.ts sajuCanRedo)
//  once: 한 번만(기본, 설정 전에도 한 번만) / 다시 받기 허용(테스트 기간)
//  members: 풀이를 이미 받은 회원과, 관리자가 다시 받기를 허용했는지(retry) — 허용하면 한 번 더 받을 수 있고 다 받으면 다시 막힌다
export async function GET() {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const s = await getStore();
  const [members, profiles, settings] = await Promise.all([s.list("Members"), s.list("Profiles", { omit: ["draftMd", "introMd", "readingMd", "traitsMd"] }), s.list("Settings")]);
  const flag = (k: string) => settings.find((x) => x.id === k)?.value === "true";
  const used = members.filter((m) => !isGuest(m.kind)).flatMap((m) => {
    const st = profiles.find((p) => p.memberId === m.id)?.readingStatus ?? "";
    const got = flag(`sajuUsed:${m.id}`) || st === "done" || st.startsWith("part");
    return got ? [{ id: m.id, name: m.name, retry: flag(`sajuRetry:${m.id}`) }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return NextResponse.json({ once: await getSetting<boolean>("sajuOnce", true), members: used });
}

const body = z.union([
  z.object({ once: z.boolean() }),
  z.object({ memberId: z.string().min(1), retry: z.boolean() }),
]);

export async function PUT(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("요청을 확인해 주세요.");
  if ("once" in p.data) {
    await setSetting("sajuOnce", p.data.once);
    return NextResponse.json({ once: p.data.once });
  }
  await setSetting(`sajuRetry:${p.data.memberId}`, p.data.retry);
  return NextResponse.json({ memberId: p.data.memberId, retry: p.data.retry });
}
