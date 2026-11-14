import { z } from "zod";
import { ADMIN_PERMS } from "./api";

export const EVENT_TYPES = ["전체정기모임", "워크숍", "소모임"] as const;

// 소모임: [{name, role}] — role 이 비어 있으면 일반 소모임 회원
export const clubSeats = z.array(z.object({
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().max(40).default(""),
})).max(30);

export const memberBody = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.string().max(40).default(""),
  position: z.string().max(40).default(""),
  gender: z.string().max(10).default(""),
  company: z.string().max(80).default(""),
  title: z.string().max(40).default(""),
  birth: z.string().max(20).default(""),
  phone: z.string().max(30).default(""),
  ageGroup: z.string().max(20).default(""),
  // 보내지 않으면 지금 값을 그대로 둔다(권한은 권한설정 화면에서 바꾼다).
  perms: z.array(z.enum(ADMIN_PERMS)).optional(),
  clubs: clubSeats.optional(),
});

// 소모임 목록을 저장용 JSON 으로(같은 소모임은 한 번만)
export function clubsJson(seats: { name: string; role: string }[]): string {
  const seen = new Set<string>();
  const out = seats.filter((c) => !seen.has(c.name) && seen.add(c.name)).map((c) => ({ name: c.name, role: c.role }));
  return out.length ? JSON.stringify(out) : "";
}
