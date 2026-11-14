import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { removeMemberPhotos } from "@/lib/avatar";
import { withGenderEdit } from "@/lib/gender-edit";
import { fieldValues, withFields } from "@/lib/member-fields";
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
  const { fields, perms, clubs, ...d } = parsed.data;

  const s = await getStore();
  const all = await s.list("Members");
  const cur = all.find((m) => m.id === id);
  if (!cur) return bad("회원을 찾을 수 없어요.", 404);

  // perms·clubs 를 보내지 않으면 지금 값을 그대로 둔다.
  const patch: Record<string, string> = { ...d };
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
  return NextResponse.json({ member: row });
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
