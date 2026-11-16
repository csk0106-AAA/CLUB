import { NextResponse } from "next/server";
import { z } from "zod";
import { bad } from "@/lib/api";
import { lockedFor, recordFail } from "@/lib/auth";
import { appHandlers, startKind, type AppType } from "@/lib/member-apps";
import { uniqueName } from "@/lib/member-name";
import { formatPhone, phoneDigits } from "@/lib/phone";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 로그인 화면 "회원 또는 참관 신청"(명단에 이름이 없는 분). 로그인 없이 부른다.
//  정회원 필수 조건(edu) 답, 이름(실명)·전화번호, 비이수자는 추천인(1명 이상)을 받아
//  회원 명단에 바로 등록하고(로그인 가능, "승인 전") 회원신청관리에 신청을 남긴다(lib/member-apps.ts).
//  초대코드(로그인 번호)는 전화번호 뒷자리 4자리.
const body = z.object({
  edu: z.boolean(),
  type: z.enum(["member", "observe"]),
  name: z.string().trim().min(2, "이름(실명)을 적어 주세요.").max(20, "이름은 20자까지 적을 수 있어요."),
  phone: z.string().trim().max(30),
  recommenders: z.string().trim().max(200, "추천인은 200자까지 적을 수 있어요.").default(""),
  message: z.string().trim().max(300, "남길 말은 300자까지 적을 수 있어요.").default(""),
});

export async function POST(req: Request) {
  // 같은 곳에서 1분에 5번까지만(마구 등록 막기)
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const key = `apply:${ip}`;
  const wait = lockedFor(key);
  if (wait > 0) return bad(`잠시 후 다시 시도해 주세요. (${wait}초)`, 429);
  recordFail(key);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const ko = parsed.error.issues.find((i) => /[가-힣]/.test(i.message));
    return bad(ko?.message ?? "입력한 내용을 다시 확인해 주세요.");
  }
  const d = parsed.data;
  const phone = formatPhone(d.phone);
  if (!phone) return bad("전화번호는 숫자 10~11자리로 적어 주세요.");
  if (!d.edu && !d.recommenders.replace(/[\s,]/g, "")) return bad("추천인을 1명 이상 적어 주세요.");

  const s = await getStore();
  const members = await s.list("Members");
  const digits = phoneDigits(phone);
  // 이미 등록된 전화번호면 새로 만들지 않는다(같은 사람이 두 번 신청하거나 명단에 이미 있는 경우)
  // (누구의 번호인지는 알려 주지 않는다)
  if (members.some((m) => phoneDigits(m.phone) === digits)) {
    return bad("이미 등록된 전화번호예요. 로그인 화면에서 내 이름을 고르고 전화번호 뒷자리 4자리로 들어가 주세요. 들어가지지 않으면 관리자에게 문의해 주세요.", 409);
  }

  const type = d.type as AppType;
  const name = uniqueName(d.name, members.map((m) => m.name ?? ""));
  const no = String(members.reduce((n, m) => Math.max(n, Number(m.no) || 0), 0) + 1);
  const member = await s.insert("Members", {
    no, name, kind: startKind(d.edu, type), phone, edu: d.edu ? "true" : "", perms: "", clubs: "", extra: "",
  });
  await s.insert("MemberApps", {
    memberId: member.id, name, phone, type, edu: d.edu ? "yes" : "no", recommenders: d.edu ? "" : d.recommenders,
    message: d.message, source: "signup", status: "pending", reason: "", createdAt: new Date().toISOString(),
    handledBy: "", handledAt: "", fromKind: "", toKind: "", resultSeen: "",
  });
  try {
    await pushTo(await appHandlers(members), "alerts");
  } catch (e) {
    console.error("[push] 회원 신청 알림 실패", e);
  }
  // 동명이인이면 이름 뒤에 알파벳이 붙는다(로그인 화면에서 이 이름을 고른다)
  return NextResponse.json({ ok: true, name, renamed: name !== d.name });
}
