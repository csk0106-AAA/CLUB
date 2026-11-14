import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 휴대폰 알림 구독. 알림 설정에서 "알림 ON" 을 켜면 화면이 브라우저 구독을 만들어 여기로 보낸다.
const sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const subs = (await (await getStore()).list("PushSubs")).filter((x) => x.memberId === g.s.mid);
  return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "", subscribed: subs.length > 0 });
}

export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("알림 구독 정보를 확인해 주세요.");
  const s = await getStore();
  const all = await s.list("PushSubs");
  const same = all.find((x) => x.endpoint === parsed.data.endpoint);
  const row = { memberId: g.s.mid, endpoint: parsed.data.endpoint, keys: JSON.stringify(parsed.data.keys), createdAt: new Date().toISOString() };
  // 같은 기기를 다른 회원이 쓰게 되면 새 회원으로 바꾼다.
  if (same) await s.update("PushSubs", same.id, row);
  else await s.insert("PushSubs", row);
  return NextResponse.json({ ok: true });
}

const del = z.object({ endpoint: z.string().max(1000).optional() });

// 구독 해지: endpoint 를 주면 그 기기만, 없으면 내 모든 기기
export async function DELETE(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = del.safeParse(await req.json().catch(() => ({})));
  const endpoint = parsed.success ? parsed.data.endpoint : undefined;
  const s = await getStore();
  for (const x of await s.list("PushSubs")) {
    if (x.memberId === g.s.mid && (!endpoint || x.endpoint === endpoint)) await s.remove("PushSubs", x.id);
  }
  return NextResponse.json({ ok: true });
}
