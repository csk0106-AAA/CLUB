import { NextResponse } from "next/server";
import { adminOrOfficer, bad } from "@/lib/api";
import { clubInfoInput, clubMembers, clubParam, readClubInfo, writeClubInfo } from "@/lib/clubs";
import { getLists } from "@/lib/lists";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

async function clubName(ctx: Ctx): Promise<string | null> {
  const name = clubParam((await ctx.params).name);
  return (await getLists()).clubs.includes(name) ? name : null;
}

// 관리자(회원정보 권한) 또는 이 클럽의 직책자만
async function clubGuard(ctx: Ctx) {
  const g = await adminOrOfficer("members");
  if ("err" in g) return g;
  const name = await clubName(ctx);
  if (!name) return { err: bad("클럽을 찾을 수 없어요. 회원 구분 화면에서 이름을 확인해 주세요.", 404) };
  if (!g.adminOk && !g.officerOf.includes(name)) return { err: bad("내가 직책을 맡은 클럽만 관리할 수 있어요.", 403) };
  return { ...g, name };
}

// 클럽 한 곳: 기본 정보, 회원(직책 포함), 회원 추가용 전체 명단, 클럽 직책 목록
//  canEditRoles: 클럽 직책을 바꿀 수 있는지(관리자만)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await clubGuard(ctx);
  if ("err" in g) return g.err;
  const { name } = g;
  const [info, lists, members] = await Promise.all([readClubInfo(name), getLists(), (await getStore()).list("Members")]);
  const roster = clubMembers(members, name).map((m) => ({ id: m.id, name: m.name, kind: m.kind, position: m.position, role: m.role }));
  const all = members
    .map((m) => ({ id: m.id, name: m.name, kind: m.kind, position: m.position }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return NextResponse.json({ name, info, roster, members: all, clubRoles: lists.clubRoles, canEditRoles: g.adminOk });
}

// 기본 정보 저장
export async function PUT(req: Request, ctx: Ctx) {
  const g = await clubGuard(ctx);
  if ("err" in g) return g.err;
  const parsed = clubInfoInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 회비는 숫자만 넣어 주세요.");
  await writeClubInfo(g.name, parsed.data);
  return NextResponse.json({ ok: true, info: parsed.data });
}
