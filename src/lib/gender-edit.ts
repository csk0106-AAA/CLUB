import { parseJson } from "./api";

// 회원이 직접 성별을 바꾸면(또는 비어 있던 성별을 처음 정하면) 회원 extra.genderEdit 에 기록을 남긴다.
// 관리자 회원 명단에 "회원 수정" 표시로 보이고, 관리자가 확인하면 지운다. extra 의 다른 값(동의 시각, 추가 항목)은 그대로 둔다.
export type GenderEdit = { from: string; to: string; at: string };

export function readGenderEdit(extra: string | undefined): GenderEdit | null {
  return parseJson<{ genderEdit?: GenderEdit }>(extra, {}).genderEdit ?? null;
}

export function withGenderEdit(extra: string | undefined, edit: GenderEdit | null): string {
  const cur = parseJson<Record<string, unknown>>(extra, {});
  if (edit) cur.genderEdit = edit;
  else delete cur.genderEdit;
  return JSON.stringify(cur);
}

// 회원이 성별을 바꿀 때 저장할 값: 새 성별 + 기록(이미 기록이 있으면 처음 값(from)은 유지)
export function memberGenderPatch(cur: { gender?: string; extra?: string }, to: string): { gender: string; extra: string } {
  const prev = readGenderEdit(cur.extra);
  const from = prev ? prev.from : cur.gender ?? "";
  // 관리자가 넣은 원래 값으로 되돌렸다면 기록을 지운다
  const edit = from === to ? null : { from, to, at: new Date().toISOString() };
  return { gender: to, extra: withGenderEdit(cur.extra, edit) };
}

// ── 성별 외 항목의 회원 직접 수정 기록 ──
// 회원이 설정에서 회사명·직책·연락처·소모임을 바꾸면 extra.selfEdits[항목] = {from, to, at} 로 남긴다(성별과 같은 규칙:
// 처음 값(from)은 유지하고, 원래 값으로 되돌리면 그 항목 기록을 지운다). 관리자 화면은 readSelfEdits 로 읽어 "회원 수정"을 보여 줄 수 있다.
export type SelfEditField = "gender" | "company" | "title" | "phone" | "clubs";
export const SELF_EDIT_LABELS: Record<SelfEditField, string> = { gender: "성별", company: "회사명", title: "직책", phone: "연락처", clubs: "소모임" };
export type SelfEdits = Partial<Record<SelfEditField, GenderEdit>>;

// 성별 기록(genderEdit)까지 합쳐서 돌려준다. 없으면 빈 객체.
export function readSelfEdits(extra: string | undefined): SelfEdits {
  const x = parseJson<{ selfEdits?: SelfEdits; genderEdit?: GenderEdit }>(extra, {});
  const out: SelfEdits = { ...(x.selfEdits && typeof x.selfEdits === "object" ? x.selfEdits : {}) };
  if (x.genderEdit) out.gender = x.genderEdit;
  return out;
}

// 여러 항목의 새 값을 한 번에 기록한다. fromNow: 지금 저장된 값(기록이 없을 때 from 으로 씀)
export function withSelfEdits(
  extra: string | undefined,
  changes: { field: Exclude<SelfEditField, "gender">; fromNow: string; to: string }[],
): string {
  const cur = parseJson<Record<string, unknown>>(extra, {});
  const edits: SelfEdits = { ...((cur.selfEdits as SelfEdits | undefined) ?? {}) };
  const at = new Date().toISOString();
  for (const c of changes) {
    const prev = edits[c.field];
    const from = prev ? prev.from : c.fromNow;
    if (from === c.to) delete edits[c.field];
    else edits[c.field] = { from, to: c.to, at };
  }
  if (Object.keys(edits).length) cur.selfEdits = edits;
  else delete cur.selfEdits;
  return JSON.stringify(cur);
}

// 관리자가 확인했을 때: 성별 외 기록을 모두(또는 한 항목만) 지운다.
export function clearSelfEdits(extra: string | undefined, field?: Exclude<SelfEditField, "gender">): string {
  const cur = parseJson<Record<string, unknown>>(extra, {});
  if (field && cur.selfEdits && typeof cur.selfEdits === "object") {
    const edits = { ...(cur.selfEdits as SelfEdits) };
    delete edits[field];
    if (Object.keys(edits).length) cur.selfEdits = edits;
    else delete cur.selfEdits;
  } else delete cur.selfEdits;
  return JSON.stringify(cur);
}
