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
