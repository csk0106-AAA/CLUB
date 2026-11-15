import { z } from "zod";

// 개발 요청(템플릿 편집기의 "AI에게 요청"에서 지금 기능으로 안 되는 것을 개발자에게 남긴다)
export const DEV_STATUSES = ["접수", "진행 중", "완료", "보류"] as const;
export type DevStatus = (typeof DEV_STATUSES)[number];

export const devRequestInput = z.object({
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(4000),
  why: z.string().trim().max(2000).default(""),
  templateId: z.string().max(64).default(""),
  eventId: z.string().max(64).default(""),
});

export type DevRequest = {
  id: string; templateId: string; eventId: string; title: string; detail: string; why: string;
  requestedBy: string; status: DevStatus; createdAt: string; updatedAt: string;
  templateName?: string; eventName?: string;
};
