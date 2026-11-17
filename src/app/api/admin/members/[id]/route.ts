import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { removeMemberPhotos } from "@/lib/avatar";
import { withGenderEdit } from "@/lib/gender-edit";
import { fieldValues, withFields } from "@/lib/member-fields";
import { uniqueName } from "@/lib/member-name";
import { ageGroupOf, tidyBirth } from "@/lib/age-group";
import { tidyPhone } from "@/lib/phone";
import { checkPermChange, effectivePerms, getPermGroups, isAllNow } from "@/lib/perms";
import { getStore } from "@/lib/store";
import { clubsJson, memberBody } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = memberBody.extend({ fields: fieldValues }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const { fields, perms, clubs, edu, ...d } = parsed.data;

  const s = await getStore();
  const all = await s.list("Members");
  const cur = all.find((m) => m.id === id);
  if (!cur) return bad("회원을 찾을 수 없어요.", 404);

  // 이름을 바꿨는데 다른 회원과 같으면 뒤에 알파벳을 붙인다(김하늘 → 김하늘B). 이름이 그대로면 손대지 않는다.
  const asked = d.name.trim();
  const name = asked === (cur.name ?? "").trim() ? asked : uniqueName(asked, all.filter((m) => m.id !== id).map((m) => m.name ?? ""));
  // perms·clubs 를 보내지 않으면 지금 값을 그대로 둔다.
  const { memo, ...rest } = d;
  const patch: Record<string, string> = { ...rest, name };
  // 연령대는 생년월일이 있으면 자동(생년월일이 없을 때만 적은 값)
  patch.birth = tidyBirth(rest.birth); // 1970.1.1 · 700101 같은 모양도 1970-01-01 로
  patch.ageGroup = ageGroupOf(rest.birth) || rest.ageGroup;
  patch.phone = tidyPhone(rest.phone); // 숫자만 적어도 010-0000-0000 모양으로
  if (memo !== undefined) patch.memo = memo;
  if (edu !== undefined) patch.edu = edu ? "true" : "";
  if (perms) patch.perms = perms.join("|");
  if (clubs) patch.clubs = clubsJson(clubs);
  // fields 를 보내지 않으면 추가 항목 값은 그대로 둔다.
  // 회원 수정 화면에서 저장(fields 포함)하면 관리자가 성별을 확인한 것으로 보고 "회원 수정" 기록을 지운다.
  if (fields) patch.extra = withGenderEdit(withFields(cur.extra, fields), null);

  // 직책·소모임 직책·개인 권한이 바뀌어 최종 권한이 달라지면 "모든 권한" 관리자만 할 수 있고,
  // 모든 권한 회원이 한 명도 없게 되면 막는다.
  const groups = await getPermGroups();
  const after = all.map((m) => (m.id === id ? { ...m, ...patch } : m));
  const err = checkPermChange(all, groups, after, groups, await isAllNow(g.s.mid));
  if (err) return bad(err[0], err[1]);

  const row = await s.update("Members", id, patch);
  return NextResponse.json({ member: row, ...(name !== asked ? { renamed: { from: asked, to: name } } : {}) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  if (id === g.s.mid) return bad("내 계정은 지울 수 없어요.");
  const s = await getStore();
  const all = await s.list("Members");
  const cur = all.find((m) => m.id === id);
  if (!cur) return bad("회원을 찾을 수 없어요.", 404);
  const groups = await getPermGroups();
  if (effectivePerms(cur, groups).length > 0) return bad("권한이 있는 회원은 먼저 권한설정에서 권한을 없애거나 직책을 바꾼 뒤 지울 수 있어요.");
  await s.remove("Members", id);
  await removeMemberPhotos(id); // 프로필 사진도 함께 지운다
  return NextResponse.json({ ok: true });
}
