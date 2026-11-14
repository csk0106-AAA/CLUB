import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard, parseJson } from "@/lib/api";
import { avatarView } from "@/lib/avatar";
import { memberGenderPatch, withSelfEdits } from "@/lib/gender-edit";
import { getLists, memberClubs } from "@/lib/lists";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { mergePrefs, prefsInput, readPrefs } from "@/lib/prefs";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Member = { id?: string; perms?: string; position?: string; avatar?: string; gender?: string; company?: string; title?: string; phone?: string; clubs?: string; prefs?: string; extra?: string };
type Sess = { name: string; perms: string[]; admin: boolean };

async function view(s: Sess, me: Member) {
  const extra = parseJson<{ consentAt?: string }>(me.extra, {});
  const { clubs } = await getLists();
  return {
    name: s.name,
    perms: s.perms,
    // 지금 DB 기준 권한(권한 그룹·직책 반영). 화면에서 버튼을 보일지 정할 때 쓴다(실제 작업은 서버가 다시 확인).
    livePerms: effectivePerms(me as Parameters<typeof effectivePerms>[0], await getPermGroups()),
    admin: s.admin,
    consent: Boolean(extra.consentAt),
    gender: me.gender === "남" || me.gender === "여" ? me.gender : "",
    company: me.company ?? "",
    title: me.title ?? "",
    phone: me.phone ?? "",
    clubs: memberClubs(me),
    clubOptions: clubs,
    prefs: readPrefs(me.prefs),
    avatar: avatarView(me),
  };
}

export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!me) return NextResponse.json({ error: "회원 정보를 찾을 수 없어요." }, { status: 401 });
  return NextResponse.json(await view(g.s, me));
}

// 휴대폰 번호: 숫자 10~11자리 → "010-1234-5678" (02 지역번호는 "02-1234-5678")
function formatPhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  if (d.startsWith("02")) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : null;
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

// 내 정보 고치기: 성별, 회사명·직책, 휴대폰 번호(=다음 로그인부터 초대코드가 뒷자리 4자리로 바뀜), 소모임, 개인 설정(prefs).
// 보낸 항목만 바꾼다. 성별·회사명·직책·연락처·소모임을 바꾸면 관리자에게 보이도록 extra 에 "회원 수정" 기록을 남긴다.
const patch = z
  .object({
    gender: z.enum(["남", "여"]),
    company: z.string().trim().max(60, "회사명은 60자까지 적을 수 있어요."),
    title: z.string().trim().max(40, "직책은 40자까지 적을 수 있어요."),
    phone: z.string().max(30),
    clubs: z.array(z.string().trim().min(1).max(40)).max(30),
    prefs: prefsInput,
  })
  .partial()
  .strict();

export async function PATCH(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // 직접 적어 둔 한국어 안내가 있으면 그것을, 아니면 일반 안내를 보여 준다
    const ko = parsed.error.issues.find((i) => /[가-힣]/.test(i.message));
    return bad(ko?.message ?? "입력한 내용을 다시 확인해 주세요.");
  }
  const d = parsed.data;
  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!me) return bad("회원 정보를 찾을 수 없어요.", 404);

  const upd: Record<string, string> = {};
  const edits: Parameters<typeof withSelfEdits>[1] = [];
  let extra = me.extra;

  if (d.gender !== undefined && me.gender !== d.gender) {
    const gp = memberGenderPatch({ gender: me.gender, extra }, d.gender);
    upd.gender = gp.gender;
    extra = gp.extra;
  }
  for (const f of ["company", "title"] as const) {
    const v = d[f];
    if (v !== undefined && v !== (me[f] ?? "")) {
      upd[f] = v;
      edits.push({ field: f, fromNow: me[f] ?? "", to: v });
    }
  }
  if (d.phone !== undefined) {
    const p = formatPhone(d.phone);
    if (!p) return bad("휴대폰 번호는 숫자 10~11자리로 적어 주세요.");
    if (p !== (me.phone ?? "")) {
      upd.phone = p;
      edits.push({ field: "phone", fromNow: me.phone ?? "", to: p });
    }
  }
  if (d.clubs !== undefined) {
    const cur = memberClubs(me);
    const names = [...new Set(d.clubs)];
    const { clubs: options } = await getLists();
    const unknown = names.filter((n) => !options.includes(n) && !cur.some((c) => c.name === n));
    if (unknown.length) return bad(`목록에 없는 소모임이에요: ${unknown.join(", ")}`);
    // 새 소모임 가입은 직접 못 한다: 소모임 임원 승인(가입 신청, /api/club-requests)을 거친다. 여기서는 빼기만.
    const added = names.filter((n) => !cur.some((c) => c.name === n));
    if (added.length) return bad("소모임 가입은 ‘+ 소모임 가입 신청’으로 신청하면 소모임 임원이 승인해요.", 403);
    const dropped = cur.filter((c) => c.role && !names.includes(c.name));
    if (dropped.length) return bad("소모임 직책이 있는 소모임은 관리자에게 변경을 요청해 주세요.");
    const next = names.map((n) => ({ name: n, role: cur.find((c) => c.name === n)?.role ?? "" }));
    const label = (l: { name: string }[]) => l.map((c) => c.name).join(", ");
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      upd.clubs = JSON.stringify(next);
      if (label(next) !== label(cur)) edits.push({ field: "clubs", fromNow: label(cur), to: label(next) });
    }
  }
  if (d.prefs !== undefined) {
    const next = JSON.stringify(mergePrefs(readPrefs(me.prefs), d.prefs));
    if (next !== me.prefs) upd.prefs = next;
  }

  if (edits.length) extra = withSelfEdits(extra, edits);
  if (extra !== me.extra) upd.extra = extra ?? "";
  const after = { ...me, ...upd };
  if (Object.keys(upd).length) await s.update("Members", me.id, upd);
  return NextResponse.json(await view(g.s, after));
}
