import { z } from "zod";
import { parseJson } from "./api";
import type { Row } from "./store/types";

// 회원 명단의 추가 항목(열). 열 이름 목록은 설정(memberFields)에, 값은 회원 extra JSON 의 fields 에 저장한다.
export const MEMBER_FIELDS_KEY = "memberFields";
export const fieldValues = z.record(z.string().max(200)).optional();

export function readFields(m: Row): Record<string, string> {
  return parseJson<{ fields?: Record<string, string> }>(m.extra, {}).fields ?? {};
}

// extra 의 다른 값(동의 시각 등)은 그대로 두고 fields 만 바꾼다.
export function withFields(extra: string | undefined, fields: Record<string, string>): string {
  const cur = parseJson<Record<string, unknown>>(extra, {});
  const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  return JSON.stringify({ ...cur, fields: clean });
}
