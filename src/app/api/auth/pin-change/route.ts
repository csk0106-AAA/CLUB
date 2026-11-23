import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { failClear, failRecord, failWait, pinActive, pinProblem, pinsOf, savePin, verifyPin, waitText } from "@/lib/pin";
import { getStore } from "@/lib/store";

const body = z.object({ current: z.string().max(20), pin: z.string().max(20) });

// 로그인 PIN 바꾸기: 지금 PIN 을 확인한 뒤 새 PIN 으로
export async function POST(req: Request) {
  if (!pinActive()) return NextResponse.json({ error: "로그인 PIN 은 아직 쓰지 않아요." }, { status: 409 });
  const g = await guard();
  if ("err" in g) return g.err;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("PIN 을 확인해 주세요.");
  const key = `change:${g.s.mid}`;
  const wait = await failWait(key);
  if (wait > 0) return bad(waitText(wait), 429);
  const pins = await pinsOf(g.s.mid);
  if (pins.member && !verifyPin(p.data.current, pins.member)) {
    await failRecord(key);
    return bad("지금 PIN 이 맞지 않아요.", 401);
  }
  const me = await (await getStore()).get("Members", g.s.mid);
  const why = pinProblem(p.data.pin, me?.phone ?? "");
  if (why) return bad(why);
  const err = await savePin(g.s.mid, "member", p.data.pin);
  if (err) return bad(err);
  await failClear(key);
  return NextResponse.json({ ok: true });
}
