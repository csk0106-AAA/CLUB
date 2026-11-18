import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { ageGroupOf, tidyBirth } from "@/lib/age-group";
import { readFields, withFields } from "@/lib/member-fields";
import { uniqueName } from "@/lib/member-name";
import { tidyPhone } from "@/lib/phone";
import { checkPermChange, getPermGroups, isAllNow } from "@/lib/perms";
import { getStore } from "@/lib/store";

// 엑셀로 받은 회원정보를 고쳐 올렸을 때: 회원ID 가 있는 줄은 그 회원의 정보를 고친다(회원 수정과 같은 규칙).
//  보낸 항목만 바꾼다. 빈 칸은 "지움"(받은 파일에 원래 값이 있었으므로). 관리자 권한·클럽은 여기서 바꾸지 않는다.
//  추가 항목(fields)은 보낸 항목만 바꾸고 나머지는 그대로 둔다.
const row = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1, "성명이 빈 줄이 있어요.").max(40).optional(),
  kind: z.string().trim().max(40).optional(),
  position: z.string().trim().max(40).optional(),
  gender: z.string().trim().max(10).optional(),
  company: z.string().trim().max(80).optional(),
  title: z.string().trim().max(40).optional(),
  birth: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(30).optional(),
  edu: z.boolean().optional(),
  memo: z.string().trim().max(500).optional(),
  fields: z.record(z.string().max(200)).optional(),
});
const body = z.object({ rows: z.array(row).min(1).max(2000) });

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues.find((i) => /[가-힣]/.test(i.message))?.message ?? "고칠 내용을 확인해 주세요.");

  const s = await getStore();
  const all = await s.list("Members");
  const byId = new Map(all.map((m) => [m.id, m]));
  const names = new Map(all.map((m) => [m.id, (m.name ?? "").trim()]));
  const patches: { id: string; patch: Record<string, string> }[] = [];
  const renamed: { from: string; to: string }[] = [];
  const missing: string[] = [];

  for (const r of parsed.data.rows) {
    const cur = byId.get(r.id);
    if (!cur) { missing.push(r.name ?? r.id); continue; }
    const p: Record<string, string> = {};
    if (r.name !== undefined && r.name !== (cur.name ?? "").trim()) {
      // 다른 회원과 이름이 겹치면 알파벳을 붙인다(회원 수정과 같음)
      const others = [...names.entries()].filter(([id]) => id !== r.id).map(([, n]) => n);
      const nm = uniqueName(r.name, others);
      if (nm !== r.name) renamed.push({ from: r.name, to: nm });
      p.name = nm;
      names.set(r.id, nm);
    }
    for (const k of ["kind", "position", "gender", "company", "title", "memo"] as const) {
      if (r[k] !== undefined && r[k] !== (cur[k] ?? "")) p[k] = r[k]!;
    }
    if (r.gender !== undefined && p.gender !== undefined && !["", "남", "여"].includes(p.gender)) delete p.gender;
    if (r.birth !== undefined) {
      const b = tidyBirth(r.birth);
      if (b !== (cur.birth ?? "")) { p.birth = b; p.ageGroup = ageGroupOf(b) || cur.ageGroup || ""; }
    }
    if (r.phone !== undefined) {
      const ph = r.phone ? tidyPhone(r.phone) : "";
      if (ph !== (cur.phone ?? "")) p.phone = ph;
    }
    if (r.edu !== undefined && (cur.edu === "true") !== r.edu) p.edu = r.edu ? "true" : "";
    if (r.fields) {
      const before = readFields(cur);
      const next = { ...before, ...r.fields };
      if (JSON.stringify(Object.fromEntries(Object.entries(next).filter(([, v]) => v.trim()))) !== JSON.stringify(Object.fromEntries(Object.entries(before).filter(([, v]) => v.trim())))) {
        p.extra = withFields(cur.extra, next);
      }
    }
    if (Object.keys(p).length) patches.push({ id: r.id, patch: p });
  }

  // 직책이 바뀌어 권한이 달라지면 "모든 권한" 관리자만 할 수 있다(회원 수정과 같음)
  if (patches.length) {
    const groups = await getPermGroups();
    const after = all.map((m) => { const x = patches.find((q) => q.id === m.id); return x ? { ...m, ...x.patch } : m; });
    const err = checkPermChange(all, groups, after, groups, await isAllNow(g.s.mid));
    if (err) return bad(`${err[0]} (직책이 바뀐 회원이 있어요)`, err[1]);
  }
  for (const x of patches) await s.update("Members", x.id, x.patch);
  return NextResponse.json({ updated: patches.length, renamed, missing });
}
